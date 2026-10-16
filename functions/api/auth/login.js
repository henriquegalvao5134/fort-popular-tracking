// POST /api/auth/login
// Body: { email, password }
// Returns: { token, refresh_token, expires_in, user: { id, email } }
//
// Autentica via Supabase Auth (email + senha).
// Não requer chave de acesso — é a própria autenticação.

export async function onRequestPost(context) {
  const { request, env } = context;

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;

  if (!SB_URL || !SB_KEY) {
    return json({ error: 'Supabase não configurado' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo da requisição inválido' }, 400);
  }

  const { email, password } = body || {};
  if (!email || !password) {
    return json({ error: 'Email e senha obrigatórios' }, 400);
  }

  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method:  'POST',
    headers: {
      'apikey':       SB_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await r.json();

  if (!r.ok) {
    const msg = data.error_description || data.message || 'Credenciais inválidas';
    return json({ error: msg }, 401);
  }

  return json({
    token:         data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in,
    user: {
      id:    data.user?.id,
      email: data.user?.email,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: cors(),
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors() },
  });
}

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
