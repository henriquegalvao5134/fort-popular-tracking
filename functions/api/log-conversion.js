// POST /api/log-conversion
//
// Registra uma conversão manual da equipe da farmácia quando uma conversa
// no WhatsApp resulta em contato ou venda. Dispara evento para Meta CAPI
// com action_source 'chat'.
//
// Auth:  header x-dash-key: <DASH_KEY> ou <CLIENT_KEY>
// Body:  {
//          event_name:    'Contact' | 'Purchase',
//          phone:         número WhatsApp do cliente (ex: "21987654321")
//          name?:         nome completo do cliente
//          value?:        valor da compra em R$ (obrigatório para Purchase)
//          date?:         data em YYYY-MM-DD (padrão: hoje)
//          origem?:       'ad' | 'google' | 'organic' | 'referral' (padrão: 'ad')
//          email?:        email do cliente  → Meta em
//          cpf?:          CPF do cliente    → Meta external_id (hashed)
//          city?:         cidade            → Meta ct
//          state?:        UF (ex: 'RJ')    → Meta st
//          zip?:          CEP               → Meta zp
//          neighborhood?: bairro (armazenado no D1, não tem campo próprio no Meta)
//          address?:      rua / número (armazenado no D1)
//        }
//
// Required env para CAPI:
//   META_PIXEL_ID        ID do pixel Meta
//   META_ACCESS_TOKEN    Token do sistema com permissão ads_management
// Optional env:
//   META_TEST_EVENT_CODE Para testes no Events Manager

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-dash-key',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const key = request.headers.get('x-dash-key') || '';
  const validKey = (env.DASH_KEY && key === env.DASH_KEY) || (env.CLIENT_KEY && key === env.CLIENT_KEY);
  if (!validKey) return json({ error: 'Unauthorized' }, 401);

  let body = {};
  try { body = await request.json(); } catch (_) { body = {}; }

  const {
    event_name, phone, name, value, date, origem,
    email, cpf, city, state, zip, neighborhood, address,
    produto, observacao,
  } = body;

  // Validações
  if (!event_name || !['Contact', 'Purchase'].includes(event_name)) {
    return json({ error: 'event_name deve ser "Contact" ou "Purchase"' }, 400);
  }
  if (!phone) return json({ error: 'phone é obrigatório' }, 400);

  // Origem
  const ORIGENS = ['ad', 'google', 'organic', 'referral'];
  const eventOrigem = ORIGENS.includes(origem) ? origem : 'ad';
  const sendToMeta  = eventOrigem === 'ad' || eventOrigem === 'google';

  // Data
  const nowTs    = Math.floor(Date.now() / 1000);
  const todayUtc = new Date().toISOString().slice(0, 10);
  let eventTime, eventDate;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    eventDate = date;
    eventTime = date >= todayUtc ? nowTs : Math.floor(new Date(`${date}T15:00:00Z`).getTime() / 1000);
  } else {
    eventDate = todayUtc;
    eventTime = nowTs;
  }

  // ── Hash PII ──────────────────────────────────────────────────
  const cc     = env.DEFAULT_COUNTRY_CODE || '55';
  const phNorm = normalizePhone(phone, cc);

  const parts   = (name || '').trim().split(/\s+/).filter(Boolean);
  const fn      = parts[0] || '';
  const ln      = parts.slice(1).join(' ');

  const hashedPh  = await sha256(phNorm);
  const hashedFn  = fn ? await sha256(fn.toLowerCase()) : '';
  const hashedLn  = ln ? await sha256(ln.toLowerCase()) : '';

  // Campos PII extras → Meta
  const emailClean  = (email || '').toLowerCase().trim();
  const cpfDigits   = (cpf   || '').replace(/\D/g, '');
  const cityClean   = (city  || '').toLowerCase().trim();
  const stateClean  = (state || '').toLowerCase().trim().slice(0, 2);
  const zipDigits   = (zip   || '').replace(/\D/g, '');

  const hashedEm  = emailClean             ? await sha256(emailClean)  : '';
  const hashedEid = cpfDigits.length >= 11 ? await sha256(cpfDigits)   : '';
  const hashedCt  = cityClean              ? await sha256(cityClean)   : '';
  const hashedSt  = stateClean             ? await sha256(stateClean)  : '';
  const hashedZp  = zipDigits              ? await sha256(zipDigits)   : '';

  const eventId = crypto.randomUUID();

  // ── Payload CAPI ──────────────────────────────────────────────
  const userData = { country: [await sha256('br')] };
  if (hashedPh)  userData.ph          = [hashedPh];
  if (hashedFn)  userData.fn          = [hashedFn];
  if (hashedLn)  userData.ln          = [hashedLn];
  if (hashedEm)  userData.em          = [hashedEm];
  if (hashedEid) userData.external_id = [hashedEid];
  if (hashedCt)  userData.ct          = [hashedCt];
  if (hashedSt)  userData.st          = [hashedSt];
  if (hashedZp)  userData.zp          = [hashedZp];

  const eventEntry = {
    event_name,
    event_time:    eventTime,
    event_id:      eventId,
    action_source: 'chat',
    user_data:     userData,
    data_processing_options:         ['LDU'],
    data_processing_options_country: 0,
    data_processing_options_state:   0,
  };

  if (event_name === 'Purchase') {
    eventEntry.custom_data = {
      value:            parseBRFloat(value),
      currency:         'BRL',
      content_category: 'farmacia',
    };
  }

  const payload = { data: [eventEntry] };
  if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;

  // ── Disparar para Meta CAPI ───────────────────────────────────
  let metaOk = false, metaBody = '', metaStatus = 0;
  const sevenDaysAgo = nowTs - 7 * 24 * 60 * 60;
  const metaToken    = env.META_ACCESS_TOKEN || env.META_ADS_ACCESS_TOKEN;
  const metaSkipped  = !sendToMeta || eventTime < sevenDaysAgo || !env.META_PIXEL_ID || !metaToken;

  if (!metaSkipped) {
    try {
      const resp = await fetch(
        `https://graph.facebook.com/v25.0/${env.META_PIXEL_ID}/events?access_token=${metaToken}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      );
      metaStatus = resp.status;
      metaOk     = resp.ok;
      metaBody   = await resp.text();
    } catch (err) { metaBody = err.message || 'fetch error'; }
  } else {
    if (!env.META_PIXEL_ID || !metaToken) metaBody = 'skipped: META_PIXEL_ID não configurado';
    else if (!sendToMeta)                  metaBody = 'skipped: origem não é anúncio';
    else                                   metaBody = 'skipped: data com mais de 7 dias';
  }

  // ── Salvar no D1 ─────────────────────────────────────────────
  if (env.DB) {
    try {
      const phoneLast4 = (phone || '').replace(/\D/g, '').slice(-4);
      const valueCents = Math.round(parseBRFloat(value) * 100);

      await env.DB.prepare(`
        INSERT INTO manual_conversions
          (event_id, event_name, display_name, phone_last4, phone_normalized,
           value_cents, event_date, origem, meta_ok, registered_at,
           email, cpf, city, state, zip, neighborhood, address,
           produto, observacao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        eventId,
        event_name,
        (name || '').trim(),
        phoneLast4,
        phNorm,
        valueCents,
        eventDate,
        eventOrigem,
        metaOk ? 1 : 0,
        nowTs,
        emailClean,
        cpfDigits,
        (city         || '').trim(),
        stateClean.toUpperCase(),
        zipDigits,
        (neighborhood || '').trim(),
        (address      || '').trim(),
        (produto      || '').trim(),
        (observacao   || '').trim(),
      ).run();
    } catch (_) { /* não bloqueia a resposta */ }
  }

  // Contagem de sinais enviados ao Meta (para feedback de qualidade)
  const matchSignals = [hashedPh, hashedFn || hashedLn, hashedEm, hashedEid, hashedCt, hashedSt, hashedZp]
    .filter(Boolean).length;

  return json({
    ok:            metaOk || metaSkipped,
    saved:         true,
    event_id:      eventId,
    meta_skipped:  metaSkipped,
    meta_status:   metaStatus,
    meta_response: metaBody,
    origem:        eventOrigem,
    match_signals: matchSignals,
  });
}

// ── Helpers ───────────────────────────────────────────────────

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
