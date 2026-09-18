// GET /api/conversions-summary
// Retorna resumo de conversões manuais para o período — usado pelo /relatorio/
// Auth: ?key=CLIENT_KEY
// Query params:
//   since  (YYYY-MM-DD)
//   until  (YYYY-MM-DD)
//
// Fort Popular usa apenas Contact e Purchase (sem Schedule — farmácia não agenda).

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const key = url.searchParams.get('key') || '';
  if (!env.CLIENT_KEY || key !== env.CLIENT_KEY) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.DB) return json({ error: 'DB não configurado' }, 500);

  const since = url.searchParams.get('since') || '';
  const until = url.searchParams.get('until') || '';

  let where = '';
  const binds = [];
  if (since) { where += (where ? ' AND ' : ' WHERE ') + 'event_date >= ?'; binds.push(since); }
  if (until) { where += (where ? ' AND ' : ' WHERE ') + 'event_date <= ?'; binds.push(until); }

  const rows = await env.DB.prepare(`
    SELECT
      event_name,
      COUNT(*) as count,
      SUM(CASE WHEN event_name = 'Purchase' THEN value_cents ELSE 0 END) as revenue_cents
    FROM manual_conversions
    ${where}
    GROUP BY event_name
  `).bind(...binds).all();

  const summary = { contacts: 0, purchases: 0, revenue_cents: 0 };
  for (const r of (rows.results || [])) {
    if (r.event_name === 'Contact')  summary.contacts  = r.count;
    if (r.event_name === 'Purchase') {
      summary.purchases     = r.count;
      summary.revenue_cents = r.revenue_cents || 0;
    }
  }

  return json({ ok: true, ...summary });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
