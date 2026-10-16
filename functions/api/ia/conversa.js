// GET /api/ia/conversa
//
// Retorna a conversa completa: label do Supabase + mensagens da tabela mensagens
// Auth: ?key=<DASH_KEY> ou <CLIENT_KEY>
// Params:
//   id   UUID da conversation_labels (sem prefixo 'ai_')

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const id  = url.searchParams.get('id')  || '';

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);
  if (!id)       return json({ error: 'id é obrigatório' }, 400);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const sbHeaders = {
    'apikey':        SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
  };

  // ── Busca o label ────────────────────────────────────────────────
  let label;
  try {
    const labelParams = new URLSearchParams({
      select: '*',
      id:     `eq.${id}`,
      limit:  '1',
    });
    const resp = await fetch(`${SB_URL}/rest/v1/conversation_labels?${labelParams}`, { headers: sbHeaders });
    if (!resp.ok) return json({ error: 'Supabase error', status: resp.status }, 502);
    const rows = await resp.json();
    if (!rows.length) return json({ error: 'Conversa não encontrada' }, 404);
    label = rows[0];
  } catch (e) {
    return json({ error: 'Erro ao buscar label: ' + e.message }, 502);
  }

  // Valida cliente
  if (label.client_slug !== 'fort-popular') return json({ error: 'Acesso negado' }, 403);

  // ── Busca mensagens pelo chat_id ─────────────────────────────────
  let mensagens = [];
  if (label.chat_id) {
    try {
      const msgParams = new URLSearchParams({
        select:      'id,tipo,texto_extraido,from_me,created_at',
        chat_id:     `eq.${label.chat_id}`,
        client_slug: 'eq.fort-popular',
        order:       'created_at.asc',
        limit:       '300',
      });
      const resp = await fetch(`${SB_URL}/rest/v1/mensagens?${msgParams}`, { headers: sbHeaders });
      if (resp.ok) mensagens = await resp.json();
    } catch (_) { /* retorna array vazio */ }
  }

  return json({ ok: true, label, mensagens });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
