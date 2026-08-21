import {
  CLAIM_HEADERS,
  bangkokTimestamp,
  claimDateKey,
  claimPrefix,
  claimToExportRow,
  cleanText,
  finalStatus,
  formatTypeForStore,
  groupClaims,
  normalizeImportedRow,
  sqlClaimToApi,
  validateClaimRow
} from '../lib/claim-logic.js';
import { hashPassword } from '../lib/auth.js';

const CLAIM_WRITE_COLUMNS = [
  'store_code', 'store_name', 'claim_dc', 'received_date', 'reported_date',
  'transport_no', 'vehicle_no', 'driver', 'dn_no', 'route', 'pallet_no',
  'basket_no', 'article', 'barcode', 'description', 'sent_qty', 'received_qty',
  'claim_qty', 'reason', 'amount', 'reply_date', 'update_status', 'who',
  'format_type', 'store_type', 'claim_no', 'reference_no', 'final_status',
  'root_cause', 'check_result', 'remark', 'list_eggs', 'check_100',
  'manage_weight', 'sc', 'complete_sc', 'store_check_100', 'sku_cost',
  'seg_description', 'created_by', 'ref_id', 'updated_at', 'updated_by',
  'email_sent', 'archived', 'created_at'
];

const GROUP_CHUNK = 30; // 30 × 3 bound params = 90, under D1's 100-param limit.
export const CLAIM_BULK_LIMIT = 10; // Keeps worst-case D1 queries below the Free-plan 50-query invocation limit.

export class D1ClaimDatabase {
  constructor(db) {
    this.db = db;
  }

  async ensureAdmin(username, password) {
    const existing = await this.first('SELECT id FROM users LIMIT 1');
    if (existing) return;
    if (!password) throw httpError(503, 'ยังไม่ได้ตั้ง Cloudflare secret: ADMIN_PASSWORD');
    await this.run(
      "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', ?)",
      cleanText(username || '2030164'), hashPassword(password), bangkokTimestamp()
    );
  }

  getUser(username) {
    return this.first('SELECT * FROM users WHERE username = ? COLLATE NOCASE', cleanText(username));
  }

  getUserById(id) {
    return this.first('SELECT id, username, role, created_at FROM users WHERE id = ?', id);
  }

  async listUsers() {
    return this.all('SELECT id, username, role, created_at FROM users ORDER BY username COLLATE NOCASE');
  }

  async createUser(username, passwordHash, role = 'user') {
    const result = await this.run(
      'INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)',
      cleanText(username), passwordHash, role === 'admin' ? 'admin' : 'user', bangkokTimestamp()
    );
    return Number(result.meta?.last_row_id || 0);
  }

  async updatePassword(username, passwordHash) {
    const result = await this.run('UPDATE users SET password_hash = ? WHERE username = ? COLLATE NOCASE', passwordHash, username);
    return Number(result.meta?.changes || 0);
  }

  async deleteUser(username) {
    const result = await this.run("DELETE FROM users WHERE username = ? COLLATE NOCASE AND role <> 'admin'", username);
    return Number(result.meta?.changes || 0);
  }

  async saveSession(tokenHash, userId, expiresAt) {
    const now = Date.now();
    await this.db.batch([
      this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      this.db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(tokenHash, userId, expiresAt, now)
    ]);
  }

  getSession(tokenHash) {
    return this.first(`
      SELECT s.token_hash, s.expires_at, u.id, u.username, u.role
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `, tokenHash, Date.now());
  }

  deleteSession(tokenHash) {
    return this.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
  }

  async resolveMasters(articles = [], stores = []) {
    const articleList = unique(articles.map(cleanText).filter(Boolean)).slice(0, 40);
    const storeList = unique(stores.map(cleanText).filter(Boolean)).slice(0, 40);
    const refs = {
      listEggs: {}, check100: {}, manageWeight: {}, skuCost: {}, segDescription: {},
      formatType: {}, storeType: {}, lastRunningNumbers: {}, lastRefCDC: 0, lastRefTF: 0,
      mapBarcodeToArticle: {}, mapArticleToBarcode: {}
    };

    if (storeList.length) {
      const storesRows = await this.all(
        `SELECT * FROM master_stores WHERE store_code IN (${marks(storeList.length)})`,
        ...storeList
      );
      for (const row of storesRows) {
        refs.formatType[row.store_code] = row.format_type;
        refs.storeType[row.store_code] = row.store_type;
        refs.check100[row.store_code] = row.check_100;
      }
    }

    if (articleList.length) {
      const productRows = await this.all(
        `SELECT * FROM master_products WHERE article IN (${marks(articleList.length)}) OR barcode IN (${marks(articleList.length)})`,
        ...articleList, ...articleList
      );
      for (const row of productRows) {
        if (row.article && row.barcode) {
          refs.mapBarcodeToArticle[row.barcode] = row.article;
          refs.mapArticleToBarcode[row.article] = row.barcode;
        }
        for (const key of [row.article, row.barcode].filter(Boolean)) {
          refs.manageWeight[key] = row.manage_weight;
          refs.skuCost[key] = Number(row.sku_cost || 0);
          refs.listEggs[key] = row.list_eggs;
          refs.segDescription[key] = row.seg_description;
        }
      }
    }

    const sequenceRows = await this.all('SELECT sequence_key, current_value FROM sequences');
    for (const row of sequenceRows) {
      if (row.sequence_key.startsWith('CLAIM:')) {
        refs.lastRunningNumbers[row.sequence_key.slice(6)] = Number(row.current_value || 0);
      } else if (row.sequence_key === 'REF:CCD') refs.lastRefCDC = Number(row.current_value || 0);
      else if (row.sequence_key === 'REF:TF') refs.lastRefTF = Number(row.current_value || 0);
    }
    return refs;
  }

  async saveBulkClaims(username, sourceRows, { bypassDate = false } = {}) {
    if (!Array.isArray(sourceRows) || sourceRows.length === 0) throw httpError(422, 'ไม่พบข้อมูลที่ต้องการบันทึก');
    if (sourceRows.length > CLAIM_BULK_LIMIT) {
      throw httpError(413, `Cloudflare D1 รับครั้งละไม่เกิน ${CLAIM_BULK_LIMIT} แถว ระบบหน้าเว็บจะแบ่งชุดให้อัตโนมัติ`);
    }

    const now = new Date();
    const timestamp = bangkokTimestamp(now);
    const rows = sourceRows.map((source) => normalizeImportedRow(source));
    const allErrors = [];
    rows.forEach((row, index) => {
      const errors = validateClaimRow(row, { bypassDate, now });
      if (errors.length) allErrors.push({ row: index + 1, errors });
    });
    if (allErrors.length) {
      const error = httpError(422, 'ข้อมูลไม่ผ่านการตรวจสอบ');
      error.code = 'VALIDATION_ERROR';
      error.details = allErrors;
      throw error;
    }

    const stores = unique(rows.map((row) => row.storeCode).filter(Boolean));
    const productKeys = unique(rows.flatMap((row) => [row.article, row.barcode]).filter(Boolean));
    const refIds = unique(rows.map((row) => row.refId).filter(Boolean));
    const transports = unique(rows.map((row) => row.transportNo).filter(Boolean));
    const newRows = rows.filter((row) => !row.refId);

    const [storeRows, productRows, existingRows, groupRows, duplicateRows] = await Promise.all([
      stores.length ? this.all(`SELECT * FROM master_stores WHERE store_code IN (${marks(stores.length)})`, ...stores) : [],
      productKeys.length ? this.all(`SELECT * FROM master_products WHERE article IN (${marks(productKeys.length)}) OR barcode IN (${marks(productKeys.length)})`, ...productKeys, ...productKeys) : [],
      refIds.length ? this.all(`SELECT * FROM claims WHERE ref_id IN (${marks(refIds.length)})`, ...refIds) : [],
      transports.length ? this.all(`SELECT transport_no, update_status, reply_date, who, claim_no, reference_no FROM claims WHERE transport_no IN (${marks(transports.length)}) ORDER BY id DESC`, ...transports) : [],
      newRows.length ? this.findActiveDuplicates(newRows) : []
    ]);

    const storeMap = new Map(storeRows.map((row) => [row.store_code, row]));
    const productMap = new Map();
    for (const row of productRows) {
      if (row.article) productMap.set(row.article, row);
      if (row.barcode) productMap.set(row.barcode, row);
    }
    const existingMap = new Map(existingRows.map((row) => [row.ref_id, row]));
    const duplicateSet = new Set(duplicateRows.map((row) => `${String(row.transport_no).toLowerCase()}|${String(row.article).toLowerCase()}`));
    const seenNew = new Set();

    const previousClaimNumber = new Map();
    const previousReference = new Map();
    for (const row of groupRows) {
      const claimKey = claimGroupKey(row.transport_no, row.update_status, row.reply_date);
      if (row.claim_no && !previousClaimNumber.has(claimKey)) previousClaimNumber.set(claimKey, row.claim_no);
      const refKey = `${row.who}|${row.transport_no}`;
      if (row.reference_no && row.reference_no !== '-' && !previousReference.has(refKey)) previousReference.set(refKey, row.reference_no);
    }

    const claimNumberMap = new Map();
    const referenceMap = new Map();
    let inserted = 0;
    let updated = 0;
    let archiveUpdated = 0;
    const statements = [];

    for (let index = 0; index < rows.length; index += 1) {
      const source = sourceRows[index] || {};
      const row = rows[index];
      const existing = row.refId ? existingMap.get(row.refId) : null;
      if (row.refId && !existing) throw httpError(404, `ไม่พบประวัติเดิม Ref ID: ${row.refId}`);

      if (!existing) {
        const key = `${row.transportNo.toLowerCase()}|${row.article.toLowerCase()}`;
        if (duplicateSet.has(key) || seenNew.has(key)) throw httpError(409, `สินค้า ${row.article} ในรอบรถ ${row.transportNo} มีอยู่แล้วในระบบ`);
        seenNew.add(key);
      }

      const store = storeMap.get(row.storeCode) || {};
      const product = productMap.get(row.article) || productMap.get(row.barcode) || {};
      if (product.article && row.barcode && product.article !== row.article) row.article = product.article;
      if (!row.barcode && product.barcode) row.barcode = product.barcode;
      row.formatType = formatTypeForStore(row.storeCode, store.format_type);
      row.storeType = cleanText(store.store_type);
      row.listEggs = cleanText(product.list_eggs);
      row.check100 = cleanText(store.check_100);
      row.manageWeight = cleanText(product.manage_weight);
      row.segDescription = cleanText(product.seg_description);
      row.skuCost = existing ? Number(existing.sku_cost || 0) : Number(product.sku_cost || row.skuCost || 0);
      if (source.amount === '' || source.amount === null || source.amount === undefined) {
        row.amount = row.skuCost * (Number.parseFloat(row.claimQty) || 0);
      }
      row.finalStatus = finalStatus(row.status);

      if (existing) {
        row.refId = existing.ref_id;
        row.claimNo = existing.claim_no;
        row.referenceNo = this.referenceNumberFromExisting(row, existing);
        row.createdBy = existing.created_by;
        row.emailSent = Boolean(existing.email_sent);
        row.archived = Boolean(existing.archived);
        row.createdAt = existing.created_at;
        row.updatedAt = timestamp;
        row.updatedBy = username;
        statements.push(this.updateClaimStatement(row));
        updated += 1;
        if (row.archived) archiveUpdated += 1;
      } else {
        row.refId = strongRefId(now);
        row.claimNo = await this.claimNumberFor(row, claimNumberMap, previousClaimNumber);
        row.referenceNo = await this.referenceNumberFor(row, referenceMap, previousReference);
        row.createdBy = username;
        row.emailSent = false;
        row.archived = false;
        row.createdAt = timestamp;
        row.updatedAt = '';
        row.updatedBy = '';
        statements.push(this.insertClaimStatement(row));
        inserted += 1;
      }

      const referenceStatement = this.referenceStatement(row, timestamp);
      if (referenceStatement) statements.push(referenceStatement);
    }

    if (statements.length > 40) throw httpError(413, 'ชุดข้อมูลนี้สร้างคำสั่งฐานข้อมูลมากเกินขีดจำกัด กรุณาลองใหม่');
    if (statements.length) await this.db.batch(statements);

    return { count: rows.length, inserted, updated: updated - archiveUpdated, archiveUpdated };
  }

  async claimNumberFor(row, requestMap, previousMap) {
    const prefix = claimPrefix(row.formatType);
    const date = claimDateKey(row.replyDate);
    if (!prefix || !date) return '';
    const base = `${prefix}${date}`;
    const groupKey = claimGroupKey(row.transportNo, row.status, row.replyDate);
    if (requestMap.has(groupKey)) return requestMap.get(groupKey);
    if (previousMap.has(groupKey)) {
      const value = previousMap.get(groupKey);
      requestMap.set(groupKey, value);
      return value;
    }
    const next = await this.reserveSequence(`CLAIM:${base}`);
    const value = `${base}${String(next).padStart(prefix === 'HYP' ? 7 : 6, '0')}`;
    requestMap.set(groupKey, value);
    return value;
  }

  async referenceNumberFor(row, requestMap, previousMap) {
    if (row.status !== 'Accept' || !['DC', 'TP'].includes(row.who)) return '-';
    const prefix = row.who === 'DC' ? 'CCD' : 'TF';
    const key = `${row.who}|${row.transportNo}`;
    const previous = previousMap.get(key);
    if (previous && ((row.who === 'DC' && /^(CDC|CCD)\d{7}$/.test(previous)) || (row.who === 'TP' && /^TF\d{7}$/.test(previous)))) {
      requestMap.set(key, previous);
      return previous;
    }
    if (requestMap.has(key)) return requestMap.get(key);
    const next = await this.reserveSequence(`REF:${prefix}`);
    const value = `${prefix}${String(next).padStart(7, '0')}`;
    requestMap.set(key, value);
    return value;
  }

  referenceNumberFromExisting(row, existing) {
    if (row.status !== 'Accept' || !['DC', 'TP'].includes(row.who)) return '-';
    const value = cleanText(existing.reference_no);
    if (row.who === 'DC' && /^(CDC|CCD)\d{7}$/.test(value)) return value;
    if (row.who === 'TP' && /^TF\d{7}$/.test(value)) return value;
    return value || '-';
  }

  async reserveSequence(key) {
    const row = await this.db.prepare(`
      INSERT INTO sequences (sequence_key, current_value) VALUES (?, 1)
      ON CONFLICT(sequence_key) DO UPDATE SET current_value = current_value + 1
      RETURNING current_value
    `).bind(key).first();
    return Number(row?.current_value || 1);
  }

  async findActiveDuplicates(rows) {
    const conditions = rows.map(() => '(lower(transport_no) = lower(?) AND lower(article) = lower(?))').join(' OR ');
    const params = rows.flatMap((row) => [row.transportNo, row.article]);
    return this.all(`SELECT transport_no, article FROM claims WHERE archived = 0 AND (${conditions})`, ...params);
  }

  async listClaims(filters = {}) {
    const offsetGroups = Math.max(0, Number(filters.offsetGroups || 0));
    const limitGroups = Math.max(1, Math.min(60, Number(filters.limitGroups || 60)));
    const { sql: whereSql, params } = claimWhere(filters);
    const totalRow = await this.first(`SELECT COUNT(*) AS count FROM (SELECT 1 FROM claims ${whereSql} GROUP BY transport_no, update_status, who)`, ...params);
    const totalGroups = Number(totalRow?.count || 0);

    const keyRows = await this.all(`
      SELECT transport_no, update_status, who, MAX(id) AS max_id
      FROM claims ${whereSql}
      GROUP BY transport_no, update_status, who
      ORDER BY max_id DESC
      LIMIT ? OFFSET ?
    `, ...params, limitGroups, offsetGroups);

    const sqlRows = [];
    for (let start = 0; start < keyRows.length; start += GROUP_CHUNK) {
      const chunk = keyRows.slice(start, start + GROUP_CHUNK);
      const conditions = chunk.map(() => '(transport_no = ? AND update_status = ? AND who = ?)').join(' OR ');
      const values = chunk.flatMap((row) => [row.transport_no, row.update_status, row.who]);
      sqlRows.push(...await this.all(`SELECT * FROM claims WHERE ${conditions} ORDER BY id DESC`, ...values));
    }

    const order = new Map(keyRows.map((row, index) => [`${row.transport_no}|${row.update_status}|${row.who}`, index]));
    const groups = groupClaims(sqlRows.map(sqlClaimToApi));
    groups.sort((a, b) => (order.get(a.key) ?? 9999) - (order.get(b.key) ?? 9999));
    return { groups, totalGroups, hasMore: offsetGroups + groups.length < totalGroups };
  }

  async getClaimGroup(transportNo, status = '', who = '') {
    const conditions = ['transport_no = ?'];
    const params = [transportNo];
    if (status) { conditions.push('update_status = ?'); params.push(status); }
    if (who) { conditions.push('who = ?'); params.push(who); }
    return (await this.all(`SELECT * FROM claims WHERE ${conditions.join(' AND ')} ORDER BY id`, ...params)).map(sqlClaimToApi);
  }

  async deleteByTransport(transportNo) {
    const result = await this.run('DELETE FROM claims WHERE transport_no = ?', transportNo);
    return Number(result.meta?.changes || 0);
  }

  async setEmailStatus(transportNo, checked) {
    const result = await this.run('UPDATE claims SET email_sent = ? WHERE transport_no = ?', checked ? 1 : 0, transportNo);
    return Number(result.meta?.changes || 0);
  }

  async getEmailDraft(transportNo) {
    const rows = await this.all('SELECT * FROM claims WHERE transport_no = ? ORDER BY id', transportNo);
    if (!rows.length) return null;
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const lines = rows.map((row, index) => `${index + 1}. Article: ${row.article || '-'} | จำนวน: ${row.claim_qty || '0'} | ยอดเงิน: ${Number(row.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท | สาเหตุ: ${row.root_cause || '-'}`);
    return {
      subject: `[แจ้งเคลม] รอบรถ: ${transportNo} / สาขา: ${rows[0].store_code}`,
      body: `เรียน ทีมงานที่เกี่ยวข้อง\n\nขอส่งรายละเอียดรายการเคลมสำหรับรอบรถ ${transportNo} (สาขา ${rows[0].store_code})\nจำนวนทั้งหมด: ${rows.length} รายการ | ยอดเงินรวม: ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} บาท\n\nรายละเอียดสินค้า:\n------------------------------------------------\n${lines.join('\n')}\n------------------------------------------------\n\nขอบคุณครับ\nClaim Center System`
    };
  }

  async listReferences(type) {
    return this.all('SELECT * FROM claim_references WHERE reference_type = ? ORDER BY id DESC', type === 'TP' ? 'TP' : 'DC');
  }

  async addReference(data) {
    const timestamp = bangkokTimestamp();
    const type = data.type === 'TP' ? 'TP' : 'DC';
    const result = await this.run(`
      INSERT INTO claim_references (ref_no, reference_type, reply_date, claim_no, store_code, remark, source_label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, cleanText(data.refNo), type, cleanText(data.replyDate), cleanText(data.claimNo), cleanText(data.storeCode), cleanText(data.remark), type === 'DC' ? 'DC' : 'Transport Accept', timestamp);
    await this.bumpReferenceSequence(cleanText(data.refNo));
    return Number(result.meta?.last_row_id || 0);
  }

  async deleteReference(type, refNo) {
    const result = await this.run('DELETE FROM claim_references WHERE reference_type = ? AND ref_no = ?', type, refNo);
    return Number(result.meta?.changes || 0);
  }

  async bumpReferenceSequence(refNo) {
    const dc = refNo.match(/^(?:CDC|CCD)(\d{7})$/);
    const tp = refNo.match(/^TF(\d{7})$/);
    const key = dc ? 'REF:CCD' : tp ? 'REF:TF' : '';
    const value = dc ? Number(dc[1]) : tp ? Number(tp[1]) : 0;
    if (!key) return;
    await this.run(`
      INSERT INTO sequences (sequence_key, current_value) VALUES (?, ?)
      ON CONFLICT(sequence_key) DO UPDATE SET current_value = MAX(current_value, excluded.current_value)
    `, key, value);
  }

  async performance(filterDate = '') {
    const newWhere = filterDate ? 'WHERE reply_date = ?' : '';
    const updateWhere = filterDate ? "WHERE updated_by <> '' AND substr(updated_at, 1, 10) = ?" : "WHERE updated_by <> ''";
    const newRows = await this.all(`SELECT created_by AS user, COUNT(DISTINCT transport_no) AS count FROM claims ${newWhere} GROUP BY created_by`, ...(filterDate ? [filterDate] : []));
    const updateRows = await this.all(`SELECT updated_by AS user, COUNT(DISTINCT transport_no) AS count FROM claims ${updateWhere} GROUP BY updated_by`, ...(filterDate ? [filterDate] : []));
    const map = new Map();
    const ensure = (user) => {
      if (!map.has(user)) map.set(user, { user, total: 0, newCount: 0, updateCount: 0 });
      return map.get(user);
    };
    for (const row of newRows) { const item = ensure(row.user); item.newCount = Number(row.count); item.total += Number(row.count); }
    for (const row of updateRows) { const item = ensure(row.user); item.updateCount = Number(row.count); item.total += Number(row.count); }
    const data = [...map.values()].sort((a, b) => b.total - a.total || a.user.localeCompare(b.user));
    return { data, totalOverall: data.reduce((sum, row) => sum + row.total, 0) };
  }

  async pivotRows({ year = '', month = '', format = '', limit = 50000 } = {}) {
    const conditions = [];
    const params = [];
    if (year && year !== 'all') { conditions.push("substr(reply_date, 1, 4) = ?"); params.push(String(year)); }
    if (month && month !== 'all') { conditions.push("CAST(substr(reply_date, 6, 2) AS INTEGER) = ?"); params.push(Number(month)); }
    if (format && format !== 'all') { conditions.push('format_type = ?'); params.push(format); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.all(`SELECT * FROM claims ${where} ORDER BY id DESC LIMIT ?`, ...params, Math.min(50000, Number(limit) || 50000));
    return rows.map((row) => ({
      date: row.reply_date,
      storeCode: row.store_code,
      storeName: row.store_name,
      transport: row.transport_no,
      article: row.article,
      description: row.description,
      qty: row.claim_qty,
      reason: row.reason,
      amount: Number(row.amount || 0),
      status: row.update_status,
      who: row.who,
      format: row.format_type,
      referenceNo: row.reference_no,
      rootCause: row.root_cause,
      checkResult: row.check_result,
      remark: row.remark,
      skuCost: Number(row.sku_cost || 0),
      segDescription: row.seg_description
    }));
  }

  async exportData(filters = {}) {
    const { sql: whereSql, params } = exportWhere(filters);
    const claims = await this.all(`SELECT * FROM claims ${whereSql} ORDER BY id`, ...params);
    const refDC = await this.listReferences('DC');
    const refTP = await this.listReferences('TP');
    return {
      'Claim All BU': [CLAIM_HEADERS, ...claims.map(claimToExportRow)],
      ReferenceDC: [['Reference No.', 'วันที่', 'Claim No.', 'Store', 'Remark', 'Type'], ...refDC.map(referenceExportRow)],
      ReferenceTP: [['Reference No.', 'วันที่', 'Claim No.', 'Store', 'Remark', 'Type'], ...refTP.map(referenceExportRow)]
    };
  }

  async upsertStores(records = []) {
    if (!Array.isArray(records) || !records.length) return { inserted: 0, updated: 0 };
    if (records.length > 500) throw httpError(413, 'อัปเดต Master Store ได้ครั้งละไม่เกิน 500 รายการ');
    const timestamp = bangkokTimestamp();
    const clean = records.map((row) => Array.isArray(row) ? {
      storeCode: cleanText(row[0]), storeName: cleanText(row[1]), formatType: cleanText(row[2]), storeType: cleanText(row[3]), check100: cleanText(row[4])
    } : {
      storeCode: cleanText(row.storeCode ?? row.store_code), storeName: cleanText(row.storeName ?? row.store_name), formatType: cleanText(row.formatType ?? row.format_type), storeType: cleanText(row.storeType ?? row.store_type), check100: cleanText(row.check100 ?? row.check_100)
    }).filter((row) => row.storeCode);
    for (let start = 0; start < clean.length; start += 20) {
      const chunk = clean.slice(start, start + 20);
      const values = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
      await this.run(`
        INSERT INTO master_stores (store_code, store_name, format_type, store_type, check_100, updated_at) VALUES ${values}
        ON CONFLICT(store_code) DO UPDATE SET store_name=excluded.store_name, format_type=excluded.format_type, store_type=excluded.store_type, check_100=excluded.check_100, updated_at=excluded.updated_at
      `, ...chunk.flatMap((row) => [row.storeCode, row.storeName, row.formatType, row.storeType, row.check100, timestamp]));
    }
    return { count: clean.length };
  }

  async upsertProducts(records = []) {
    if (!Array.isArray(records) || !records.length) return { count: 0 };
    if (records.length > 400) throw httpError(413, 'อัปเดต Master Product ได้ครั้งละไม่เกิน 400 รายการ');
    const timestamp = bangkokTimestamp();
    const clean = records.map((row) => Array.isArray(row) ? {
      article: cleanText(row[0]).replace(/'/g, ''), barcode: cleanText(row[3]).replace(/'/g, ''), manageWeight: cleanText(row[11]), skuCost: Number(row[35] || 0), segDescription: cleanText(row[39]), listEggs: cleanText(row[40])
    } : {
      article: cleanText(row.article).replace(/'/g, ''), barcode: cleanText(row.barcode).replace(/'/g, ''), manageWeight: cleanText(row.manageWeight ?? row.manage_weight), skuCost: Number(row.skuCost ?? row.sku_cost ?? 0), segDescription: cleanText(row.segDescription ?? row.seg_description), listEggs: cleanText(row.listEggs ?? row.list_eggs)
    }).filter((row) => row.article);
    for (let start = 0; start < clean.length; start += 12) {
      const chunk = clean.slice(start, start + 12);
      const values = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
      await this.run(`
        INSERT INTO master_products (article, barcode, manage_weight, sku_cost, seg_description, list_eggs, updated_at) VALUES ${values}
        ON CONFLICT(article) DO UPDATE SET barcode=excluded.barcode, manage_weight=excluded.manage_weight, sku_cost=excluded.sku_cost, seg_description=excluded.seg_description, list_eggs=excluded.list_eggs, updated_at=excluded.updated_at
      `, ...chunk.flatMap((row) => [row.article, row.barcode, row.manageWeight, row.skuCost, row.segDescription, row.listEggs, timestamp]));
    }
    return { count: clean.length };
  }

  async missingStores(codes = []) {
    const list = unique(codes.map(cleanText).filter(Boolean)).slice(0, 90);
    if (!list.length) return [];
    const rows = await this.all(`SELECT store_code FROM master_stores WHERE store_code IN (${marks(list.length)})`, ...list);
    const found = new Set(rows.map((row) => row.store_code));
    return list.filter((code) => !found.has(code));
  }

  async missingStoresFromClaims() {
    const rows = await this.all(`
      SELECT DISTINCT c.store_code
      FROM claims c LEFT JOIN master_stores s ON s.store_code = c.store_code
      WHERE c.store_code <> '' AND s.store_code IS NULL
      ORDER BY c.store_code
      LIMIT 500
    `);
    return rows.map((row) => row.store_code);
  }

  insertClaimStatement(row) {
    const dbRow = toDbRow(row);
    return this.db.prepare(`INSERT INTO claims (${CLAIM_WRITE_COLUMNS.join(',')}) VALUES (${marks(CLAIM_WRITE_COLUMNS.length)})`).bind(...CLAIM_WRITE_COLUMNS.map((column) => dbRow[column]));
  }

  updateClaimStatement(row) {
    const dbRow = toDbRow(row);
    const columns = CLAIM_WRITE_COLUMNS.filter((column) => !['ref_id', 'created_at'].includes(column));
    return this.db.prepare(`UPDATE claims SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ref_id = ?`).bind(...columns.map((column) => dbRow[column]), row.refId);
  }

  referenceStatement(row, timestamp) {
    if (row.status !== 'Accept' || !row.referenceNo || row.referenceNo === '-' || !['DC', 'TP'].includes(row.who)) return null;
    const type = row.who === 'DC' ? 'DC' : 'TP';
    return this.db.prepare(`
      INSERT OR IGNORE INTO claim_references (ref_no, reference_type, reply_date, claim_no, store_code, remark, source_label, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(row.referenceNo, type, row.replyDate, row.claimNo, row.storeCode, row.reason, type === 'DC' ? 'DC' : 'Transport Accept', timestamp);
  }

  async first(sql, ...params) {
    return this.db.prepare(sql).bind(...params).first();
  }

  async all(sql, ...params) {
    const result = await this.db.prepare(sql).bind(...params).all();
    return result.results || [];
  }

  run(sql, ...params) {
    return this.db.prepare(sql).bind(...params).run();
  }
}

function toDbRow(row) {
  return {
    store_code: row.storeCode, store_name: row.storeName, claim_dc: row.claimDc,
    received_date: row.receivedDate, reported_date: row.reportedDate,
    transport_no: row.transportNo, vehicle_no: row.vehicleNo, driver: row.driver,
    dn_no: row.dnNo, route: row.route, pallet_no: row.palletNo, basket_no: row.basketNo,
    article: row.article, barcode: row.barcode, description: row.description,
    sent_qty: row.sentQty, received_qty: row.receivedQty, claim_qty: row.claimQty,
    reason: row.reason, amount: Number(row.amount || 0), reply_date: row.replyDate,
    update_status: row.status, who: row.who, format_type: row.formatType,
    store_type: row.storeType, claim_no: row.claimNo, reference_no: row.referenceNo || '-',
    final_status: row.finalStatus, root_cause: row.rootCause, check_result: row.checkResult,
    remark: row.remark, list_eggs: row.listEggs, check_100: row.check100,
    manage_weight: row.manageWeight, sc: row.sc, complete_sc: row.completeSc,
    store_check_100: row.storeCheck100, sku_cost: Number(row.skuCost || 0),
    seg_description: row.segDescription, created_by: row.createdBy, ref_id: row.refId,
    updated_at: row.updatedAt || '', updated_by: row.updatedBy || '',
    email_sent: row.emailSent ? 1 : 0, archived: row.archived ? 1 : 0,
    created_at: row.createdAt
  };
}

function claimWhere(filters) {
  const conditions = [];
  const params = [];
  const searchFields = [
    ['transport_no', filters.transport], ['article', filters.article], ['store_code', filters.store],
    ['reply_date', filters.date], ['reference_no', filters.reference]
  ];
  const hasSearch = searchFields.some(([, value]) => cleanText(value));
  if (!hasSearch) conditions.push('archived = 0');
  for (const [column, value] of searchFields) {
    const clean = cleanText(value);
    if (!clean) continue;
    conditions.push(`${column} = ?`);
    params.push(clean);
  }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function exportWhere(filters) {
  const conditions = [];
  const params = [];
  if (filters.startDate) { conditions.push('reply_date >= ?'); params.push(filters.startDate); }
  if (filters.endDate) { conditions.push('reply_date <= ?'); params.push(filters.endDate); }
  if (filters.status && filters.status !== 'all') { conditions.push('update_status = ?'); params.push(filters.status); }
  if (filters.format && filters.format !== 'all') { conditions.push('format_type = ?'); params.push(filters.format); }
  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function referenceExportRow(row) {
  return [row.ref_no, row.reply_date, row.claim_no, row.store_code, row.remark, row.source_label];
}

function claimGroupKey(transportNo, status, replyDate) {
  return `${cleanText(transportNo)}|${cleanText(status)}|${cleanText(replyDate)}`;
}

function strongRefId(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `CLM-${map.year}${map.month}${map.day}${map.hour}${map.minute}${map.second}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function marks(count) {
  return Array.from({ length: count }, () => '?').join(',');
}

export function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
