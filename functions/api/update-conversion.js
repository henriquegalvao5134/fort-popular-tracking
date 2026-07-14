// POST /api/update-conversion
//
// Atualiza um registro de conversão existente.
// Casos de uso:
//   - Promover Contact → Purchase (adicionar valor)
//   - Corrigir valor de uma venda
//
// Auth:  header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body:  { id, event_name?, value? }

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

  const { id, event_name, value } = body;

  if (!id) return json({ error: 'id é obrigatório' }, 400);
  if (event_name && !['Contact', 'Purchase'].includes(event_name)) {
    return json({ error: 'event_name inválido' }, 400);
  }

  if (!env.DB) return json({ error: 'DB não configurado' }, 500);

  const sets = [];
  const binds = [];

  if (event_name) { sets.push('event_name = ?'); binds.push(event_name); }
  if (value !== undefined) {
    const valueCents = Math.round(parseBRFloat(value) * 100);
    sets.push('value_cents = ?'); binds.push(valueCents);
  }

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
