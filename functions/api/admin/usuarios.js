// GET    /api/admin/usuarios        → lista usuários
// POST   /api/admin/usuarios        → cria usuário { email, password }
// DELETE /api/admin/usuarios?id=    → remove usuário
//
// Auth: apenas DASH_KEY (admin). JWT de usuário comum não tem acesso.

export async function onRequest(context) {
  const { request, env } = context;

  // ── Auth: apenas DASH_KEY ──
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || request.headers.get('x-dash-key') || '';

  // Também aceita Bearer de admin via Supabase (user com role 'admin' no metadata)
  // Por ora: apenas DASH_KEY para simplicidade
  if (!env.DASH_KEY || key !== env.DASH_KEY) {
    // Verifica Bearer — somente admin
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const isAdmin = await checkAdminToken(token, env);
      if (!isAdmin) return json({ error: 'Unauthorized — apenas admin' }, 401);
    } else {
      return json({ error: 'Unauthorized' }, 401);
    }
  }

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const sbH = {
    'apikey':       SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
  };

  // ── GET — lista ──
  if (request.method === 'GET') {
    const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=1&per_page=100`, {
      headers: sbH,
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data.message || 'Erro ao listar' }, r.status);

    const users = (data.users || []).map(u => ({
      id:         u.id,
      email:      u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      role:       u.role,
    }));
    return json({ ok: true, users });
  }

  // ── POST — cria ──
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Corpo inválido' }, 400); }
    const { email, password } = body || {};
    if (!email || !password) return json({ error: 'email e password obrigatórios' }, 400);
    if (password.length < 6)  return json({ error: 'Senha mínima: 6 caracteres' }, 400);

    const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method:  'POST',
      headers: sbH,
      body:    JSON.stringify({ email, password, email_confirm: true }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: data.message || 'Erro ao criar' }, r.status);

    return json({ ok: true, user: { id: data.id, email: data.email } });
  }

  // ── DELETE — remove ──
  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id obrigatório' }, 400);

    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${id}`, {
      method:  'DELETE',
      headers: sbH,
    });
    if (r.status === 204 || r.ok) return json({ ok: true });
    const data = await r.json().catch(() => ({}));
    return json({ error: data.message || 'Erro ao remover' }, r.status);
  }

  return json({ error: 'Método não suportado' }, 405);
}

async function checkAdminToken(token, env) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':        env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + token,
      },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return u?.app_metadata?.role === 'admin';
  } catch {
    return false;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-dash-key',
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-dash-key',
    },
  });
}
