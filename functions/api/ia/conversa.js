// GET /api/ia/conversa
//
// Retorna detalhes de um contato: dados + última análise + mensagens.
// Fonte real: tabelas contatos + analises + mensagens (n8n escreve aqui desde out/2026).
//
// Auth: ?key=<DASH_KEY> ou <CLIENT_KEY>
// Params:
//   id   UUID do contato (contatos.id)

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

  const sbH = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

  // ── Contato ──────────────────────────────────────────────────────
  let contato;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/contatos?id=eq.${id}&client_slug=eq.fort-popular&limit=1`,
      { headers: sbH }
    );
    if (!r.ok) return json({ error: 'Erro Supabase contato', status: r.status }, 502);
    const rows = await r.json();
    if (!rows.length) return json({ error: 'Contato não encontrado' }, 404);
    contato = rows[0];
  } catch (e) {
    return json({ error: 'Erro ao buscar contato: ' + e.message }, 502);
  }

  // ── Análise mais recente ─────────────────────────────────────────
  let analise = null;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/analises?contato_id=eq.${id}&client_slug=eq.fort-popular&order=created_at.desc&limit=1`,
      { headers: sbH }
    );
    if (r.ok) {
      const rows = await r.json();
      analise = rows[0] || null;
    }
  } catch (_) {}

  // ── Mensagens ────────────────────────────────────────────────────
  let mensagens = [];
  try {
    const mParams = new URLSearchParams({
      select:      'id,direcao,tipo,conteudo_texto,texto_extraido,enviada_em,created_at',
      contato_id:  `eq.${id}`,
      client_slug: 'eq.fort-popular',
      order:       'enviada_em.asc',
      limit:       '300',
    });
    const r = await fetch(`${SB_URL}/rest/v1/mensagens?${mParams}`, { headers: sbH });
    if (r.ok) {
      const rows = await r.json();
      // Normaliza para formato esperado pelo frontend
      mensagens = rows.map(m => ({
        id:              m.id,
        tipo:            m.tipo,
        texto_extraido:  m.texto_extraido || m.conteudo_texto || '',
        from_me:         m.direcao === 'enviada' ? 1 : 0,
        created_at:      m.enviada_em || m.created_at,
      }));
    }
  } catch (_) {}

  // ── Monta label (compatível com frontend) ────────────────────────
  const humanLabel = analise?.revisao === 'confirmada' ? 'venda'
                   : analise?.revisao === 'automatica'  ? 'venda'
                   : analise?.revisao === 'rejeitada'   ? 'nao_venda'
                   : null;

  const label = {
    id:                   contato.id,
    chat_id:              contato.wa_chat_id || '',
    phone:                contato.telefone   || '',
    push_name:            contato.nome_validado || contato.nome_whatsapp || '',
    nome_confiavel:       contato.nome_confiavel || false,
    origem:               contato.origem     || 'desconhecido',
    etapa:                contato.etapa      || 'lead',
    tipo_contato:         contato.tipo_contato || 'nao_classificado',
    primeiro_contato_em:  contato.primeiro_contato_em,
    ultimo_contato_em:    contato.ultimo_contato_em,
    ctwa_clid:            contato.ctwa_clid  || null,
    gclid:                contato.gclid      || null,
    // Análise
    analise_id:           analise?.id        || null,
    ai_verdict:           analise?.status    || null,
    ai_confidence:        analise?.confianca || null,
    human_label:          humanLabel,
    revisao:              analise?.revisao   || null,
    product:              analise?.produto   || null,
    value_brl:            analise?.valor_estimado ? parseFloat(analise.valor_estimado) : null,
    conversation_excerpt: analise?.resumo    || null,
    evidencias:           analise?.evidencias || null,
    revisado_em:          analise?.revisado_em || null,
    created_at:           contato.primeiro_contato_em,
  };

  return json({ ok: true, label, mensagens });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
