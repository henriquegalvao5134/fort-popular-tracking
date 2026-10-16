// POST /api/ia/etapa
//
// Atualiza a etapa do funil de um contato (CRM stage).
//
// Auth: header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body: {
//   id:     UUID do contato (contatos.id)   ← obrigatório
//   etapa:  'lead' | 'oportunidade' | 'vendido' | 'perdido' | 'recorrente'  ← obrigatório
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

  const auth = await validateAuth(request, env);
  if (!auth.valid) return json({ error: 'Unauthorized' }, 401);

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const { id, etapa } = body;
  if (!id)    return json({ error: 'id é obrigatório' }, 400);
  if (!etapa) return json({ error: 'etapa é obrigatória' }, 400);

  const VALID = ['lead', 'oportunidade', 'vendido', 'perdido', 'recorrente'];
  if (!VALID.includes(etapa)) {
    return json({ error: `etapa inválida. Use: ${VALID.join(' | ')}` }, 400);
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
        body: JSON.stringify({ etapa }),
      }
    );

    if (!r.ok) {
      const errText = await r.text();
      return json({ error: 'Supabase PATCH error: ' + errText }, 502);
    }

    return json({ ok: true, id, etapa });
  } catch (e) {
    return json({ error: e.message }, 502);
  }
}

async function validateAuth(request, env) {
  const key = request.headers.get('x-dash-key') || '';
  if ((env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY)) return { valid: true };
  const authH = request.headers.get('Authorization') || '';
  if (authH.startsWith('Bearer ') && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': authH },
    });
    if (r.ok) return { valid: true };
  }
  return { valid: false };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
