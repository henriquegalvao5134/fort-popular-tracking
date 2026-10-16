// POST /api/ia/revisar
//
// Registra a decisão da equipe sobre uma conversa classificada pelo agente IA.
// Actions:
//   confirmar  → human_label = 'venda'  + insere D1 + dispara Meta CAPI
//   corrigir   → human_label = 'venda'  + insere D1 com valores corrigidos + CAPI
//   rejeitar   → human_label = 'nao_venda'  (sem D1, sem CAPI)
//   desfazer   → human_label = null     (desfaz revisão anterior)
//
// Auth: header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body: {
//   id:       UUID do conversation_labels (sem prefixo 'ai_')  ← obrigatório
//   action:   'confirmar' | 'corrigir' | 'rejeitar' | 'desfazer'  ← obrigatório
//   value?:   valor corrigido em R$ (usado em 'corrigir')
//   produto?: produto corrigido
//   name?:    nome do cliente
//   phone?:   sobrescreve o telefone do label
//   origem?:  'ad' | 'google' | 'organic' | 'referral' (padrão: 'ad')
//   motivo?:  texto livre de rejeição
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
  const key      = request.headers.get('x-dash-key') || '';
  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  // ── Body ──────────────────────────────────────────────────────────
  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }

  const { id, action, value, produto, motivo, name, phone, origem } = body;

  if (!id) return json({ error: 'id é obrigatório' }, 400);
  if (!['confirmar', 'corrigir', 'rejeitar', 'desfazer'].includes(action)) {
    return json({ error: 'action inválido. Use: confirmar | corrigir | rejeitar | desfazer' }, 400);
  }

  const SB_URL = env.SUPABASE_URL;
  const SB_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SB_URL || !SB_KEY) return json({ error: 'Supabase não configurado' }, 500);

  const sbHeaders = {
    'apikey':        SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type':  'application/json',
  };

  // ── Busca o label no Supabase ─────────────────────────────────────
  let label;
  try {
    const resp = await fetch(
      `${SB_URL}/rest/v1/conversation_labels?id=eq.${id}&limit=1`,
      { headers: sbHeaders }
    );
    if (!resp.ok) return json({ error: 'Supabase GET error', status: resp.status }, 502);
    const rows = await resp.json();
    if (!rows.length) return json({ error: 'Conversa não encontrada' }, 404);
    label = rows[0];
  } catch (e) {
    return json({ error: 'Erro ao buscar conversa: ' + e.message }, 502);
  }

  if (label.client_slug !== 'fort-popular') return json({ error: 'Acesso negado' }, 403);

  // ── Determina novo human_label ────────────────────────────────────
  const labelMap = { confirmar: 'venda', corrigir: 'venda', rejeitar: 'nao_venda', desfazer: null };
  const newLabel = labelMap[action];

  // ── PATCH Supabase ────────────────────────────────────────────────
  try {
    const patchResp = await fetch(
      `${SB_URL}/rest/v1/conversation_labels?id=eq.${id}`,
      {
        method:  'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body:    JSON.stringify({ human_label: newLabel }),
      }
    );
    if (!patchResp.ok) {
      const errText = await patchResp.text();
      return json({ error: 'Supabase PATCH error: ' + errText }, 502);
    }
  } catch (e) {
    return json({ error: 'Erro ao atualizar: ' + e.message }, 502);
  }

  // ── Rejeitar / Desfazer: encerra aqui ────────────────────────────
  if (action === 'rejeitar' || action === 'desfazer') {
    return json({ ok: true, action, human_label: newLabel });
  }

  // ── Confirmar / Corrigir: prepara inserção D1 + CAPI ─────────────
  const nowTs   = Math.floor(Date.now() / 1000);
  const cc      = env.DEFAULT_COUNTRY_CODE || '55';
  const rawPhone = phone || label.phone || '';
  const phNorm   = normalizePhone(rawPhone, cc);

  const finalValue   = value !== undefined ? parseBRFloat(value)
                     : parseFloat(label.value_brl || '0') || 0;
  const finalProduct = (produto || label.product || '').trim();
  const finalName    = (name || '').trim();
  const eventOrigem  = ['ad', 'google', 'organic', 'referral'].includes(origem) ? origem : 'ad';
  const fonte        = action === 'corrigir' ? 'ia-corrigido' : 'ia';

  const parts    = finalName.split(/\s+/).filter(Boolean);
  const fn       = parts[0] || '';
  const ln       = parts.slice(1).join(' ');

  const hashedPh = await sha256(phNorm);
  const hashedFn = fn ? await sha256(fn.toLowerCase()) : '';
  const hashedLn = ln ? await sha256(ln.toLowerCase()) : '';

  const eventId    = crypto.randomUUID();
  const phoneLast4 = phNorm.slice(-4) || rawPhone.replace(/\D/g, '').slice(-4);
  const valueCents = Math.round(finalValue * 100);
  const eventDate  = label.created_at ? label.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const eventTime  = label.created_at
    ? Math.floor(new Date(label.created_at).getTime() / 1000)
    : nowTs;

  // ── Insert D1 ─────────────────────────────────────────────────────
  // INSERT OR IGNORE evita duplicata se o gestor confirmar a mesma conversa duas vezes
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
        fonte, id,
      ).run();
      d1Ok = (result.changes || 0) > 0;
    } catch (_) { /* não bloqueia a resposta */ }
  }

  // ── Meta CAPI ─────────────────────────────────────────────────────
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
      const resp = await fetch(
        `https://graph.facebook.com/v25.0/${env.META_PIXEL_ID}/events?access_token=${metaToken}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      metaStatus = resp.status;
      metaOk     = resp.ok;
      metaBody   = await resp.text();
    } catch (err) { metaBody = err.message || 'fetch error'; }

    // Atualiza meta_ok no D1
    if (metaOk && env.DB) {
      try {
        await env.DB.prepare(
          `UPDATE manual_conversions SET meta_ok = 1 WHERE supabase_venda_id = ?`
        ).bind(id).run();
      } catch (_) {}
    }
  } else {
    if (!env.META_PIXEL_ID || !metaToken) metaBody = 'skipped: META_PIXEL_ID não configurado';
    else if (!sendToMeta)                  metaBody = 'skipped: origem não é anúncio';
    else                                   metaBody = 'skipped: data com mais de 7 dias';
  }

  return json({
    ok:            true,
    action,
    human_label:   newLabel,
    event_id:      eventId,
    d1_ok:         d1Ok,
    meta_ok:       metaOk || metaSkipped,
    meta_skipped:  metaSkipped,
    meta_status:   metaStatus,
    meta_response: metaBody,
  });
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
