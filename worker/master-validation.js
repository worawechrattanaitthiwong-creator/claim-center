import {
  MASTER_ARTICLE_COLUMN_COUNT,
  assertMasterArticleHeaders,
  cleanMasterText,
  mapMasterArticleRow,
  normalizeArticle,
  validationKey
} from '../lib/master-validation.js';

const VALIDATION_LOOKUP_LIMIT = 40;
const MASTER_ARTICLE_CHUNK_LIMIT = 20;

export async function handleMasterValidationRequest(request, env, user, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;

  if (path === '/api/validation/lookup' && method === 'POST') return validationLookup(request, env.DB);
  if (path === '/api/master-article/status' && method === 'GET') {
    requireAdmin(user);
    return masterArticleStatus(env.DB);
  }
  if (path === '/api/master-article/start' && method === 'POST') {
    requireAdmin(user);
    return startMasterArticle(request, env.DB, user);
  }
  if (path === '/api/master-article/chunk' && method === 'POST') {
    requireAdmin(user);
    return appendMasterArticleChunk(request, env.DB);
  }
  if (path === '/api/master-article/finalize' && method === 'POST') {
    requireAdmin(user);
    return finalizeMasterArticle(request, env.DB);
  }
  if (path === '/api/master-article/abort' && method === 'POST') {
    requireAdmin(user);
    return abortMasterArticle(request, env.DB);
  }

  return json(404, { status: 'error', message: 'ไม่พบ Master/Validation API ที่เรียกใช้' });
}

async function validationLookup(request, db) {
  const body = await readJson(request, 512 * 1024);
  const pairs = Array.isArray(body.pairs) ? body.pairs : [];
  if (!pairs.length) return json(200, { status: 'success', data: {} });
  if (pairs.length > VALIDATION_LOOKUP_LIMIT) {
    return json(413, { status: 'error', message: `ตรวจสอบได้ครั้งละไม่เกิน ${VALIDATION_LOOKUP_LIMIT} คู่ ระบบหน้าเว็บจะแบ่งชุดให้อัตโนมัติ` });
  }

  const normalized = [];
  const seen = new Set();
  for (const pair of pairs) {
    const article = normalizeArticle(pair?.article);
    const reference = cleanMasterText(pair?.reference);
    const key = validationKey(article, reference);
    if ((!article && !reference) || seen.has(key)) continue;
    seen.add(key);
    normalized.push({ article, reference, key });
  }
  if (!normalized.length) return json(200, { status: 'success', data: {} });

  const where = normalized.map(() => '(article = ? COLLATE NOCASE AND reference_no = ? COLLATE NOCASE)').join(' OR ');
  const params = normalized.flatMap((item) => [item.article, item.reference]);
  const query = await db.prepare(`
    SELECT article, reference_no, transport_no, vehicle_no, driver, reply_date, claim_no, id
    FROM claims
    WHERE ${where}
    ORDER BY id ASC
  `).bind(...params).all();

  // VBA Dictionary kept the first record encountered for the same Article + Reference key.
  const result = {};
  for (const row of query.results || []) {
    const key = validationKey(row.article, row.reference_no);
    if (result[key]) continue;
    result[key] = {
      transportNo: row.transport_no || '-',
      vehicleNo: row.vehicle_no || '-',
      driver: row.driver || '-',
      claimDate: row.reply_date || '-',
      claimNo: row.claim_no || '-'
    };
  }
  return json(200, { status: 'success', data: result });
}

async function masterArticleStatus(db) {
  const row = await db.prepare(`
    SELECT b.batch_id, b.source_file, b.sheet_name, b.expected_rows, b.received_rows,
           b.created_by, b.created_at, b.activated_at,
           (SELECT COUNT(*) FROM master_articles a WHERE a.batch_id = b.batch_id) AS article_count,
           (SELECT COUNT(*) FROM master_articles a WHERE a.batch_id = b.batch_id AND a.item_value > 0) AS priced_count
    FROM master_article_state s
    LEFT JOIN master_article_batches b ON b.batch_id = s.active_batch_id
    WHERE s.id = 1
  `).first();

  if (!row?.batch_id) {
    return json(200, { status: 'success', data: { active: false, articleCount: 0, pricedCount: 0, duplicateRows: 0 } });
  }

  const expectedRows = Number(row.expected_rows || 0);
  const articleCount = Number(row.article_count || 0);
  return json(200, {
    status: 'success',
    data: {
      active: true,
      batchId: row.batch_id,
      sourceFile: row.source_file,
      sheetName: row.sheet_name,
      expectedRows,
      receivedRows: Number(row.received_rows || 0),
      articleCount,
      pricedCount: Number(row.priced_count || 0),
      duplicateRows: Math.max(0, expectedRows - articleCount),
      createdBy: row.created_by || '',
      createdAt: row.created_at || '',
      activatedAt: row.activated_at || ''
    }
  });
}

async function startMasterArticle(request, db, user) {
  const body = await readJson(request, 256 * 1024);
  const sourceFile = cleanMasterText(body.fileName);
  const sheetName = cleanMasterText(body.sheetName) || 'MasterArticle';
  const expectedRows = Number.parseInt(body.totalRows, 10);
  if (!sourceFile) return json(422, { status: 'error', message: 'ไม่พบชื่อไฟล์ MasterArticle' });
  if (!Number.isInteger(expectedRows) || expectedRows < 1) return json(422, { status: 'error', message: 'จำนวนแถว MasterArticle ไม่ถูกต้อง' });
  if (expectedRows > 100000) return json(413, { status: 'error', message: 'MasterArticle มีจำนวนแถวเกิน Safety Limit 100,000 แถว' });

  try { assertMasterArticleHeaders(body.headers || []); }
  catch (error) { return json(422, { status: 'error', message: error.message }); }

  const batchId = `MA-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
  const timestamp = bangkokTimestamp();

  // Remove only abandoned staging data. The current active master stays untouched until finalize succeeds.
  const orphanRows = await db.prepare('SELECT batch_id FROM master_article_batches WHERE status = \'uploading\'').all();
  for (const row of orphanRows.results || []) {
    await db.batch([
      db.prepare('DELETE FROM master_articles WHERE batch_id = ?').bind(row.batch_id),
      db.prepare('DELETE FROM master_article_batches WHERE batch_id = ?').bind(row.batch_id)
    ]);
  }

  await db.prepare(`
    INSERT INTO master_article_batches
      (batch_id, source_file, sheet_name, expected_rows, received_rows, status, created_by, created_at, activated_at)
    VALUES (?, ?, ?, ?, 0, 'uploading', ?, ?, '')
  `).bind(batchId, sourceFile, sheetName, expectedRows, user.username || '', timestamp).run();

  return json(201, {
    status: 'success',
    batchId,
    expectedRows,
    chunkLimit: MASTER_ARTICLE_CHUNK_LIMIT,
    message: 'สร้างพื้นที่ Staging แล้ว Master เดิมยังใช้งานตามปกติจนกว่าจะ Finalize'
  });
}

async function appendMasterArticleChunk(request, db) {
  const body = await readJson(request, 2 * 1024 * 1024);
  const batchId = cleanMasterText(body.batchId);
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!batchId) return json(422, { status: 'error', message: 'ไม่พบ Batch ID' });
  if (!rows.length) return json(422, { status: 'error', message: 'ไม่พบข้อมูล MasterArticle ในชุดนี้' });
  if (rows.length > MASTER_ARTICLE_CHUNK_LIMIT) {
    return json(413, { status: 'error', message: `อัปโหลด MasterArticle ได้ครั้งละไม่เกิน ${MASTER_ARTICLE_CHUNK_LIMIT} แถว` });
  }

  const batch = await db.prepare('SELECT * FROM master_article_batches WHERE batch_id = ?').bind(batchId).first();
  if (!batch || batch.status !== 'uploading') return json(409, { status: 'error', message: 'Batch นี้ไม่อยู่ในสถานะอัปโหลด' });
  if (Number(batch.received_rows || 0) + rows.length > Number(batch.expected_rows || 0)) {
    return json(409, { status: 'error', message: 'จำนวนแถวที่ส่งเกินจำนวนในไฟล์ต้นฉบับ' });
  }

  const timestamp = bangkokTimestamp();
  const mapped = [];
  const errors = [];
  for (let index = 0; index < rows.length; index += 1) {
    try {
      if (!Array.isArray(rows[index]) || rows[index].length < 40) throw new Error('ต้องมีคอลัมน์อย่างน้อย A:AN');
      mapped.push(mapMasterArticleRow(rows[index]));
    } catch (error) {
      errors.push({ row: index + 1, message: error.message });
    }
  }
  if (errors.length) return json(422, { status: 'error', message: 'MasterArticle มีข้อมูลไม่ผ่านการตรวจสอบ', details: errors });

  // VLOOKUP in the original workbook returns the first Article match. INSERT OR IGNORE
  // preserves that same first-row behavior even when duplicate Article rows cross chunks.
  const statements = mapped.map((row) => db.prepare(`
    INSERT OR IGNORE INTO master_articles
      (batch_id, article, barcode, description, manage_weight, item_value, seg_description, raw_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    batchId, row.article, row.barcode, row.description, row.manageWeight,
    row.itemValue, row.segDescription, JSON.stringify(row.raw.slice(0, MASTER_ARTICLE_COLUMN_COUNT)), timestamp
  ));
  statements.push(db.prepare(`
    UPDATE master_article_batches
    SET received_rows = received_rows + ?
    WHERE batch_id = ? AND status = 'uploading'
  `).bind(mapped.length, batchId));

  await db.batch(statements);
  const progress = await db.prepare(`
    SELECT b.received_rows, b.expected_rows,
           (SELECT COUNT(*) FROM master_articles a WHERE a.batch_id = b.batch_id) AS article_count
    FROM master_article_batches b WHERE b.batch_id = ?
  `).bind(batchId).first();

  const receivedRows = Number(progress?.received_rows || 0);
  const articleCount = Number(progress?.article_count || 0);
  return json(200, {
    status: 'success',
    accepted: mapped.length,
    receivedRows,
    expectedRows: Number(progress?.expected_rows || 0),
    articleCount,
    duplicateRows: Math.max(0, receivedRows - articleCount)
  });
}

async function finalizeMasterArticle(request, db) {
  const body = await readJson(request, 256 * 1024);
  const batchId = cleanMasterText(body.batchId);
  if (!batchId) return json(422, { status: 'error', message: 'ไม่พบ Batch ID' });

  const batch = await db.prepare('SELECT * FROM master_article_batches WHERE batch_id = ?').bind(batchId).first();
  if (!batch || batch.status !== 'uploading') return json(409, { status: 'error', message: 'Batch นี้ไม่พร้อม Finalize' });

  const counts = await db.prepare(`
    SELECT COUNT(*) AS article_count,
           SUM(CASE WHEN item_value > 0 THEN 1 ELSE 0 END) AS priced_count
    FROM master_articles WHERE batch_id = ?
  `).bind(batchId).first();
  const articleCount = Number(counts?.article_count || 0);
  const pricedCount = Number(counts?.priced_count || 0);
  const expectedRows = Number(batch.expected_rows || 0);
  const receivedRows = Number(batch.received_rows || 0);
  const duplicateRows = Math.max(0, expectedRows - articleCount);

  if (!articleCount) return json(422, { status: 'error', message: 'ไม่มี Article ที่พร้อมใช้งานใน Batch นี้' });
  if (receivedRows !== expectedRows) {
    return json(422, {
      status: 'error',
      message: `ไฟล์ยังอัปโหลดไม่ครบ: รับแล้ว ${receivedRows.toLocaleString('en-US')} / ${expectedRows.toLocaleString('en-US')} แถว`,
      receivedRows,
      expectedRows
    });
  }

  const timestamp = bangkokTimestamp();
  await db.batch([
    db.prepare(`UPDATE master_article_batches SET status = 'replaced' WHERE status = 'active' AND batch_id <> ?`).bind(batchId),
    db.prepare(`UPDATE master_article_batches SET status = 'active', activated_at = ? WHERE batch_id = ?`).bind(timestamp, batchId),
    db.prepare(`
      INSERT INTO master_article_state(id, active_batch_id, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET active_batch_id = excluded.active_batch_id, updated_at = excluded.updated_at
    `).bind(batchId, timestamp)
  ]);

  // The new batch is active before old MasterArticle rows are removed.
  // Claims therefore never lose their pricing master during weekly replacement.
  await db.prepare('DELETE FROM master_articles WHERE batch_id <> ?').bind(batchId).run();

  return json(200, {
    status: 'success',
    activeBatchId: batchId,
    sourceRows: expectedRows,
    articleCount,
    pricedCount,
    duplicateRows,
    duplicatePolicy: 'first-match-like-VLOOKUP',
    replacedOldMaster: true,
    activatedAt: timestamp
  });
}

async function abortMasterArticle(request, db) {
  const body = await readJson(request, 256 * 1024);
  const batchId = cleanMasterText(body.batchId);
  if (!batchId) return json(422, { status: 'error', message: 'ไม่พบ Batch ID' });
  const batch = await db.prepare('SELECT status FROM master_article_batches WHERE batch_id = ?').bind(batchId).first();
  if (!batch) return json(404, { status: 'error', message: 'ไม่พบ Batch' });
  if (batch.status === 'active') return json(409, { status: 'error', message: 'ไม่สามารถ Abort Master ที่ Active อยู่ได้' });
  await db.batch([
    db.prepare('DELETE FROM master_articles WHERE batch_id = ?').bind(batchId),
    db.prepare('DELETE FROM master_article_batches WHERE batch_id = ?').bind(batchId)
  ]);
  return json(200, { status: 'success' });
}

function requireAdmin(user) {
  if (user?.role !== 'admin') {
    const error = new Error('เฉพาะ Admin เท่านั้นที่สามารถจัดการ MasterArticle ได้');
    error.statusCode = 403;
    throw error;
  }
}

async function readJson(request, maxBytes) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw Object.assign(new Error('ข้อมูลที่ส่งมีขนาดใหญ่เกินกำหนด'), { statusCode: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new Error('ข้อมูลที่ส่งมีขนาดใหญ่เกินกำหนด'), { statusCode: 413 });
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { throw Object.assign(new Error('JSON ไม่ถูกต้อง'), { statusCode: 400 }); }
}

function bangkokTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}
