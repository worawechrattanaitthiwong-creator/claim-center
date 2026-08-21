const CHECK100_STORES = [
  '11190', '11191', '11172', '11174', '11133', '11128',
  '11102', '11126', '11144', '11210', '11110', '11127'
];

export async function handleDashboardRequest(request, env, user, url) {
  const method = request.method.toUpperCase();

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    return dashboardResponse(env.DB, url);
  }

  if (method === 'POST' && url.pathname === '/api/dashboard/rebuild') {
    if (user?.role !== 'admin') {
      return json(403, { status: 'error', message: 'เฉพาะ Admin เท่านั้นที่สามารถ Rebuild Dashboard ได้' });
    }
    const result = await rebuildCaseSummaries(env.DB);
    return json(200, { status: 'success', ...result });
  }

  return json(404, { status: 'error', message: 'ไม่พบ Dashboard API ที่เรียกใช้' });
}

export async function refreshCaseSummaries(db, transportNumbers = []) {
  const transports = unique(transportNumbers).filter(Boolean).slice(0, 80);
  if (!transports.length) return { refreshed: 0 };

  const placeholders = transports.map(() => '?').join(',');
  const result = await db.prepare(`
    INSERT OR REPLACE INTO claim_case_summary (
      transport_no, store_code, reply_date, dominant_status, who, format_type,
      hub, total_amount, item_count, updated_at, egg_values
    )
    WITH selected AS (
      SELECT * FROM claims WHERE transport_no IN (${placeholders})
    ),
    first_ids AS (
      SELECT transport_no, MIN(id) AS min_id
      FROM selected
      GROUP BY transport_no
    ),
    aggregate AS (
      SELECT
        transport_no,
        CASE
          WHEN SUM(CASE WHEN lower(update_status) = 'reject' THEN 1 ELSE 0 END) > 0 THEN 'Reject'
          WHEN SUM(CASE WHEN lower(update_status) = 'pending' THEN 1 ELSE 0 END) > 0 THEN 'Pending'
          ELSE 'Accept'
        END AS dominant_status,
        SUM(COALESCE(amount, 0)) AS total_amount,
        COUNT(*) AS item_count,
        COALESCE(REPLACE(group_concat(DISTINCT CASE WHEN trim(list_eggs) <> '' THEN trim(list_eggs) END), ',', '|'), '') AS egg_values
      FROM selected
      GROUP BY transport_no
    )
    SELECT
      a.transport_no,
      f.store_code,
      f.reply_date,
      a.dominant_status,
      f.who,
      f.format_type,
      f.store_type AS hub,
      a.total_amount,
      a.item_count,
      CURRENT_TIMESTAMP,
      a.egg_values
    FROM aggregate a
    JOIN first_ids i ON i.transport_no = a.transport_no
    JOIN selected f ON f.id = i.min_id
  `).bind(...transports).run();

  return { refreshed: Number(result.meta?.changes || transports.length) };
}

export async function deleteCaseSummary(db, transportNo) {
  const value = String(transportNo || '').trim();
  if (!value) return 0;
  const result = await db.prepare('DELETE FROM claim_case_summary WHERE transport_no = ?').bind(value).run();
  return Number(result.meta?.changes || 0);
}

export async function rebuildCaseSummaries(db) {
  await db.prepare('DELETE FROM claim_case_summary').run();
  const result = await db.prepare(`
    INSERT INTO claim_case_summary (
      transport_no, store_code, reply_date, dominant_status, who, format_type,
      hub, total_amount, item_count, updated_at, egg_values
    )
    WITH first_ids AS (
      SELECT transport_no, MIN(id) AS min_id
      FROM claims
      WHERE trim(transport_no) <> ''
      GROUP BY transport_no
    ),
    aggregate AS (
      SELECT
        transport_no,
        CASE
          WHEN SUM(CASE WHEN lower(update_status) = 'reject' THEN 1 ELSE 0 END) > 0 THEN 'Reject'
          WHEN SUM(CASE WHEN lower(update_status) = 'pending' THEN 1 ELSE 0 END) > 0 THEN 'Pending'
          ELSE 'Accept'
        END AS dominant_status,
        SUM(COALESCE(amount, 0)) AS total_amount,
        COUNT(*) AS item_count,
        COALESCE(REPLACE(group_concat(DISTINCT CASE WHEN trim(list_eggs) <> '' THEN trim(list_eggs) END), ',', '|'), '') AS egg_values
      FROM claims
      WHERE trim(transport_no) <> ''
      GROUP BY transport_no
    )
    SELECT
      a.transport_no,
      f.store_code,
      f.reply_date,
      a.dominant_status,
      f.who,
      f.format_type,
      f.store_type AS hub,
      a.total_amount,
      a.item_count,
      CURRENT_TIMESTAMP,
      a.egg_values
    FROM aggregate a
    JOIN first_ids i ON i.transport_no = a.transport_no
    JOIN claims f ON f.id = i.min_id
  `).run();

  const count = await db.prepare('SELECT COUNT(*) AS n FROM claim_case_summary').first();
  return {
    rebuilt: Number(count?.n || result.meta?.changes || 0),
    rebuiltAt: new Date().toISOString()
  };
}

async function dashboardResponse(db, url) {
  const filter = buildFilter(url);
  const { year, month, startDate, endDate, where, params } = filter;
  const trendPeriod = month === 'all'
    ? "CAST(substr(reply_date, 6, 2) AS INTEGER)"
    : "CAST(substr(reply_date, 9, 2) AS INTEGER)";

  const check100Marks = CHECK100_STORES.map(() => '?').join(',');

  const [summary, trendResult, hubResult, storeResult, recentResult, check100Result, eggResult] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) AS total_cases,
        COALESCE(SUM(total_amount), 0) AS total_amount,
        COALESCE(SUM(item_count), 0) AS total_items,
        SUM(CASE WHEN lower(dominant_status) = 'accept' THEN 1 ELSE 0 END) AS accept_cases,
        COALESCE(SUM(CASE WHEN lower(dominant_status) = 'accept' THEN total_amount ELSE 0 END), 0) AS accept_amount,
        SUM(CASE WHEN lower(dominant_status) = 'pending' THEN 1 ELSE 0 END) AS pending_cases,
        COALESCE(SUM(CASE WHEN lower(dominant_status) = 'pending' THEN total_amount ELSE 0 END), 0) AS pending_amount,
        SUM(CASE WHEN lower(dominant_status) = 'reject' THEN 1 ELSE 0 END) AS reject_cases,
        COALESCE(SUM(CASE WHEN lower(dominant_status) = 'reject' THEN total_amount ELSE 0 END), 0) AS reject_amount
      FROM claim_case_summary ${where}
    `).bind(...params).first(),

    db.prepare(`
      SELECT
        ${trendPeriod} AS period,
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS amount,
        SUM(CASE WHEN upper(format_type) LIKE '%HYPER%' THEN 1 ELSE 0 END) AS hyper,
        SUM(CASE WHEN upper(format_type) LIKE '%FRANCHISE%' OR upper(format_type) LIKE '%FCH%' OR upper(format_type) = 'FC' OR upper(format_type) LIKE 'FC %' THEN 1 ELSE 0 END) AS franchise,
        SUM(CASE WHEN NOT (upper(format_type) LIKE '%HYPER%' OR upper(format_type) LIKE '%FRANCHISE%' OR upper(format_type) LIKE '%FCH%' OR upper(format_type) = 'FC' OR upper(format_type) LIKE 'FC %') THEN 1 ELSE 0 END) AS mbc
      FROM claim_case_summary ${where}
      GROUP BY period
      ORDER BY period
    `).bind(...params).all(),

    db.prepare(`
      SELECT
        hub,
        lower(dominant_status) AS status,
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS amount
      FROM claim_case_summary ${where}
        AND upper(COALESCE(hub, '')) NOT IN ('', '-', '#N/A', 'NORMAL', 'OTHER')
      GROUP BY hub, lower(dominant_status)
      ORDER BY COUNT(*) DESC
      LIMIT 120
    `).bind(...params).all(),

    db.prepare(`
      SELECT store_code, COUNT(*) AS count, COALESCE(SUM(total_amount), 0) AS amount
      FROM claim_case_summary ${where} AND trim(store_code) <> ''
      GROUP BY store_code
      ORDER BY count DESC, amount DESC
      LIMIT 8
    `).bind(...params).all(),

    db.prepare(`
      SELECT transport_no, store_code, reply_date, dominant_status, who, format_type,
             total_amount, item_count
      FROM claim_case_summary ${where}
      ORDER BY reply_date DESC, updated_at DESC
      LIMIT 8
    `).bind(...params).all(),

    db.prepare(`
      SELECT store_code, COUNT(*) AS count
      FROM claim_case_summary ${where}
        AND store_code IN (${check100Marks})
      GROUP BY store_code
    `).bind(...params, ...CHECK100_STORES).all(),

    db.prepare(`
      SELECT egg_values
      FROM claim_case_summary ${where} AND trim(egg_values) <> ''
      LIMIT 5000
    `).bind(...params).all()
  ]);

  const result = emptyDashboard(year, month);
  applySummary(result, summary || {});
  applyTrend(result, trendResult.results || [], month);
  applyHubs(result, hubResult.results || []);
  result.topStores = (storeResult.results || []).map((row) => ({
    storeCode: row.store_code,
    count: Number(row.count || 0),
    amount: Number(row.amount || 0)
  }));
  result.recent = (recentResult.results || []).map((row) => ({
    transportNo: row.transport_no,
    storeCode: row.store_code,
    replyDate: row.reply_date,
    status: String(row.dominant_status || 'Pending').toLowerCase(),
    who: row.who || '',
    format: String(row.format_type || '').toUpperCase(),
    amount: Number(row.total_amount || 0),
    itemCount: Number(row.item_count || 0)
  }));

  for (const row of check100Result.results || []) {
    result.check100[row.store_code] = Number(row.count || 0);
  }
  applyEggs(result, eggResult.results || []);

  result.meta = {
    generatedAt: new Date().toISOString(),
    startDate,
    endDate,
    source: 'claim_case_summary',
    aggregation: 'd1-sql',
    caseRule: '1 Transport = 1 Case',
    dominantStatusRule: 'Reject > Pending > Accept',
    eggsScanCappedAt: 5000
  };

  return json(200, { status: 'success', data: result });
}

function buildFilter(url) {
  const now = bangkokParts(new Date());
  const yearParam = url.searchParams.get('year') || String(now.year);
  const monthParam = url.searchParams.get('month') || String(now.month);
  const who = cleanFilter(url.searchParams.get('who'));
  const status = cleanFilter(url.searchParams.get('status'));
  const format = cleanFilter(url.searchParams.get('format'));

  const year = /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.year;
  const month = monthParam === 'all' ? 'all' : clampMonth(monthParam, now.month);
  const { startDate, endDate } = dateRange(year, month);
  const conditions = ['reply_date >= ?', 'reply_date <= ?'];
  const params = [startDate, endDate];

  if (who !== 'all') {
    if (who.toUpperCase() === 'DC') {
      conditions.push("(upper(who) LIKE '%DC%' OR upper(who) LIKE '%CDC%')");
    } else if (who.toUpperCase() === 'TP') {
      conditions.push("(upper(who) LIKE '%TP%' OR upper(who) LIKE '%TRANSPORT%')");
    } else {
      conditions.push('upper(who) = ?');
      params.push(who.toUpperCase());
    }
  }

  if (status !== 'all') {
    conditions.push('lower(dominant_status) = ?');
    params.push(status.toLowerCase());
  }

  if (format !== 'all') {
    if (format.toUpperCase() === 'MBC') {
      conditions.push("(upper(format_type) LIKE '%MBC%' OR upper(format_type) LIKE '%MINI%')");
    } else {
      conditions.push('upper(format_type) LIKE ?');
      params.push(`%${format.toUpperCase()}%`);
    }
  }

  return {
    year,
    month,
    startDate,
    endDate,
    where: `WHERE ${conditions.join(' AND ')}`,
    params
  };
}

function applySummary(result, row) {
  const summary = result.summary;
  summary.totalCases = Number(row.total_cases || 0);
  summary.totalAmount = Number(row.total_amount || 0);
  summary.totalItems = Number(row.total_items || 0);
  summary.acceptCases = Number(row.accept_cases || 0);
  summary.acceptAmount = Number(row.accept_amount || 0);
  summary.pendingCases = Number(row.pending_cases || 0);
  summary.pendingAmount = Number(row.pending_amount || 0);
  summary.rejectCases = Number(row.reject_cases || 0);
  summary.rejectAmount = Number(row.reject_amount || 0);
  if (summary.totalCases > 0) {
    summary.avgTicket = summary.totalAmount / summary.totalCases;
    summary.avgItemsPerCase = summary.totalItems / summary.totalCases;
    summary.completionRate = ((summary.acceptCases + summary.rejectCases) / summary.totalCases) * 100;
  }
  result.status = {
    accept: { count: summary.acceptCases, amount: summary.acceptAmount },
    pending: { count: summary.pendingCases, amount: summary.pendingAmount },
    reject: { count: summary.rejectCases, amount: summary.rejectAmount }
  };
}

function applyTrend(result, rows, month) {
  for (const row of rows) {
    const period = Number(row.period || 0);
    if (month === 'all') {
      if (period < 1 || period > 12) continue;
      result.monthly[period - 1] = {
        month: period,
        count: Number(row.count || 0),
        amount: Number(row.amount || 0)
      };
    } else {
      if (period < 1 || period > 31) continue;
      result.daily[period - 1] = {
        day: period,
        count: Number(row.count || 0),
        amount: Number(row.amount || 0),
        hyper: Number(row.hyper || 0),
        mbc: Number(row.mbc || 0),
        franchise: Number(row.franchise || 0)
      };
    }
    result.format.hyper += Number(row.hyper || 0);
    result.format.mbc += Number(row.mbc || 0);
    result.format.franchise += Number(row.franchise || 0);
  }
}

function applyHubs(result, rows) {
  for (const row of rows) {
    const hub = normalizeHub(row.hub);
    if (hub === 'NORMAL' || hub === 'OTHER') continue;
    if (!result.hubs[hub]) {
      result.hubs[hub] = {
        accept: { count: 0, amount: 0 },
        pending: { count: 0, amount: 0 },
        reject: { count: 0, amount: 0 }
      };
    }
    const status = ['accept', 'pending', 'reject'].includes(row.status) ? row.status : 'pending';
    result.hubs[hub][status] = {
      count: Number(row.count || 0),
      amount: Number(row.amount || 0)
    };
  }
}

function applyEggs(result, rows) {
  for (const row of rows) {
    for (const egg of String(row.egg_values || '').split(/[|,]/).map((value) => value.trim()).filter(Boolean)) {
      result.eggs[egg] = Number(result.eggs[egg] || 0) + 1;
    }
  }
}

function emptyDashboard(year, month) {
  return {
    year,
    month,
    summary: {
      totalAmount: 0,
      totalCases: 0,
      totalItems: 0,
      avgTicket: 0,
      avgItemsPerCase: 0,
      completionRate: 0,
      acceptCases: 0,
      acceptAmount: 0,
      pendingCases: 0,
      pendingAmount: 0,
      rejectCases: 0,
      rejectAmount: 0
    },
    monthly: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, amount: 0, count: 0 })),
    daily: Array.from({ length: 31 }, (_, index) => ({ day: index + 1, amount: 0, count: 0, hyper: 0, mbc: 0, franchise: 0 })),
    status: {},
    eggs: {},
    hubs: {},
    format: { hyper: 0, mbc: 0, franchise: 0 },
    check100: {},
    topStores: [],
    recent: [],
    meta: {}
  };
}

function dateRange(year, month) {
  if (month === 'all') return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  };
}

function bangkokParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function clampMonth(value, fallback) {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : fallback;
}

function cleanFilter(value) {
  const text = String(value || 'all').trim();
  return text || 'all';
}

function normalizeHub(value) {
  const hub = String(value || '').trim().toUpperCase();
  return !hub || hub === '-' || hub === '#N/A' ? 'OTHER' : hub;
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()))];
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
