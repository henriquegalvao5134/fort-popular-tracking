// POST /api/ia/contato
//
// Atualiza dados de um contato (telefone e/ou nome_validado).
// Usado principalmente para adicionar telefone real em contatos com JID lid:.
//
// Auth: header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body: {
//   id:            UUID do contato (contatos.id)   ← obrigatório
//   telefone?:     número real (55DDD…)
//   nome_validado?:nome corrigido
// }

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-dash-key',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const key      = request.headers.get('x-dash-key') || '';
  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const { id, telefone, nome_validado } = body;
  if (!id) return json({ error: 'id é obrigatório' }, 400);

  const patch = {};
  if (telefone     !== undefined && telefone     !== null) patch.telefone      = String(telefone).trim();
  if (nome_validado !== undefined && nome_validado !== null) patch.nome_validado = String(nome_validado).trim();

  if (Object.keys(patch).length === 0) {
    return json({ error: 'Nenhum campo para atualizar. Envie telefone e/ou nome_validado.' }, 400);
  }

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/contatos?id=eq.${id}&client_slug=eq.fort-popular`,
      {
        method:  'PATCH',
        headers: {
          'apikey':        SB_KEY,
          'Authorization': 'Bearer ' + SB_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(patch),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return json({ error: 'Supabase PATCH error: ' + errText }, 502);
    }

    return json({ ok: true, id, updated: Object.keys(patch) });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
