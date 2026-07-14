// GET /api/conversions-history
//
// Retorna conversões manuais registradas, com filtros opcionais.
// Auth: query param ?key=<CLIENT_KEY> ou <DASH_KEY>
// Query params:
//   key    obrigatório
//   date   YYYY-MM-DD — filtra por dia específico (padrão: últimos 30 dias)
//   phone  últimos 4 dígitos — busca por cliente
//   limit  máximo de registros (padrão: 100)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key    = url.searchParams.get('key') || '';
  const date   = url.searchParams.get('date') || '';
  const phone  = url.searchParams.get('phone') || '';
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  if (!env.DB) return json({ error: 'DB não configurado' }, 500);

  let query = `SELECT id, event_id, event_name, display_name, phone_last4,
                      value_cents, event_date, origem, meta_ok, registered_at
               FROM manual_conversions`;
  const binds = [];
  const conditions = [];

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    conditions.push('event_date = ?');
    binds.push(date);
  } else {
    conditions.push("event_date >= date('now', '-30 days')");
  }

  if (phone && /^\d+$/.test(phone)) {
    conditions.push('phone_last4 = ?');
    binds.push(phone.slice(-4));
  }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY registered_at DESC LIMIT ?';
  binds.push(limit);

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return json({ ok: true, conversions: results });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
