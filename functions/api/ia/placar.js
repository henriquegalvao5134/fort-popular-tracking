// GET /api/ia/placar
//
// Retorna estatísticas de precisão da IA para Fort Popular:
// total analisado, confirmadas, rejeitadas, pendentes, taxa de acerto
//
// Auth: ?key=<DASH_KEY> ou <CLIENT_KEY>

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const sbHeaders = {
    'apikey':        SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
  };

  // Busca os campos necessários para calcular o placar (limit 1000 registros recentes)
  const params = new URLSearchParams({
    select:      'ai_verdict,human_label,ai_confidence',
    client_slug: 'eq.fort-popular',
    limit:       '1000',
    order:       'created_at.desc',
  });

  try {
    const resp = await fetch(`${SB_URL}/rest/v1/conversation_labels?${params}`, { headers: sbHeaders });
    if (!resp.ok) return json({ error: 'Supabase error', status: resp.status }, 502);
    const rows = await resp.json();

    const total      = rows.length;
    const confirmed  = rows.filter(r => r.human_label === 'venda').length;
    const rejected   = rows.filter(r => r.human_label === 'nao_venda').length;
    const pending    = rows.filter(r => r.ai_verdict === 'venda' && !r.human_label).length;
    const reviewed   = confirmed + rejected;

    // Taxa de acerto: dentre os revisados, quantos a IA acertou (disse venda e foi confirmado)
    const accuracy = reviewed > 0 ? Math.round((confirmed / reviewed) * 100) : null;

    // Distribuição dos veredictos da IA
    const aiVenda   = rows.filter(r => r.ai_verdict === 'venda').length;
    const aiContato = rows.filter(r => r.ai_verdict === 'contato').length;
    const aiAberto  = rows.filter(r => r.ai_verdict === 'em_aberto').length;

    // Confiança média da IA nas predições de venda
    const vendasConf  = rows.filter(r => r.ai_verdict === 'venda' && r.ai_confidence);
    const avgConf     = vendasConf.length > 0
      ? Math.round(vendasConf.reduce((s, r) => s + r.ai_confidence, 0) / vendasConf.length * 100)
      : null;

    return json({
      ok: true,
      total,
      confirmed,
      rejected,
      pending,
      reviewed,
      accuracy,
      avg_confidence_pct: avgConf,
      ai_breakdown: { venda: aiVenda, contato: aiContato, em_aberto: aiAberto },
    });
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
