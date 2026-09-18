// POST /api/update-conversion
//
// Atualiza um registro de conversão existente.
// Casos de uso:
//   - Promover Contact → Purchase (adicionar valor)
//   - Corrigir nome, produto, observação, data, origem, tipo ou valor
//
// Auth:  header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body:  { id, event_name?, value?, display_name?, produto?, observacao?, event_date?, origem? }

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-dash-key',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const key = request.headers.get('x-dash-key') || '';
  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }

  const { id, event_name, value, display_name, produto, observacao, event_date, origem } = body;

  if (!id) return json({ error: 'id é obrigatório' }, 400);
  if (event_name && !['Contact', 'Purchase'].includes(event_name)) {
    return json({ error: 'event_name inválido' }, 400);
  }
  const ORIGENS = ['ad', 'google', 'organic', 'referral'];
  if (origem && !ORIGENS.includes(origem)) {
    return json({ error: 'origem inválida' }, 400);
  }
  if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) {
    return json({ error: 'event_date deve ser YYYY-MM-DD' }, 400);
  }

  if (!env.DB) return json({ error: 'DB não configurado' }, 500);

  const sets = [];
  const binds = [];

  if (event_name)                      { sets.push('event_name = ?');   binds.push(event_name); }
  if (value !== undefined)             { sets.push('value_cents = ?');   binds.push(Math.round(parseBRFloat(value) * 100)); }
  if (display_name !== undefined)      { sets.push('display_name = ?'); binds.push(display_name.trim()); }
  if (produto !== undefined)           { sets.push('produto = ?');       binds.push(produto.trim()); }
  if (observacao !== undefined)        { sets.push('observacao = ?');    binds.push(observacao.trim()); }
  if (event_date)                      { sets.push('event_date = ?');    binds.push(event_date); }
  if (origem)                          { sets.push('origem = ?');        binds.push(origem); }

  if (!sets.length) return json({ error: 'Nada para atualizar' }, 400);

  binds.push(id);
  await env.DB.prepare(`UPDATE manual_conversions SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...binds).run();

  return json({ ok: true, updated_id: id });
}

function parseBRFloat(str) {
  if (!str && str !== 0) return 0;
  const s = String(str).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
