// GET /api/conversions-summary
// Retorna resumo de conversões para o período — usado pelo /relatorio/.
// Auth: ?key=CLIENT_KEY ou DASH_KEY
// Query params: since (YYYY-MM-DD), until (YYYY-MM-DD)
//
// Retorna:
//   { ok, contacts, purchases, revenue_cents,
//     meta:   { contacts, purchases, revenue_cents },
//     google: { contacts, purchases, revenue_cents } }
//
// Fonte primária: Supabase (contatos + vendas) quando configurado.
// Fallback: D1 manual_conversions (totais sem breakdown de canal).

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const key = url.searchParams.get('key') || '';
  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  const since = url.searchParams.get('since') || '';
  const until = url.searchParams.get('until') || '';

  // ── Supabase (preferência) ───────────────────────────────────────────────
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const SB_URL = env.SUPABASE_URL;
    const sbH = {
      'apikey':        env.SUPABASE_SERVICE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_SERVICE_KEY,
    };

    function canal(c) {
      if (c.origem === 'anuncio_google' || c.gclid) return 'google';
      if (c.ctwa_clid || c.origem === 'anuncio_meta' || c.origem === 'meta') return 'meta';
      return 'outro';
    }

    // 1. Contatos novos no período
    let contatos = [];
    try {
      const p = new URLSearchParams({
        select:         'id,origem,gclid,ctwa_clid',
        client_slug:    'eq.fort-popular',
        'tipo_contato': 'not.eq.pessoal',
        limit:          '1000',
      });
      if (since) p.append('primeiro_contato_em', `gte.${since}T00:00:00`);
      if (until) p.append('primeiro_contato_em', `lte.${until}T23:59:59`);
      const r = await fetch(`${SB_URL}/rest/v1/contatos?${p}`, { headers: sbH });
      if (r.ok) contatos = await r.json();
    } catch (_) {}

    // 2. Vendas confirmadas no período
    let vendas = [];
    try {
      const p = new URLSearchParams({
        select:      'contato_id,valor',
        client_slug: 'eq.fort-popular',
        revisao:     'eq.confirmada',
        limit:       '500',
      });
      if (since) p.append('created_at', `gte.${since}T00:00:00`);
      if (until) p.append('created_at', `lte.${until}T23:59:59`);
      const r = await fetch(`${SB_URL}/rest/v1/vendas?${p}`, { headers: sbH });
      if (r.ok) vendas = await r.json();
    } catch (_) {}

    // Mapa contato_id → canal
    const contatoCanal = {};
    let metaContacts = 0, googleContacts = 0;
    for (const c of contatos) {
      const ch = canal(c);
      contatoCanal[c.id] = ch;
      if (ch === 'meta')   metaContacts++;
      if (ch === 'google') googleContacts++;
    }

    // Agrega vendas por canal
    let metaPurchases = 0, metaRevenue = 0;
    let googlePurchases = 0, googleRevenue = 0;
    let totalRevenue = 0;
    for (const v of vendas) {
      const val = parseFloat(v.valor || 0);
      totalRevenue += val;
      const ch = contatoCanal[v.contato_id];
      if (ch === 'meta')   { metaPurchases++;   metaRevenue   += val; }
      if (ch === 'google') { googlePurchases++; googleRevenue += val; }
    }

    return json({
      ok:            true,
      contacts:      contatos.length,
      purchases:     vendas.length,
      revenue_cents: Math.round(totalRevenue * 100),
      meta: {
        contacts:      metaContacts,
        purchases:     metaPurchases,
        revenue_cents: Math.round(metaRevenue * 100),
      },
      google: {
        contacts:      googleContacts,
        purchases:     googlePurchases,
        revenue_cents: Math.round(googleRevenue * 100),
      },
    });
  }

  // ── Fallback D1 (sem breakdown de canal) ────────────────────────────────
  if (!env.DB) return json({ error: 'DB não configurado' }, 500);

  let where = '';
  const binds = [];
  if (since) { where += (where ? ' AND ' : ' WHERE ') + 'event_date >= ?'; binds.push(since); }
  if (until) { where += (where ? ' AND ' : ' WHERE ') + 'event_date <= ?'; binds.push(until); }

  const rows = await env.DB.prepare(`
    SELECT
      event_name,
      COUNT(*) as count,
      SUM(CASE WHEN event_name = 'Purchase' THEN value_cents ELSE 0 END) as revenue_cents
    FROM manual_conversions
    ${where}
    GROUP BY event_name
  `).bind(...binds).all();

  const summary = { contacts: 0, purchases: 0, revenue_cents: 0 };
  for (const r of (rows.results || [])) {
    if (r.event_name === 'Contact')  summary.contacts  = r.count;
    if (r.event_name === 'Purchase') {
      summary.purchases     = r.count;
      summary.revenue_cents = r.revenue_cents || 0;
    }
  }

  return json({
    ok: true,
    ...summary,
    meta:   { contacts: 0, purchases: 0, revenue_cents: 0 },
    google: { contacts: 0, purchases: 0, revenue_cents: 0 },
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
