// GET /api/ia/pendentes
//
// Retorna contatos do Fort Popular com sua última análise, para a visão CRM.
// Fonte real: tabelas contatos + analises (n8n escreve aqui desde out/2026).
//
// Auth: ?key=<DASH_KEY> ou <CLIENT_KEY>
// Params:
//   filter  'pendentes' | 'confirmadas' | 'rejeitadas' | 'em_aberto' | 'todos' (padrão: todos)
//   limit   máx 200 (padrão: 100)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url    = new URL(request.url);

  const auth = await validateAuth(request, env);
  if (!auth.valid) return json({ error: 'Unauthorized' }, 401);

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200);
  const filter = url.searchParams.get('filter') || 'todos';

  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ── 1. Busca contatos (exclui pessoais) ──────────────────────────
  const cParams = new URLSearchParams({
    select:      'id,telefone,nome_whatsapp,nome_validado,nome_confiavel,origem,etapa,tipo_contato,primeiro_contato_em,ultimo_contato_em,ctwa_clid,gclid,wa_chat_id',
    client_slug: 'eq.fort-popular',
    'tipo_contato': 'not.eq.pessoal',
    order:       'ultimo_contato_em.desc.nullslast',
    limit:       String(limit),
  });

  let contatos = [];
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contatos?${cParams}`, { headers: sbH });
    if (!r.ok) return json({ error: 'Erro ao buscar contatos', status: r.status }, 502);
    contatos = await r.json();
  } catch (e) {
    return json({ error: 'Supabase contatos: ' + e.message }, 502);
  }

  if (!contatos.length) return json({ ok: true, items: [], total: 0 });

  const ids = contatos.map(c => c.id);

  // ── 2. Busca análises desses contatos (mais recente por contato) ──
  let analises = [];
  try {
    const aParams = new URLSearchParams({
      select:      'id,contato_id,status,revisao,produto,valor_estimado,confianca,resumo,evidencias,created_at,revisado_em,modelo_ia',
      client_slug: 'eq.fort-popular',
      'contato_id': `in.(${ids.join(',')})`,
      order:       'created_at.desc',
      limit:       '500',
    });
    const r = await fetch(`${SB_URL}/rest/v1/analises?${aParams}`, { headers: sbH });
    if (r.ok) analises = await r.json();
  } catch (_) {}

  // Mapeia analise mais recente por contato_id
  const analiseMap = {};
  for (const a of analises) {
    if (!analiseMap[a.contato_id]) analiseMap[a.contato_id] = a;
  }

  // ── 3. Busca vendas confirmadas desses contatos ───────────────────
  let vendasMap = {};
  try {
    const vParams = new URLSearchParams({
      select:        'id,contato_id,valor,produto,revisao',
      client_slug:   'eq.fort-popular',
      'contato_id':  `in.(${ids.join(',')})`,
      order:         'created_at.desc',
      limit:         '500',
    });
    const r = await fetch(`${SB_URL}/rest/v1/vendas?${vParams}`, { headers: sbH });
    if (r.ok) {
      const vendas = await r.json();
      for (const v of vendas) {
        if (!vendasMap[v.contato_id]) vendasMap[v.contato_id] = v;
      }
    }
  } catch (_) {}

  // ── 4. Merge ──────────────────────────────────────────────────────
  let items = contatos.map(c => {
    const a = analiseMap[c.id] || null;
    const v = vendasMap[c.id]  || null;
    return {
      id:                   c.id,
      nome:                 c.nome_validado || c.nome_whatsapp || '',
      nome_confiavel:       c.nome_confiavel || false,
      telefone:             c.telefone || '',
      origem:               c.origem || 'desconhecido',
      etapa:                c.etapa || 'lead',
      tipo_contato:         c.tipo_contato || 'nao_classificado',
      primeiro_contato_em:  c.primeiro_contato_em,
      ultimo_contato_em:    c.ultimo_contato_em,
      ctwa_clid:            c.ctwa_clid || null,
      gclid:                c.gclid || null,
      wa_chat_id:           c.wa_chat_id || null,
      // Análise IA
      analise_id:           a?.id           || null,
      status_ia:            a?.status       || null,
      revisao:              a?.revisao      || null,
      produto:              v?.produto || a?.produto || null,
      valor_estimado:       a?.valor_estimado ? parseFloat(a.valor_estimado) : null,
      venda_valor:          v?.valor != null  ? parseFloat(v.valor)          : null,
      venda_revisao:        v?.revisao || null,
      venda_id:             v?.id      || null,
      ai_confidence:        a?.confianca    || null,
      conversation_excerpt: a?.resumo       || null,
      evidencias:           a?.evidencias   || null,
      revisado_em:          a?.revisado_em  || null,
      analise_created_at:   a?.created_at   || null,
    };
  });

  // ── 4. Aplica filtro ──────────────────────────────────────────────
  if (filter === 'pendentes') {
    items = items.filter(i => i.status_ia === 'venda' && i.revisao === 'pendente');
  } else if (filter === 'confirmadas') {
    items = items.filter(i => i.revisao === 'confirmada');
  } else if (filter === 'rejeitadas') {
    items = items.filter(i => i.revisao === 'rejeitada');
  } else if (filter === 'em_aberto') {
    items = items.filter(i => !i.status_ia || i.status_ia === 'em_aberto' || i.revisao === 'automatica');
  }
  // 'todos' = sem filtro

  return json({ ok: true, items, total: items.length });
}

async function validateAuth(request, env) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  if ((env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY)) return { valid: true };
  const authH = request.headers.get('Authorization') || '';
  if (authH.startsWith('Bearer ') && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': authH },
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
