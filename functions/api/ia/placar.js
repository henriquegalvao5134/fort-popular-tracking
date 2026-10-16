// GET /api/ia/placar
//
// Estatísticas de precisão da IA e funil de vendas para Fort Popular.
// Fonte real: tabelas analises + contatos (n8n escreve aqui desde out/2026).
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

  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  try {
    // ── Analises ────────────────────────────────────────────────────
    const aParams = new URLSearchParams({
      select:      'status,revisao,confianca',
      client_slug: 'eq.fort-popular',
      order:       'created_at.desc',
      limit:       '1000',
    });
    const aResp = await fetch(`${SB_URL}/rest/v1/analises?${aParams}`, { headers: sbH });
    if (!aResp.ok) return json({ error: 'Supabase analises error', status: aResp.status }, 502);
    const rows = await aResp.json();

    // ── Contatos ─────────────────────────────────────────────────────
    const cParams = new URLSearchParams({
      select:      'etapa,tipo_contato',
      client_slug: 'eq.fort-popular',
      'tipo_contato': 'not.eq.pessoal',
      limit:       '500',
    });
    const cResp = await fetch(`${SB_URL}/rest/v1/contatos?${cParams}`, { headers: sbH });
    const contatos = cResp.ok ? await cResp.json() : [];

    // ── Estatísticas das análises ─────────────────────────────────────
    const total     = rows.length;
    const confirmed = rows.filter(r => r.revisao === 'confirmada' || r.revisao === 'automatica').length;
    const rejected  = rows.filter(r => r.revisao === 'rejeitada').length;
    const pending   = rows.filter(r => r.status === 'venda' && r.revisao === 'pendente').length;
    const reviewed  = confirmed + rejected;

    const accuracy = reviewed > 0 ? Math.round((confirmed / reviewed) * 100) : null;

    const aiVenda    = rows.filter(r => r.status === 'venda').length;
    const aiPerdida  = rows.filter(r => r.status === 'perdida').length;
    const aiAberto   = rows.filter(r => r.status === 'em_aberto').length;
    const aiNaoComercial = rows.filter(r => r.status === 'nao_comercial').length;

    const vendasConf = rows.filter(r => r.status === 'venda' && r.confianca);
    const avgConf    = vendasConf.length > 0
      ? Math.round(vendasConf.reduce((s, r) => s + r.confianca, 0) / vendasConf.length)
      : null;

    // ── Funil por etapa ───────────────────────────────────────────────
    const etapaCount = {};
    for (const c of contatos) {
      const e = c.etapa || 'lead';
      etapaCount[e] = (etapaCount[e] || 0) + 1;
    }

    return json({
      ok: true,
      total,
      confirmed,
      rejected,
      pending,
      reviewed,
      accuracy,
      avg_confidence_pct: avgConf,
      ai_breakdown: {
        venda:        aiVenda,
        perdida:      aiPerdida,
        em_aberto:    aiAberto,
        nao_comercial: aiNaoComercial,
      },
      total_contatos: contatos.length,
      funil_etapa: etapaCount,
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
