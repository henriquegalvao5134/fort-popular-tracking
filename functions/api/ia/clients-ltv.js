// GET /api/ia/clients-ltv
//
// Retorna clientes Fort Popular com LTV all-time, recorrência e CAC por canal.
// Fonte: Supabase (contatos + vendas) + D1 (ad_spend Meta) + Supabase (gastos_anuncios Google).
// Auth: ?key=<DASH_KEY> ou <CLIENT_KEY>
// Params:
//   since  YYYY-MM-DD (padrão: 1º do mês atual)
//   until  YYYY-MM-DD (padrão: hoje)
//
// Retorna:
//   { ok, clients[], new_clients_meta, new_clients_google, new_clients_total,
//     spend_meta_cents, spend_google_cents, spend_total_cents,
//     cac_meta_cents, cac_google_cents, cac_total_cents }

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';

  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const now = new Date();
  const since = url.searchParams.get('since') ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const until = url.searchParams.get('until') ||
    now.toISOString().slice(0, 10);

  const sbH = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
  };

  // ── 1. Busca contatos ativos no período ──────────────────────────────────
  // "Ativo no período" = primeiro contato até o fim do período E último contato desde o início
  let contatos = [];
  try {
    const p = new URLSearchParams({
      select:         'id,telefone,nome_validado,nome_whatsapp,origem,etapa,tipo_contato,primeiro_contato_em,ultimo_contato_em,gclid,ctwa_clid',
      client_slug:    'eq.fort-popular',
      'tipo_contato': 'not.eq.pessoal',
      order:          'primeiro_contato_em.desc',
      limit:          '500',
    });
    p.append('primeiro_contato_em', `lte.${until}T23:59:59`);
    p.append('ultimo_contato_em',   `gte.${since}T00:00:00`);
    const r = await fetch(`${SB_URL}/rest/v1/contatos?${p}`, { headers: sbH });
    if (r.ok) contatos = await r.json();
  } catch (_) {}

  const empty = {
    ok: true, clients: [],
    new_clients_meta: 0, new_clients_google: 0, new_clients_total: 0,
    spend_meta_cents: 0, spend_google_cents: 0, spend_total_cents: 0,
    cac_meta_cents: 0, cac_google_cents: 0, cac_total_cents: 0,
  };
  if (!contatos.length) return json(empty);

  const ids = contatos.map(c => c.id);

  // ── 2. Busca vendas confirmadas desses contatos (all-time para LTV real) ─
  let vendas = [];
  try {
    const p = new URLSearchParams({
      select:       'contato_id,valor,produto,created_at',
      client_slug:  'eq.fort-popular',
      'contato_id': `in.(${ids.join(',')})`,
      revisao:      'eq.confirmada',
      order:        'created_at.desc',
      limit:        '1000',
    });
    const r = await fetch(`${SB_URL}/rest/v1/vendas?${p}`, { headers: sbH });
    if (r.ok) vendas = await r.json();
  } catch (_) {}

  // Agrupa vendas por contato_id
  const vendasPorContato = {};
  for (const v of vendas) {
    if (!vendasPorContato[v.contato_id]) vendasPorContato[v.contato_id] = [];
    vendasPorContato[v.contato_id].push(v);
  }

  // ── 3. Classifica canal de cada contato ─────────────────────────────────
  function canal(c) {
    if (c.origem === 'anuncio_google' || c.gclid) return 'google';
    if (c.ctwa_clid || c.origem === 'anuncio_meta' || c.origem === 'meta') return 'meta';
    return 'outro';
  }

  // ── 4. Monta lista de clientes ───────────────────────────────────────────
  const clients = contatos.map(c => {
    const cvs     = vendasPorContato[c.id] || [];
    const ltv_cents = Math.round(cvs.reduce((s, v) => s + parseFloat(v.valor || 0), 0) * 100);
    const telefone  = c.telefone || '';
    return {
      nome:          c.nome_validado || c.nome_whatsapp || '—',
      phone_last4:   telefone.slice(-4) || '—',
      ltv_cents,
      visitas:       1,
      compras:       cvs.length,
      recorrente:    cvs.length > 1,
      origem:        canal(c) === 'google' ? 'Google' : canal(c) === 'meta' ? 'Meta' : (c.origem || '—'),
      etapa:         c.etapa || '—',
      primeira_visita: (c.primeiro_contato_em || '').slice(0, 10) || '—',
      ultima_visita:   (c.ultimo_contato_em   || '').slice(0, 10) || '—',
    };
  }).sort((a, b) => b.ltv_cents - a.ltv_cents);

  // ── 5. Clientes novos no período por canal ───────────────────────────────
  let new_clients_google = 0, new_clients_meta = 0, new_clients_outro = 0;
  for (const c of contatos) {
    const prim = (c.primeiro_contato_em || '').slice(0, 10);
    if (prim < since || prim > until) continue;
    const ch = canal(c);
    if (ch === 'google')     new_clients_google++;
    else if (ch === 'meta')  new_clients_meta++;
    else                     new_clients_outro++;
  }
  const new_clients_total = new_clients_google + new_clients_meta + new_clients_outro;

  // ── 6. Gasto Meta — D1 ad_spend ─────────────────────────────────────────
  let spend_meta_cents = 0;
  try {
    if (env.DB) {
      const row = await env.DB.prepare(
        `SELECT COALESCE(SUM(CAST(spend AS REAL) * 100), 0) AS sc
         FROM ad_spend WHERE date_start >= ? AND date_start <= ?`
      ).bind(since, until).first();
      spend_meta_cents = Math.round(row?.sc || 0);
    }
  } catch (_) {}

  // ── 7. Gasto Google — Supabase gastos_anuncios ──────────────────────────
  let spend_google_cents = 0;
  try {
    const p = new URLSearchParams({
      select:      'valor',
      client_slug: 'eq.fort-popular',
      plataforma:  'eq.google',
    });
    p.append('data', `gte.${since}`);
    p.append('data', `lte.${until}`);
    const r = await fetch(`${SB_URL}/rest/v1/gastos_anuncios?${p}`, { headers: sbH });
    if (r.ok) {
      const rows = await r.json();
      spend_google_cents = Math.round(
        rows.reduce((s, row) => s + parseFloat(row.valor || 0), 0) * 100
      );
    }
  } catch (_) {}

  const spend_total_cents = spend_meta_cents + spend_google_cents;

  // ── 8. CAC por canal ─────────────────────────────────────────────────────
  const cac_meta_cents   = new_clients_meta   > 0 ? Math.round(spend_meta_cents   / new_clients_meta)   : 0;
  const cac_google_cents = new_clients_google > 0 ? Math.round(spend_google_cents / new_clients_google) : 0;
  const cac_total_cents  = new_clients_total  > 0 ? Math.round(spend_total_cents  / new_clients_total)  : 0;

  return json({
    ok: true,
    clients,
    new_clients_meta,
    new_clients_google,
    new_clients_total,
    spend_meta_cents,
    spend_google_cents,
    spend_total_cents,
    cac_meta_cents,
    cac_google_cents,
    cac_total_cents,
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
