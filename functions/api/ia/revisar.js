// POST /api/ia/revisar
//
// Registra a decisão do gestor sobre uma análise IA.
// Regras:
//   confirmar / corrigir → analises.revisao='confirmada' + PATCH-ou-INSERT em vendas
//                          NUNCA sobrescreve o que a IA escreveu (status, valor_estimado, produto, confianca)
//   rejeitar             → analises.revisao='rejeitada' + motivo; venda existente → revisao='rejeitada'
//                          se motivo=pessoal|fornecedor|equipe → contatos.tipo_contato
//   desfazer             → analises.revisao='pendente' + vendas.revisao='pendente'
//
// O painel NUNCA envia para Meta ou Google.
// Após gravar, dispara fire-and-forget para env.N8N_WEBHOOK_VENDAS (se configurado).
//
// Auth: header x-dash-key <DASH_KEY>|<CLIENT_KEY> ou Bearer JWT Supabase
// Body: {
//   id:         UUID do contato (obrigatório)
//   analise_id: UUID da análise (usa a mais recente se omitido)
//   action:     'confirmar' | 'corrigir' | 'rejeitar' | 'desfazer'
//   value?:     valor corrigido em R$
//   produto?:   produto corrigido
//   name?:      nome validado do cliente
//   phone?:     telefone corrigido
//   origem?:    anuncio_meta | anuncio_google | bio_instagram | organico | indicacao
//   motivo?:    motivo da rejeição
// }

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-dash-key, Authorization',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Auth ──────────────────────────────────────────────────────────
  const auth = await validateAuth(request, env);
  if (!auth.valid) return json({ error: 'Unauthorized' }, 401);

  // ── Body ──────────────────────────────────────────────────────────
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }

  const { id, analise_id, action, value, produto, motivo, name, phone, origem } = body;

  if (!id) return json({ error: 'id (contato) é obrigatório' }, 400);
  if (!['confirmar', 'corrigir', 'rejeitar', 'desfazer'].includes(action)) {
    return json({ error: 'action inválido. Use: confirmar | corrigir | rejeitar | desfazer' }, 400);
  }

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const sbH = {
    'apikey':        SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type':  'application/json',
  };

  // ── Busca contato ─────────────────────────────────────────────────
  let contato;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/contatos?id=eq.${encodeURIComponent(id)}&client_slug=eq.fort-popular&limit=1`,
      { headers: sbH }
    );
    if (!r.ok) return json({ error: 'Supabase GET contato error' }, 502);
    const rows = await r.json();
    if (!rows.length) return json({ error: 'Contato não encontrado' }, 404);
    contato = rows[0];
  } catch (e) {
    return json({ error: 'Erro ao buscar contato: ' + e.message }, 502);
  }

  // ── Busca análise ─────────────────────────────────────────────────
  let analise = null;
  const aid = analise_id || null;
  try {
    const query = aid
      ? `id=eq.${encodeURIComponent(aid)}&client_slug=eq.fort-popular&limit=1`
      : `contato_id=eq.${encodeURIComponent(id)}&client_slug=eq.fort-popular&order=created_at.desc&limit=1`;
    const r = await fetch(`${SB_URL}/rest/v1/analises?${query}`, { headers: sbH });
    if (r.ok) {
      const rows = await r.json();
      analise = rows[0] || null;
    }
  } catch (_) {}

  if ((action === 'confirmar' || action === 'corrigir') && !analise) {
    return json({ error: 'Nenhuma análise encontrada para este contato' }, 404);
  }

  // ── PATCH analises ────────────────────────────────────────────────
  const revisaoMap = {
    confirmar: 'confirmada',
    corrigir:  'confirmada',
    rejeitar:  'rejeitada',
    desfazer:  'pendente',
  };
  const newRevisao = revisaoMap[action];

  if (analise) {
    const patchAnalise = { revisao: newRevisao };
    if (action === 'desfazer') {
      patchAnalise.revisado_por = null;
      patchAnalise.revisado_em  = null;
    } else {
      patchAnalise.revisado_por = 'equipe';
      patchAnalise.revisado_em  = new Date().toISOString();
    }
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/analises?id=eq.${encodeURIComponent(analise.id)}`,
        { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify(patchAnalise) }
      );
      if (!r.ok) return json({ error: 'Erro ao atualizar análise: ' + await r.text() }, 502);
    } catch (e) {
      return json({ error: 'Erro ao atualizar análise: ' + e.message }, 502);
    }
  }

  // ── REJEITAR ──────────────────────────────────────────────────────
  if (action === 'rejeitar') {
    // Marca venda existente como rejeitada (não apaga)
    if (analise) {
      try {
        await fetch(
          `${SB_URL}/rest/v1/vendas?analise_id=eq.${encodeURIComponent(analise.id)}&client_slug=eq.fort-popular`,
          { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify({ revisao: 'rejeitada' }) }
        );
      } catch (_) {}
    }
    // Classifica contato se for pessoal / fornecedor / equipe
    const TIPO_MAP = { pessoal: 'pessoal', fornecedor: 'fornecedor', equipe: 'equipe' };
    const novoTipo = motivo ? TIPO_MAP[motivo] : null;
    if (novoTipo) {
      try {
        await fetch(
          `${SB_URL}/rest/v1/contatos?id=eq.${encodeURIComponent(id)}`,
          { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ tipo_contato: novoTipo, tipo_definido_por: 'humano' }) }
        );
      } catch (_) {}
    }
    return json({ ok: true, action, revisao: newRevisao });
  }

  // ── DESFAZER ──────────────────────────────────────────────────────
  if (action === 'desfazer') {
    if (analise) {
      try {
        await fetch(
          `${SB_URL}/rest/v1/vendas?analise_id=eq.${encodeURIComponent(analise.id)}&client_slug=eq.fort-popular`,
          { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify({ revisao: 'pendente' }) }
        );
      } catch (_) {}
    }
    return json({ ok: true, action, revisao: newRevisao });
  }

  // ── CONFIRMAR / CORRIGIR ──────────────────────────────────────────
  const nowTs = Math.floor(Date.now() / 1000);
  const cc     = env.DEFAULT_COUNTRY_CODE || '55';
  const rawPhone = phone || contato.telefone || '';
  const phNorm   = normalizePhone(rawPhone, cc);

  const finalValue   = value !== undefined ? parseBRFloat(value)
                     : parseFloat(analise?.valor_estimado || '0') || 0;
  if (finalValue <= 0) return json({ error: 'Valor é obrigatório e deve ser maior que zero' }, 400);

  const finalProduct = (produto || analise?.produto || '').trim();
  const finalName    = (name    || contato.nome_validado || contato.nome_whatsapp || '').trim();

  // Resolve origem (vocabulário interno)
  const VALID_VENDAS   = ['anuncio_meta', 'anuncio_google', 'bio_instagram', 'organico', 'indicacao'];
  const VALID_CONTATO  = ['anuncio_meta', 'anuncio_google', 'bio_instagram', 'site', 'organico'];
  const origemInput    = origem || '';
  const finalOrigem    = VALID_VENDAS.includes(origemInput) ? origemInput : 'organico';

  // Atualiza contatos.origem só se era desconhecido e nova não é indicacao
  const shouldUpdateOrigem =
    (contato.origem === 'desconhecido' || !contato.origem) &&
    finalOrigem !== 'indicacao' &&
    VALID_CONTATO.includes(finalOrigem);

  // Atualiza nome se fornecido e diferente do validado
  if (name && name.trim() && name.trim() !== contato.nome_validado) {
    try {
      await fetch(
        `${SB_URL}/rest/v1/contatos?id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ nome_validado: name.trim(), nome_confiavel: true }) }
      );
    } catch (_) {}
  }

  // Atualiza contatos.origem se necessário
  if (shouldUpdateOrigem) {
    try {
      await fetch(
        `${SB_URL}/rest/v1/contatos?id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ origem: finalOrigem }) }
      );
    } catch (_) {}
  }

  // ── PATCH-ou-INSERT em vendas ─────────────────────────────────────
  // Nunca cria duas vendas para a mesma análise.
  let vendaId = null;
  let vendaExistente = null;

  if (analise?.id) {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/vendas?analise_id=eq.${encodeURIComponent(analise.id)}&client_slug=eq.fort-popular&limit=1`,
        { headers: sbH }
      );
      if (r.ok) {
        const rows = await r.json();
        vendaExistente = rows[0] || null;
      }
    } catch (_) {}
  }

  const vendaPayload = {
    valor:    finalValue,
    produto:  finalProduct || null,
    origem:   finalOrigem,
    revisao:  'confirmada',
  };

  if (vendaExistente) {
    // PATCH — atualiza valores sem criar duplicata
    try {
      await fetch(
        `${SB_URL}/rest/v1/vendas?id=eq.${encodeURIComponent(vendaExistente.id)}`,
        { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify(vendaPayload) }
      );
      vendaId = vendaExistente.id;
    } catch (_) {}
  } else {
    // INSERT
    const insertBody = {
      client_slug: 'fort-popular',
      contato_id:  id,
      analise_id:  analise?.id || null,
      vendida_em:  analise?.created_at || new Date().toISOString(),
      ad_id:       contato.ctwa_clid || contato.gclid || null,
      ...vendaPayload,
    };
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/vendas`,
        { method: 'POST', headers: { ...sbH, 'Prefer': 'return=representation' }, body: JSON.stringify(insertBody) }
      );
      if (r.ok) {
        const rows = await r.json();
        vendaId = rows[0]?.id || null;
      }
    } catch (_) {}
  }

  // ── D1 manual_conversions (o /relatorio lê daqui) ─────────────────
  // event_id = vendas.id (estável — evita duplicatas no D1 com INSERT OR REPLACE)
  // meta_ok = 0 — o n8n faz o envio
  if (vendaId && env.DB) {
    try {
      const phoneLast4 = phNorm.slice(-4) || rawPhone.replace(/\D/g, '').slice(-4);
      const valueCents = Math.round(finalValue * 100);
      const eventDate  = (analise?.created_at || new Date().toISOString()).slice(0, 10);
      const fonte      = action === 'corrigir' ? 'ia-corrigido' : 'ia';

      await env.DB.prepare(`
        INSERT OR REPLACE INTO manual_conversions
          (event_id, event_name, display_name, phone_last4, phone_normalized,
           value_cents, event_date, origem, meta_ok, registered_at,
           produto, observacao, fonte, supabase_venda_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `).bind(
        vendaId, 'Purchase', finalName, phoneLast4, phNorm,
        valueCents, eventDate, finalOrigem, nowTs,
        finalProduct, motivo || '', fonte, analise?.id || null,
      ).run();
    } catch (_) {}
  }

  // ── Gancho n8n (fire-and-forget) ─────────────────────────────────
  if (vendaId && env.N8N_WEBHOOK_VENDAS) {
    try {
      fetch(env.N8N_WEBHOOK_VENDAS, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-gd3-secret':  env.N8N_WEBHOOK_SECRET || '',
        },
        body: JSON.stringify({ venda_id: vendaId }),
      }).catch(() => {});
    } catch (_) {}
  }

  return json({ ok: true, action, revisao: newRevisao, venda_id: vendaId });
}

// ── Auth ───────────────────────────────────────────────────────────
async function validateAuth(request, env) {
  const key = request.headers.get('x-dash-key') || '';
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

// ── Helpers ────────────────────────────────────────────────────────

function parseBRFloat(str) {
  if (!str && str !== 0) return 0;
  const s = String(str).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s) || 0;
}

function normalizePhone(ph, countryCode) {
  if (!ph) return '';
  const cc     = String(countryCode || '55');
  const digits = ph.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  if (digits.startsWith(cc) && digits.length >= cc.length + 8 && digits.length <= cc.length + 11) return digits;
  if (digits.length >= 8 && digits.length <= 11) return cc + digits;
  return digits;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
