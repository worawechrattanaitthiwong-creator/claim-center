const CCD_COLUMNS = 43;
const IMPORT_LIMIT = 15;
const DEFAULT_DAILY_IMPORT_ROWS = 4000;

export async function handleHistoryRequest(request, env, user, url) {
  if (user?.role !== 'admin') {
    return json(403, { status: 'error', message: 'เฉพาะ Admin เท่านั้นที่สามารถนำเข้าประวัติข้อมูลได้' });
  }

  const method = request.method.toUpperCase();
  if (method === 'GET' && url.pathname === '/api/history/stats') {
    return historyStats(env);
  }

  if (method === 'POST' && url.pathname === '/api/history/import') {
    const body = await readJson(request);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return json(422, { status: 'error', message: 'ไม่พบข้อมูลที่ต้องการนำเข้า' });
    if (rows.length > IMPORT_LIMIT) {
      return json(413, { status: 'error', message: `นำเข้าได้ครั้งละไม่เกิน ${IMPORT_LIMIT} แถว` });
    }

    try {
      const result = await importRows(env.DB, rows, {
        archived: body.archived !== false,
        dailyLimit: dailyLimit(env)
      });
      return json(200, { status: 'success', ...result });
    } catch (error) {
      return json(Number(error.statusCode || 500), {
        status: 'error',
        message: error.message || 'นำเข้าข้อมูลไม่สำเร็จ',
        quota: error.quota || undefined
      });
    }
  }

  return json(404, { status: 'error', message: 'ไม่พบ History Import API ที่เรียกใช้' });
}

export async function importRows(db, rows, { archived = true, dailyLimit = DEFAULT_DAILY_IMPORT_ROWS } = {}) {
  const normalized = [];
  const rejected = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row) || row.length < CCD_COLUMNS) {
      rejected.push({ row: index + 1, message: `ต้องมีอย่างน้อย ${CCD_COLUMNS} คอลัมน์ A:AQ` });
      continue;
    }
    try {
      normalized.push(await mapCcdRow(row, archived));
    } catch (error) {
      rejected.push({ row: index + 1, message: error.message || 'รูปแบบข้อมูลไม่ถูกต้อง' });
    }
  }

  const usage = await importBudget(db, dailyLimit);
  if (!normalized.length) {
    return { imported: 0, skipped: 0, rejected, transports: [], quota: usage };
  }

  const duplicates = await findDuplicates(db, normalized);
  const pending = normalized.filter((row) => !duplicates.has(row));
  const skipped = normalized.length - pending.length;

  if (pending.length > usage.remaining) {
    const error = new Error(
      usage.remaining > 0
        ? `งบ Import รอบ Cloudflare วันนี้เหลือ ${usage.remaining.toLocaleString('en-US')} แถว ซึ่งไม่พอสำหรับชุดถัดไป กรุณา Resume หลังเวลา Reset`
        : 'ถึง Daily Import Safety Budget ของรอบ Cloudflare นี้แล้ว กรุณา Resume หลังเวลา Reset'
    );
    error.statusCode = 429;
    error.quota = usage;
    throw error;
  }

  if (!pending.length) {
    return { imported: 0, skipped, rejected, transports: [], quota: usage };
  }

  const sequenceMax = new Map();
  const statements = [];

  for (const row of pending) {
    statements.push(insertStatement(db, row));
    const reference = referenceStatement(db, row);
    if (reference) statements.push(reference);
    collectSequence(sequenceMax, row);
  }

  const sequence = sequenceStatement(db, sequenceMax);
  if (sequence) statements.push(sequence);
  statements.push(usageStatement(db, usage.date, pending.length));

  // Worst case with 15 rows: 15 Claim inserts + 15 Reference inserts +
  // 1 sequence statement + 1 usage statement = 32 statements. This leaves
  // headroom for duplicate/auth/summary work inside one Worker invocation.
  if (statements.length > 40) {
    const error = new Error('ชุด Import สร้างคำสั่งฐานข้อมูลมากเกิน Safety Limit');
    error.statusCode = 413;
    throw error;
  }

  // One D1 batch keeps Claim, Reference, sequence and quota ledger atomic.
  await db.batch(statements);

  const nextUsage = {
    ...usage,
    used: usage.used + pending.length,
    remaining: Math.max(0, usage.limit - usage.used - pending.length)
  };

  return {
    imported: pending.length,
    skipped,
    rejected,
    transports: [...new Set(pending.map((row) => row.transport_no).filter(Boolean))],
    quota: nextUsage
  };
}

async function historyStats(env) {
  const db = env.DB;
  const [total, archive, active, minMax, quota] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS n FROM claims').first(),
    db.prepare('SELECT COUNT(*) AS n FROM claims WHERE archived = 1').first(),
    db.prepare('SELECT COUNT(*) AS n FROM claims WHERE archived = 0').first(),
    db.prepare("SELECT MIN(reply_date) AS min_date, MAX(reply_date) AS max_date FROM claims WHERE reply_date <> ''").first(),
    importBudget(db, dailyLimit(env))
  ]);

  return json(200, {
    status: 'success',
    data: {
      total: Number(total?.n || 0),
      archived: Number(archive?.n || 0),
      active: Number(active?.n || 0),
      minDate: minMax?.min_date || '',
      maxDate: minMax?.max_date || '',
      quota
    }
  });
}

async function importBudget(db, limit) {
  const date = utcUsageDate();
  const row = await db.prepare(
    'SELECT imported_rows FROM history_import_usage WHERE usage_date = ?'
  ).bind(date).first();
  const used = Number(row?.imported_rows || 0);
  return {
    date,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: nextUtcReset().toISOString(),
    mode: 'free-tier-safety-budget'
  };
}

function usageStatement(db, date, increment) {
  return db.prepare(`
    INSERT INTO history_import_usage(usage_date, imported_rows, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(usage_date) DO UPDATE SET
      imported_rows = history_import_usage.imported_rows + excluded.imported_rows,
      updated_at = CURRENT_TIMESTAMP
  `).bind(date, increment);
}

async function mapCcdRow(source, archived) {
  const value = (index) => clean(source[index]);
  const replyDate = normalizeDate(source[20]);
  if (!value(5) || !value(12)) throw new Error('Transport No. และ Article ห้ามว่าง');
  if (!replyDate) throw new Error('Ship Date / วันที่ตอบกลับไม่ถูกต้อง');

  const yearMonth = replyDate.split('-').map(Number);
  const storeCode = digits(value(0));
  const transport = value(5);
  const article = value(12).replace(/'/g, '');
  const uniqueKey = value(40) || `${storeCode}|${transport}|${article}`;
  const status = value(21) || 'Pending';
  const who = value(22);
  const referenceNo = value(25) || '-';
  const createdBy = value(39) || 'Historical Import';
  const refId = await historyRefId(uniqueKey, value(24), referenceNo);

  return {
    store_code: storeCode,
    store_name: value(1),
    claim_dc: digits(value(2)).slice(0, 5),
    received_date: normalizeDate(source[3]),
    reported_date: normalizeDate(source[4]),
    transport_no: transport,
    vehicle_no: value(6),
    driver: value(7),
    dn_no: value(8),
    route: value(9),
    pallet_no: value(10),
    basket_no: value(11),
    article,
    barcode: value(13).replace(/'/g, ''),
    description: value(14),
    sent_qty: value(15),
    received_qty: value(16),
    claim_qty: value(17),
    reason: value(18),
    amount: number(source[19]),
    reply_date: replyDate,
    update_status: status,
    who,
    format_type: value(23),
    store_type: value(31),
    claim_no: value(24),
    reference_no: referenceNo,
    final_status: /^(accept|reject)$/i.test(status) ? 'Complete' : 'Pending',
    cause_group: value(26),
    root_cause: value(27),
    check_result: value(28),
    remark_list: value(29),
    remark: value(35),
    list_eggs: value(30),
    check_100: value(36),
    manage_weight: value(32),
    sc: value(33),
    complete_sc: value(34),
    store_check_100: value(36),
    sku_cost: number(source[37]),
    seg_description: value(38),
    created_by: createdBy,
    ref_id: refId,
    updated_at: '',
    updated_by: '',
    email_sent: 0,
    archived: archived ? 1 : 0,
    created_at: `${replyDate} 00:00:00`,
    unique_key: uniqueKey,
    data_month: integer(source[41]) || yearMonth[1] || 0,
    data_year: integer(source[42]) || yearMonth[0] || 0
  };
}

function insertStatement(db, row) {
  const columns = [
    'store_code','store_name','claim_dc','received_date','reported_date','transport_no','vehicle_no','driver','dn_no','route',
    'pallet_no','basket_no','article','barcode','description','sent_qty','received_qty','claim_qty','reason','amount',
    'reply_date','update_status','who','format_type','store_type','claim_no','reference_no','final_status','root_cause','check_result',
    'remark','list_eggs','check_100','manage_weight','sc','complete_sc','store_check_100','sku_cost','seg_description','created_by',
    'ref_id','updated_at','updated_by','email_sent','archived','created_at','cause_group','remark_list','unique_key','data_month','data_year'
  ];
  const placeholders = columns.map(() => '?').join(',');
  return db.prepare(`INSERT INTO claims (${columns.join(',')}) VALUES (${placeholders})`)
    .bind(...columns.map((column) => row[column]));
}

function referenceStatement(db, row) {
  if (String(row.update_status).toLowerCase() !== 'accept') return null;
  if (!row.reference_no || row.reference_no === '-') return null;
  const who = String(row.who || '').toUpperCase();
  if (!['DC', 'TP'].includes(who)) return null;
  const type = who === 'DC' ? 'DC' : 'TP';
  return db.prepare(`
    INSERT OR IGNORE INTO claim_references
      (ref_no, reference_type, reply_date, claim_no, store_code, remark, source_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    row.reference_no, type, row.reply_date, row.claim_no, row.store_code,
    row.reason, type === 'DC' ? 'DC' : 'Transport Accept', row.created_at
  );
}

async function findDuplicates(db, rows) {
  const pairSet = new Set();
  const uniqueSet = new Set();

  for (let offset = 0; offset < rows.length; offset += 15) {
    const chunk = rows.slice(offset, offset + 15);
    const uniqueKeys = chunk.map((row) => clean(row.unique_key)).filter(Boolean);
    const pairConditions = chunk.map(() => '(transport_no = ? AND article = ?)').join(' OR ');
    const uniqueCondition = uniqueKeys.length ? `unique_key IN (${uniqueKeys.map(() => '?').join(',')}) OR ` : '';
    const params = [...uniqueKeys, ...chunk.flatMap((row) => [row.transport_no, row.article])];
    const result = await db.prepare(`
      SELECT unique_key, transport_no, article FROM claims
      WHERE ${uniqueCondition}(${pairConditions})
    `).bind(...params).all();

    for (const row of result.results || []) {
      pairSet.add(pairKey(row.transport_no, row.article));
      if (row.unique_key) uniqueSet.add(clean(row.unique_key).toLowerCase());
    }
  }

  return {
    has(row) {
      return pairSet.has(pairKey(row.transport_no, row.article)) ||
        (row.unique_key && uniqueSet.has(clean(row.unique_key).toLowerCase()));
    }
  };
}

function pairKey(transport, article) {
  return `${clean(transport).toLowerCase()}|${clean(article).toLowerCase()}`;
}

function collectSequence(map, row) {
  const claim = clean(row.claim_no).match(/^([A-Z]+)(\d{6})(\d+)$/i);
  if (claim) {
    const key = `CLAIM:${claim[1].toUpperCase()}${claim[2]}`;
    map.set(key, Math.max(Number(map.get(key) || 0), Number(claim[3] || 0)));
  }
  const dc = clean(row.reference_no).match(/^(?:CDC|CCD)(\d{7})$/i);
  const tp = clean(row.reference_no).match(/^TF(\d{7})$/i);
  if (dc) map.set('REF:CCD', Math.max(Number(map.get('REF:CCD') || 0), Number(dc[1])));
  if (tp) map.set('REF:TF', Math.max(Number(map.get('REF:TF') || 0), Number(tp[1])));
}

function sequenceStatement(db, sequenceMap) {
  const entries = [...sequenceMap.entries()];
  if (!entries.length) return null;
  const values = entries.map(() => '(?, ?)').join(',');
  return db.prepare(`
    INSERT INTO sequences(sequence_key,current_value) VALUES ${values}
    ON CONFLICT(sequence_key) DO UPDATE SET current_value = MAX(current_value, excluded.current_value)
  `).bind(...entries.flatMap(([key, current]) => [key, current]));
}

async function historyRefId(uniqueKey, claimNo, referenceNo) {
  const input = `${uniqueKey}|${claimNo}|${referenceNo}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `HIST-${hex.slice(0, 28)}`;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  const text = clean(value);
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function dailyLimit(env) {
  const value = Number(env.HISTORY_IMPORT_DAILY_ROWS || DEFAULT_DAILY_IMPORT_ROWS);
  return Number.isFinite(value) && value >= 100 ? Math.floor(value) : DEFAULT_DAILY_IMPORT_ROWS;
}

function utcUsageDate() {
  return new Date().toISOString().slice(0, 10);
}

function nextUtcReset() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
}

function number(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function integer(value) { const parsed = Number.parseInt(String(value ?? '').replace(/,/g, ''), 10); return Number.isFinite(parsed) ? parsed : 0; }
function clean(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function digits(value) { return clean(value).replace(/\D/g, ''); }
async function readJson(request) { try { return await request.json(); } catch { throw Object.assign(new Error('รูปแบบ JSON ไม่ถูกต้อง'), { statusCode: 400 }); } }
function json(status, body) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
