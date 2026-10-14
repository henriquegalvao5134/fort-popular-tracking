// GET /api/agent-conversations
//
// Retorna conversas classificadas pelo Agente IA (n8n → Supabase conversation_labels)
// Auth: ?key=<CLIENT_KEY> ou <DASH_KEY>
// Params:
//   from   YYYY-MM-DD
//   to     YYYY-MM-DD
//   q      busca livre: telefone ou trecho da conversa
//   limit  máx 500 (padrão: 200)

const SB_URL = 'https://wjbtazzvazdrpajbimkb.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYnRhenp2YXpkcnBhamJpbWtiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTkxNTg0NywiZXhwIjoyMTA3NDkxODQ3fQ.oK7ZeEOlOsKnoR6R_a0rNQpVsxruRxVJloeFiS1lmiQ';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const key    = url.searchParams.get('key')   || '';
  const from   = url.searchParams.get('from')  || '';
  const to     = url.searchParams.get('to')    || '';
  const q      = (url.searchParams.get('q')    || '').trim();
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  // Monta filtros Supabase (PostgREST)
  const params = new URLSearchParams({
    select: '*',
    order:  'created_at.desc',
    limit:  String(limit),
    client_slug: 'eq.fort-popular',
  });

  if (from) params.append('created_at', `gte.${from}T00:00:00`);
  if (to)   params.append('created_at', `lte.${to}T23:59:59`);
  if (q) {
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 3) {
      params.append('phone', `like.%${digits.slice(-8)}`);
    } else {
      params.append('conversation_excerpt', `ilike.%${q}%`);
    }
  }

  const sbHeaders = {
    'apikey':        SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type':  'application/json',
  };

  let rows = [];
  try {
    const resp = await fetch(`${SB_URL}/rest/v1/conversation_labels?${params}`, { headers: sbHeaders });
    if (!resp.ok) return json({ error: 'Supabase error', status: resp.status }, 502);
    rows = await resp.json();
  } catch (e) {
    return json({ error: 'Supabase fetch failed: ' + e.message }, 502);
  }

  // Normaliza para formato compatível com o painel
  const conversions = rows.map(r => {
    const phone = r.phone || '';
    const last4 = phone.replace(/\D/g, '').slice(-4);
    const valueCents = r.value_brl ? Math.round(parseFloat(r.value_brl) * 100) : 0;
    const dateStr = r.created_at ? r.created_at.slice(0, 10) : '';

    return {
      id:              `ai_${r.id}`,
      source:          'agent',                        // distingue do manual
      event_name:      r.human_label === 'venda' ? 'Purchase' : 'Contact',
      display_name:    r.phone || '',
      phone_last4:     last4,
      phone_normalized: phone.replace(/\D/g, ''),
      value_cents:     valueCents,
      event_date:      dateStr,
      origem:          r.session_id || 'organic',
      meta_ok:         r.human_label === 'venda' ? 1 : 0,
      registered_at:   r.created_at ? Math.floor(new Date(r.created_at).getTime() / 1000) : 0,
      produto:         r.product || '',
      observacao:      r.ai_verdict || '',
      ai_confidence:   r.ai_confidence || 0,
      chat_id:         r.chat_id || '',
      excerpt:         r.conversation_excerpt || '',
      human_label:     r.human_label || null,
      // LTV não calculado neste endpoint
      client_ltv_cents: 0,
      client_purchases: 0,
    };
  });

  const purchases  = conversions.filter(c => c.event_name === 'Purchase');
  const revenue    = purchases.reduce((s, c) => s + (c.value_cents || 0), 0);

  return json({
    ok: true,
    conversions,
    summary: {
      total:     conversions.length,
      purchases: purchases.length,
      revenue_cents: revenue,
    },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
