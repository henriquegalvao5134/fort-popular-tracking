// POST /api/ia/revisar
//
// Registra a decisão da equipe sobre uma análise IA.
// Fonte real: tabelas analises + vendas + contatos (n8n escreve aqui desde out/2026).
//
// Actions:
//   confirmar  → analises.revisao = 'confirmada' + insere vendas + dispara Meta CAPI
//   corrigir   → analises.revisao = 'confirmada' + insere vendas com valores corrigidos + CAPI
//   rejeitar   → analises.revisao = 'rejeitada'
//   desfazer   → analises.revisao = 'pendente'
//
// Auth: header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body: {
//   id:        UUID do contato (contatos.id)          ← obrigatório
//   analise_id: UUID da análise (analises.id)         ← obrigatório se não for 'desfazer' com id de contato
//   action:    'confirmar' | 'corrigir' | 'rejeitar' | 'desfazer'
//   value?:    valor corrigido em R$
//   produto?:  produto corrigido
//   name?:     nome confirmado do cliente
//   phone?:    sobrescreve o telefone
//   origem?:   'ad' | 'google' | 'organic' | 'referral'
//   motivo?:   texto livre de rejeição
// }

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-dash-key',
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
      `${SB_URL}/rest/v1/contatos?id=eq.${id}&client_slug=eq.fort-popular&limit=1`,
      { headers: sbH }
    );
    if (!r.ok) return json({ error: 'Supabase GET contato error' }, 502);
    const rows = await r.json();
    if (!rows.length) return json({ error: 'Contato não encontrado' }, 404);
    contato = rows[0];
  } catch (e) {
    return json({ error: 'Erro ao buscar contato: ' + e.message }, 502);
  }

  // ── Busca análise (mais recente se analise_id não informado) ──────
  let analise = null;
  const aid = analise_id || null;
  try {
    const query = aid
      ? `id=eq.${aid}&client_slug=eq.fort-popular&limit=1`
      : `contato_id=eq.${id}&client_slug=eq.fort-popular&order=created_at.desc&limit=1`;
    const r = await fetch(`${SB_URL}/rest/v1/analises?${query}`, { headers: sbH });
    if (r.ok) {
      const rows = await r.json();
      analise = rows[0] || null;
    }
  } catch (_) {}

  // Para confirmar/corrigir, análise é necessária
  if ((action === 'confirmar' || action === 'corrigir') && !analise) {
    return json({ error: 'Nenhuma análise encontrada para este contato' }, 404);
  }

  // ── Determina nova revisao ─────────────────────────────────────────
  const revisaoMap = {
    confirmar: 'confirmada',
    corrigir:  'confirmada',
    rejeitar:  'rejeitada',
    desfazer:  'pendente',
  };
  const newRevisao = revisaoMap[action];

  // ── PATCH analises ────────────────────────────────────────────────
  if (analise) {
    try {
      const patchBody = { revisao: newRevisao, revisado_por: 'equipe', revisado_em: new Date().toISOString() };
      if (action === 'desfazer') {
        patchBody.revisado_por = null;
        patchBody.revisado_em  = null;
      }
      const r = await fetch(
        `${SB_URL}/rest/v1/analises?id=eq.${analise.id}`,
        { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' }, body: JSON.stringify(patchBody) }
      );
      if (!r.ok) return json({ error: 'Supabase PATCH analise error: ' + await r.text() }, 502);
    } catch (e) {
      return json({ error: 'Erro ao atualizar análise: ' + e.message }, 502);
    }
  }

  // ── Rejeitar / Desfazer: encerra aqui ─────────────────────────────
  if (action === 'rejeitar' || action === 'desfazer') {
    return json({ ok: true, action, revisao: newRevisao });
  }

  // ── Confirmar / Corrigir: prepara dados para vendas + D1 + CAPI ──
  const nowTs   = Math.floor(Date.now() / 1000);
  const cc      = env.DEFAULT_COUNTRY_CODE || '55';
  const rawPhone = phone || contato.telefone || '';
  const phNorm   = normalizePhone(rawPhone, cc);

  const finalValue   = value !== undefined ? parseBRFloat(value)
                     : parseFloat(analise?.valor_estimado || '0') || 0;
  const finalProduct = (produto || analise?.produto || '').trim();
  const finalName    = (name || contato.nome_validado || contato.nome_whatsapp || '').trim();

  // Mapeia origem para meta-compatível
  const origemInput = origem || contato.origem || 'anuncio_meta';
  const eventOrigem = origemInput.includes('google') ? 'google'
                    : origemInput.includes('anuncio') ? 'ad'
                    : origemInput.includes('organico') ? 'organic'
                    : 'ad';

  const parts  = finalName.split(/\s+/).filter(Boolean);
  const fn     = parts[0] || '';
  const ln     = parts.slice(1).join(' ');

  const hashedPh = await sha256(phNorm);
  const hashedFn = fn ? await sha256(fn.toLowerCase()) : '';
  const hashedLn = ln ? await sha256(ln.toLowerCase()) : '';

  const eventId    = crypto.randomUUID();
  const phoneLast4 = phNorm.slice(-4) || rawPhone.replace(/\D/g, '').slice(-4);
  const valueCents = Math.round(finalValue * 100);
  const vendidaEm  = analise?.created_at || new Date().toISOString();
  const eventDate  = vendidaEm.slice(0, 10);
  const eventTime  = Math.floor(new Date(vendidaEm).getTime() / 1000);
  const fonte      = action === 'corrigir' ? 'ia-corrigido' : 'ia';

  // ── Insert vendas (Supabase) ──────────────────────────────────────
  let vendaId = null;
  if (finalValue > 0) {
    try {
      const vendaBody = {
        client_slug: 'fort-popular',
        contato_id:  id,
        analise_id:  analise?.id || null,
        valor:       finalValue,
        produto:     finalProduct || null,
        vendida_em:  vendidaEm,
        origem:      contato.origem || 'desconhecido',
        ad_id:       contato.ctwa_clid || contato.gclid || null,
        revisao:     'confirmada',
      };
      const r = await fetch(
        `${SB_URL}/rest/v1/vendas`,
        { method: 'POST', headers: { ...sbH, 'Prefer': 'return=representation' }, body: JSON.stringify(vendaBody) }
      );
      if (r.ok) {
        const rows = await r.json();
        vendaId = rows[0]?.id || null;
      }
    } catch (_) {}
  }

  // ── Insert D1 manual_conversions ──────────────────────────────────
  let d1Ok = false;
  if (env.DB) {
    try {
      const result = await env.DB.prepare(`
        INSERT OR IGNORE INTO manual_conversions
          (event_id, event_name, display_name, phone_last4, phone_normalized,
           value_cents, event_date, origem, meta_ok, registered_at,
           produto, observacao, fonte, supabase_venda_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        eventId, 'Purchase', finalName, phoneLast4, phNorm,
        valueCents, eventDate, eventOrigem, 0, nowTs,
        finalProduct, motivo || '',
        fonte, analise?.id || null,
      ).run();
      d1Ok = (result.changes || 0) > 0;
    } catch (_) {}
  }

  // ── Meta CAPI ──────────────────────────────────────────────────────
  const sevenDaysAgo = nowTs - 7 * 24 * 60 * 60;
  const metaToken    = env.META_ACCESS_TOKEN || env.META_ADS_ACCESS_TOKEN;
  const sendToMeta   = eventOrigem === 'ad' || eventOrigem === 'google';
  const metaSkipped  = !sendToMeta || eventTime < sevenDaysAgo || !env.META_PIXEL_ID || !metaToken;

  let metaOk = false, metaBody = '', metaStatus = 0;

  if (!metaSkipped) {
    const userData = { country: [await sha256('br')] };
    if (hashedPh) userData.ph = [hashedPh];
    if (hashedFn) userData.fn = [hashedFn];
    if (hashedLn) userData.ln = [hashedLn];

    const eventEntry = {
      event_name:    'Purchase',
      event_time:    eventTime,
      event_id:      eventId,
      action_source: 'chat',
      user_data:     userData,
      custom_data: {
        value:            finalValue,
        currency:         'BRL',
        content_category: 'farmacia',
      },
      data_processing_options:         ['LDU'],
      data_processing_options_country: 0,
      data_processing_options_state:   0,
    };

    const payload = { data: [eventEntry] };
    if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;

    try {
      const r = await fetch(
        `https://graph.facebook.com/v25.0/${env.META_PIXEL_ID}/events?access_token=${metaToken}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      metaStatus = r.status;
      metaOk     = r.ok;
      metaBody   = await r.text();
    } catch (err) {
      metaBody = err.message || 'fetch error';
    }

    // Atualiza meta_ok no D1 e Supabase
    if (metaOk) {
      if (env.DB) {
        try {
          await env.DB.prepare(`UPDATE manual_conversions SET meta_ok = 1 WHERE event_id = ?`).bind(eventId).run();
        } catch (_) {}
      }
      if (vendaId) {
        try {
          await fetch(
            `${SB_URL}/rest/v1/vendas?id=eq.${vendaId}`,
            { method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' },
              body: JSON.stringify({ meta_enviada: true, meta_enviada_em: new Date().toISOString(), meta_event_id: eventId }) }
          );
        } catch (_) {}
      }
    }
  } else {
    if (!env.META_PIXEL_ID || !metaToken) metaBody = 'skipped: META_PIXEL_ID não configurado';
    else if (!sendToMeta)                  metaBody = 'skipped: origem não é anúncio';
    else                                   metaBody = 'skipped: data com mais de 7 dias';
  }

  return json({
    ok:            true,
    action,
    revisao:       newRevisao,
    event_id:      eventId,
    venda_id:      vendaId,
    d1_ok:         d1Ok,
    meta_ok:       metaOk || metaSkipped,
    meta_skipped:  metaSkipped,
    meta_status:   metaStatus,
    meta_response: metaBody,
  });
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

async function sha256(value) {
  if (!value) return '';
  const encoded = new TextEncoder().encode(value.toLowerCase().trim());
  const buffer  = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
