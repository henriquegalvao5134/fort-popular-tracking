// GET /api/clients-report
//
// Retorna clientes agrupados com LTV all-time, visitas e datas para /clientes/.
// Auth: ?key=<CLIENT_KEY> ou <DASH_KEY>
// Params:
//   since  YYYY-MM-DD (padrão: 1º do mês atual)
//   until  YYYY-MM-DD (padrão: hoje)
//
// Retorna:
//   { ok, clients: [...], new_clients, cac_cents, spend_cents }

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB)   return json({ error: 'DB não configurado' }, 500);

  const now = new Date();
  const since = url.searchParams.get('since') ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const until = url.searchParams.get('until') ||
    now.toISOString().slice(0, 10);

  // Clientes que apareceram no período — stats all-time
  const clientsSQL = `
    SELECT
      mc_all.phone_normalized,
      MAX(mc_all.phone_last4) AS phone_last4,
      (
        SELECT display_name FROM manual_conversions
        WHERE phone_normalized = mc_all.phone_normalized
          AND display_name IS NOT NULL AND display_name != ''
        ORDER BY registered_at DESC LIMIT 1
      ) AS display_name,
      COALESCE(SUM(mc_all.value_cents), 0) AS total_cents,
      COUNT(mc_all.id) AS visits,
      MIN(mc_all.event_date) AS first_visit,
      MAX(mc_all.event_date) AS last_visit
    FROM manual_conversions mc_all
    WHERE mc_all.phone_normalized != ''
      AND mc_all.phone_normalized IN (
        SELECT DISTINCT phone_normalized FROM manual_conversions
        WHERE event_date >= ? AND event_date <= ?
          AND phone_normalized != ''
      )
    GROUP BY mc_all.phone_normalized
    ORDER BY total_cents DESC, visits DESC
    LIMIT 500
  `;

  // Novos clientes: primeiro registro ever cai no período
  const newSQL = `
    SELECT COUNT(*) AS cnt FROM (
      SELECT phone_normalized
      FROM manual_conversions
      WHERE phone_normalized != ''
      GROUP BY phone_normalized
      HAVING MIN(event_date) >= ? AND MIN(event_date) <= ?
    )
  `;

  // Gasto Meta no período
  const spendSQL = `
    SELECT COALESCE(SUM(CAST(spend AS REAL) * 100), 0) AS sc
    FROM ad_spend
    WHERE date_start >= ? AND date_start <= ?
  `;

  try {
    const [clientsRes, newRes, spendRes] = await Promise.all([
      env.DB.prepare(clientsSQL).bind(since, until).all(),
      env.DB.prepare(newSQL).bind(since, until).first(),
      env.DB.prepare(spendSQL).bind(since, until).first(),
    ]);

    const newClients = newRes?.cnt || 0;
    const spendCents = Math.round(spendRes?.sc || 0);
    const cacCents   = newClients > 0 ? Math.round(spendCents / newClients) : 0;

    return json({
      ok: true,
      clients:     clientsRes.results || [],
      new_clients: newClients,
      cac_cents:   cacCents,
      spend_cents: spendCents,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
