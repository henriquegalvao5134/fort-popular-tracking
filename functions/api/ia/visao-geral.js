// GET /api/ia/visao-geral
//
// Dashboard unificado — Visão Geral.
// Auth: ?key=<DASH_KEY|CLIENT_KEY>  OU  Authorization: Bearer <supabase_jwt>
// Params:
//   since  YYYY-MM-DD (padrão: -30 dias)
//   until  YYYY-MM-DD (padrão: hoje)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // ── Auth ──────────────────────────────────────────────────
  const auth = await validateAuth(request, env);
  if (!auth.valid) return json({ error: 'Unauthorized' }, 401);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  // ── Período ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const defaultSince = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const since = url.searchParams.get('since') || defaultSince;
  const until = url.searchParams.get('until') || today;
  const sinceTs = since + 'T00:00:00';
  const untilTs = until + 'T23:59:59';

  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ── 1. Contatos no período ────────────────────────────────
  let contatos = [];
  try {
    const p = new URLSearchParams({
      select:             'id,origem,etapa,primeiro_contato_em,ctwa_clid,gclid',
      client_slug:        'eq.fort-popular',
      'tipo_contato':     'not.eq.pessoal',
      'primeiro_contato_em': `gte.${sinceTs}`,
      'primeiro_contato_em.lte': untilTs,
      order: 'primeiro_contato_em.asc',
      limit: '2000',
    });
    // Supabase needs two separate filters for range
    const p2 = new URLSearchParams({
      select:          'id,origem,etapa,primeiro_contato_em,ctwa_clid,gclid',
      client_slug:     'eq.fort-popular',
      'tipo_contato':  'not.eq.pessoal',
      order:           'primeiro_contato_em.asc',
      limit:           '2000',
    });
    p2.set('primeiro_contato_em', `gte.${sinceTs}`);
    const r = await fetch(
      `${SB_URL}/rest/v1/contatos?${p2}&primeiro_contato_em=lte.${encodeURIComponent(untilTs)}`,
      { headers: sbH }
    );
    if (r.ok) contatos = await r.json();
  } catch (_) {}

  const leads = contatos.length;

  // ── 2. Vendas confirmadas no período ─────────────────────
  let vendas = [];
  try {
    const p = new URLSearchParams({
      select:      'id,contato_id,valor,origem,created_at',
      client_slug: 'eq.fort-popular',
      revisao:     'eq.confirmada',
      order:       'created_at.asc',
      limit:       '2000',
    });
    p.set('created_at', `gte.${sinceTs}`);
    const r = await fetch(
      `${SB_URL}/rest/v1/vendas?${p}&created_at=lte.${encodeURIComponent(untilTs)}`,
      { headers: sbH }
    );
    if (r.ok) vendas = await r.json();
  } catch (_) {}

  const totalVendas   = vendas.length;
  const receitaCents  = vendas.reduce((s, v) => s + Math.round((parseFloat(v.valor) || 0) * 100), 0);
  const ticketMedio   = totalVendas > 0 ? Math.round(receitaCents / totalVendas) : 0;
  const valorPorLead  = leads > 0 ? Math.round(receitaCents / leads) : 0;

  // ── 3. Conversas por dia ──────────────────────────────────
  // Agrupa contatos por data de primeiro_contato_em
  const porDia = {};
  for (const c of contatos) {
    const d = (c.primeiro_contato_em || '').slice(0, 10);
    if (!d) continue;
    porDia[d] = (porDia[d] || 0) + 1;
  }
  // Preenche todos os dias do período
  const conversasPorDia = [];
  const dt = new Date(since + 'T12:00:00');
  const dtEnd = new Date(until + 'T12:00:00');
  while (dt <= dtEnd) {
    const d = dt.toISOString().slice(0, 10);
    conversasPorDia.push({ date: d, count: porDia[d] || 0 });
    dt.setDate(dt.getDate() + 1);
  }

  // ── 4. Funil ─────────────────────────────────────────────
  const nOportunidade = contatos.filter(c => ['oportunidade','vendido','recorrente'].includes(c.etapa)).length;
  const funil = [
    { label: 'Leads',       count: leads },
    { label: 'Oportunidades', count: nOportunidade },
    { label: 'Vendas',      count: totalVendas },
  ];

  // ── 5. Heatmap de mensagens (hora × dia da semana) ───────
  // Busca mensagens recebidas (from_me=false) no período
  let heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  try {
    const mP = new URLSearchParams({
      select:      'created_at',
      client_slug: 'eq.fort-popular',
      from_me:     'eq.false',
      order:       'created_at.asc',
      limit:       '5000',
    });
    mP.set('created_at', `gte.${sinceTs}`);
    const r = await fetch(
      `${SB_URL}/rest/v1/mensagens?${mP}&created_at=lte.${encodeURIComponent(untilTs)}`,
      { headers: sbH }
    );
    if (r.ok) {
      const msgs = await r.json();
      for (const m of msgs) {
        const d = new Date(m.created_at);
        // Converte para horário de Brasília (UTC-3)
        const dBR = new Date(d.getTime() - 3 * 3600000);
        const dow  = dBR.getDay();   // 0=Domingo … 6=Sábado
        const hour = dBR.getHours(); // 0–23
        heatmap[dow][hour]++;
      }
    }
  } catch (_) {}

  // ── 6. Tempo de 1ª resposta ──────────────────────────────
  // Busca mensagens de contatos do período (até 200 contatos para não sobrecarregar)
  let tempo1aRespostaMin = null;
  try {
    const sampleIds = contatos.slice(0, 200).map(c => c.id);
    if (sampleIds.length > 0) {
      const msgP = new URLSearchParams({
        select:       'contato_id,from_me,created_at',
        client_slug:  'eq.fort-popular',
        'contato_id': `in.(${sampleIds.join(',')})`,
        order:        'created_at.asc',
        limit:        '2000',
      });
      const r = await fetch(`${SB_URL}/rest/v1/mensagens?${msgP}`, { headers: sbH });
      if (r.ok) {
        const msgs = await r.json();
        // Agrupa por contato
        const porContato = {};
        for (const m of msgs) {
          if (!porContato[m.contato_id]) porContato[m.contato_id] = [];
          porContato[m.contato_id].push(m);
        }
        const deltas = [];
        for (const [, ms] of Object.entries(porContato)) {
          const primRecebida = ms.find(m => !m.from_me);
          const primEnviada  = ms.find(m =>  m.from_me);
          if (primRecebida && primEnviada) {
            const delta = (new Date(primEnviada.created_at) - new Date(primRecebida.created_at)) / 60000;
            if (delta > 0 && delta < 1440) deltas.push(delta); // ignora > 24h
          }
        }
        if (deltas.length > 0) {
          tempo1aRespostaMin = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
        }
      }
    }
  } catch (_) {}

  // ── 7. Performance por origem ─────────────────────────────
  const origemMap = {};
  for (const c of contatos) {
    const o = c.origem || 'desconhecido';
    if (!origemMap[o]) origemMap[o] = { leads: 0, vendas: 0, receita_cents: 0 };
    origemMap[o].leads++;
  }
  const contatoIds = new Set(contatos.map(c => c.id));
  for (const v of vendas) {
    // Tentamos achar a origem via contato_id
    const c = contatos.find(x => x.id === v.contato_id);
    const o = c?.origem || v.origem || 'desconhecido';
    if (!origemMap[o]) origemMap[o] = { leads: 0, vendas: 0, receita_cents: 0 };
    origemMap[o].vendas++;
    origemMap[o].receita_cents += Math.round((parseFloat(v.valor) || 0) * 100);
  }
  const porOrigem = Object.entries(origemMap)
    .map(([origem, v]) => ({ origem, ...v }))
    .sort((a, b) => b.leads - a.leads);

  return json({
    period: { since, until },
    leads,
    vendas:            totalVendas,
    receita_cents:     receitaCents,
    ticket_medio_cents: ticketMedio,
    valor_por_lead_cents: valorPorLead,
    tempo_1a_resposta_min: tempo1aRespostaMin,
    conversas_por_dia:  conversasPorDia,
    funil,
    heatmap,
    por_origem:         porOrigem,
  });
}

// ── Auth: aceita ?key= ou Bearer JWT (Supabase) ────────────
async function validateAuth(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (validKey) return { valid: true };

  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ') && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const token = authHeader.slice(7);
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey':       env.SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + token,
      },
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
