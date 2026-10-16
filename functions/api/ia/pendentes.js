// GET /api/ia/pendentes
//
// Retorna conversas onde a IA classificou como 'venda' mas a equipe ainda não revisou
// (human_label IS NULL). Usado para badges de contador e notificações.
//
// Auth: ?key=<DASH_KEY> ou <CLIENT_KEY>
// Params:
//   limit   máx 200 (padrão: 100)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);

  const params = new URLSearchParams({
    select: 'id,phone,value_brl,product,ai_confidence,conversation_excerpt,created_at,chat_id',
    order:  'created_at.desc',
    limit:  String(limit),
    client_slug: 'eq.fort-popular',
    ai_verdict:  'eq.venda',
    human_label: 'is.null',
  });

  try {
    const resp = await fetch(`${SB_URL}/rest/v1/conversation_labels?${params}`, {
      headers: {
        'apikey':        SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
      },
    });
    if (!resp.ok) return json({ error: 'Supabase error', status: resp.status }, 502);
    const rows = await resp.json();
    return json({ ok: true, items: rows, total: rows.length });
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
