// GET /api/conversions-history
//
// Retorna conversões manuais com LTV do cliente e gasto Meta do período.
// Auth: ?key=<CLIENT_KEY> ou <DASH_KEY>
// Params:
//   from   YYYY-MM-DD (padrão: 1º do mês atual)
//   to     YYYY-MM-DD (padrão: hoje)
//   date   YYYY-MM-DD (dia único — sobrepõe from/to)
//   q      busca livre: nome OU telefone (parcial ou completo)
//   limit  máx 500 (padrão: 200)
//
// Retorna:
//   { ok, conversions: [..., client_ltv_cents, client_purchases], spend_cents }

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key   = url.searchParams.get('key')   || '';
  const date  = url.searchParams.get('date')  || '';
  const from  = url.searchParams.get('from')  || '';
  const to    = url.searchParams.get('to')    || '';
  const q     = (url.searchParams.get('q')    || '').trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return json({ error: 'DB não configurado' }, 500);

  // ── Período ──────────────────────────────────────────────────
  const binds = [];
  const conditions = [];
  let fromDate = '';
  let toDate   = '';

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    conditions.push('mc.event_date = ?');
    binds.push(date);
    fromDate = toDate = date;
  } else {
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      conditions.push('mc.event_date >= ?'); binds.push(from); fromDate = from;
    } else {
      conditions.push("mc.event_date >= date('now', 'start of month')");
      const d = new Date();
      fromDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      conditions.push('mc.event_date <= ?'); binds.push(to); toDate = to;
    } else {
      conditions.push("mc.event_date <= date('now')");
      toDate = new Date().toISOString().slice(0, 10);
    }
  }

  // ── Busca por nome ou telefone ───────────────────────────────
  if (q) {
    const digits    = q.replace(/\D/g, '');
    const hasLetras = /[a-zA-ZÀ-ú]/.test(q);

    if (hasLetras) {
      // Nome (pode conter dígitos, ex: "Maria 9876")
      conditions.push('mc.display_name LIKE ?');
      binds.push(`%${q}%`);
    } else if (digits.length >= 3) {
      // Telefone puro
      const last4 = digits.slice(-4);
      if (digits.length <= 4) {
        conditions.push('mc.phone_last4 = ?');
        binds.push(last4);
      } else {
        conditions.push('(mc.phone_last4 = ? OR mc.phone_normalized LIKE ?)');
        binds.push(last4, `%${digits.slice(-8)}`);
      }
    }
  }

  const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  // ── Conversões + LTV por cliente (all-time) ──────────────────
  const mainSQL = `
    SELECT mc.id, mc.event_id, mc.event_name, mc.display_name,
           mc.phone_last4, mc.phone_normalized, mc.value_cents,
           mc.event_date, mc.origem, mc.meta_ok, mc.registered_at,
           mc.produto, mc.observacao,
           COALESCE(ltv.total_cents, 0)    AS client_ltv_cents,
           COALESCE(ltv.purchase_count, 0) AS client_purchases
    FROM manual_conversions mc
    LEFT JOIN (
      SELECT phone_normalized,
             SUM(value_cents)  AS total_cents,
             COUNT(*)          AS purchase_count
      FROM manual_conversions
      WHERE event_name = 'Purchase' AND phone_normalized != ''
      GROUP BY phone_normalized
    ) ltv ON mc.phone_normalized = ltv.phone_normalized
    ${whereClause}
    ORDER BY mc.event_date DESC, mc.registered_at DESC
    LIMIT ?
  `;
  binds.push(limit);

  // ── Gasto Meta no período (tabela ad_spend) ───────────────────
  let spendCents = 0;
  try {
    const spB = [];
    let spW = '';
    if (fromDate && toDate) {
      spW = 'WHERE date_start >= ? AND date_start <= ?';
      spB.push(fromDate, toDate);
    } else if (fromDate) {
      spW = 'WHERE date_start >= ?';
      spB.push(fromDate);
    }
    const spRes = await env.DB
      .prepare(`SELECT COALESCE(SUM(CAST(spend AS REAL) * 100), 0) AS sc FROM ad_spend ${spW}`)
      .bind(...spB).first();
    spendCents = Math.round(spRes?.sc || 0);
  } catch (_) {}

  const { results } = await env.DB.prepare(mainSQL).bind(...binds).all();
  return json({ ok: true, conversions: results, spend_cents: spendCents });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
