// POST /api/whatsapp-webhook
//
// Recebe mensagens do OpenWA e executa o loop completo de atribuição:
//
//   1. Salva mensagem em conversation_log
//   2. Se lead novo com ctwaClid (Meta) ou googleGclid (Google):
//      → cria registro em whatsapp_leads
//      → dispara evento Lead para Meta CAPI (action_source: business_messaging)
//   3. A cada mensagem: analisa conversa por sinais de venda
//      → se detectado e Purchase ainda não disparado: extrai valor + dispara Purchase
//
// Autenticação: header x-webhook-secret: <OWA_WEBHOOK_SECRET>
// Env obrigatórios para CAPI: META_PIXEL_ID, META_ACCESS_TOKEN
// Env opcionais: META_TEST_EVENT_CODE, DEFAULT_PURCHASE_VALUE (padrão: 50)

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── Autenticação ──────────────────────────────────────────────
  const secret = (env.OWA_WEBHOOK_SECRET || '').trim();
  if (secret) {
    const provided = (request.headers.get('x-webhook-secret') || '').trim();
    if (provided !== secret) return json({ error: 'Unauthorized' }, 401);
  }

  // ── Parse do body ─────────────────────────────────────────────
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const { event, sessionId, data } = body;

  if (!event || !['message.received', 'message.sent'].includes(event)) {
    return json({ ok: true, skipped: true, reason: 'event_not_message' });
  }
  if (!data || !sessionId) {
    return json({ error: 'data ou sessionId ausente' }, 400);
  }

  const {
    id:      waMessageId,
    from:    fromJid,
    chatId,
    body:    msgBody,
    type:    msgType,
    timestamp,
    fromMe,
    ctwaClid,
    contact,
  } = data;

  if (!chatId || !fromJid) {
    return json({ error: 'chatId ou from ausente no payload' }, 400);
  }

  const nowTs    = Math.floor(Date.now() / 1000);
  const pushName = contact?.pushName || null;
  const phone    = jidToPhone(chatId);

  // ── Extrair gclid do texto (Google Ads via site) ──────────────
  // Site injeta gclid como caracteres zero-width no pré-preenchimento.
  let googleGclid = null;
  if (!fromMe && msgBody) {
    const zwMatch = msgBody.match(/\uFEFF([\u200B\u200C\u200D]+)\u2060/);
    if (zwMatch) {
      try {
        googleGclid = zwMatch[1].split('\u200D').map(byte =>
          String.fromCharCode(parseInt(
            byte.replace(/\u200B/g, '0').replace(/\u200C/g, '1'), 2
          ))
        ).join('');
      } catch (_) { googleGclid = null; }
    }
  }

  // ── Salvar no D1 ─────────────────────────────────────────────
  let saved = false;
  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT INTO conversation_log
          (session_id, chat_id, wa_message_id, from_jid, from_me,
           body, type, timestamp, ctwa_clid, google_gclid, push_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sessionId, chatId, waMessageId || null, fromJid,
        fromMe ? 1 : 0, msgBody || null, msgType || 'unknown',
        Number(timestamp) || nowTs,
        ctwaClid || null, googleGclid || null, pushName, nowTs,
      ).run();
      saved = true;
    } catch (err) {
      console.error('[whatsapp-webhook] D1 insert error:', err?.message || err);
    }
  }

  // ── Pipeline de atribuição e conversão ───────────────────────
  // Só processa mensagens recebidas (do lead) e se D1 estiver disponível.
  let result = { leadFired: false, purchaseFired: false };

  if (!fromMe && env.DB && (ctwaClid || googleGclid)) {
    try {
      result = await runConversionPipeline({
        env, chatId, sessionId, phone, pushName,
        ctwaClid, googleGclid, msgTimestamp: Number(timestamp) || nowTs, nowTs,
      });
    } catch (err) {
      console.error('[whatsapp-webhook] pipeline error:', err?.message || err);
    }
  }

  return json({
    ok:           true,
    saved,
    chatId,
    fromMe:       Boolean(fromMe),
    hasCtwaClid:  Boolean(ctwaClid),
    hasGclid:     Boolean(googleGclid),
    leadFired:    result.leadFired,
    purchaseFired: result.purchaseFired,
  });
}

// ── Pipeline principal ────────────────────────────────────────

async function runConversionPipeline({ env, chatId, sessionId, phone, pushName, ctwaClid, googleGclid, msgTimestamp, nowTs }) {
  const result = { leadFired: false, purchaseFired: false };

  // 1. Busca ou cria o lead
  let lead = await env.DB.prepare(
    'SELECT * FROM whatsapp_leads WHERE chat_id = ?'
  ).bind(chatId).first();

  if (!lead) {
    // Novo lead com atribuição — salva e dispara Lead
    const leadEventId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO whatsapp_leads
        (chat_id, session_id, push_name, phone, ctwa_clid, google_gclid,
         first_msg_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      chatId, sessionId, pushName, phone,
      ctwaClid || null, googleGclid || null,
      msgTimestamp, nowTs,
    ).run();

    lead = await env.DB.prepare(
      'SELECT * FROM whatsapp_leads WHERE chat_id = ?'
    ).bind(chatId).first();

    // Dispara Lead para Meta CAPI (só se CAPI_ENABLED=1)
    if (env.CAPI_ENABLED === '1' && ctwaClid && env.META_PIXEL_ID && env.META_ACCESS_TOKEN) {
      const capiRes = await fireCapiEvent({
        env,
        eventName:  'Lead',
        phone,
        ctwaClid,
        eventTime:  msgTimestamp,
        eventId:    leadEventId,
      });

      await env.DB.prepare(`
        UPDATE whatsapp_leads
        SET lead_fired_at = ?, lead_event_id = ?
        WHERE chat_id = ?
      `).bind(nowTs, leadEventId, chatId).run();

      result.leadFired = capiRes.ok;
    }
  }

  // 2. Detecta venda (só se Purchase ainda não foi disparado)
  if (lead && !lead.purchase_fired_at) {
    const messages = await env.DB.prepare(`
      SELECT body, from_me FROM conversation_log
      WHERE chat_id = ? AND type = 'text'
      ORDER BY timestamp DESC LIMIT 40
    `).bind(chatId).all();

    const msgs = (messages.results || []).reverse();
    const sale = detectSale(msgs);

    if (sale.detected) {
      const purchaseEventId = crypto.randomUUID();
      const valueCents      = sale.valueCents || defaultValueCents(env);

      // Dispara Purchase para Meta CAPI (só se CAPI_ENABLED=1)
      if (env.CAPI_ENABLED === '1' && (lead.ctwa_clid || ctwaClid) && env.META_PIXEL_ID && env.META_ACCESS_TOKEN) {
        const capiRes = await fireCapiEvent({
          env,
          eventName: 'Purchase',
          phone:     lead.phone || phone,
          ctwaClid:  lead.ctwa_clid || ctwaClid,
          value:     valueCents / 100,
          eventTime: nowTs,
          eventId:   purchaseEventId,
        });

        await env.DB.prepare(`
          UPDATE whatsapp_leads
          SET purchase_fired_at = ?, purchase_event_id = ?,
              purchase_value_cents = ?, detected_by = ?
          WHERE chat_id = ?
        `).bind(nowTs, purchaseEventId, valueCents, 'keywords', chatId).run();

        result.purchaseFired = capiRes.ok;
      }

      // TODO: Google Ads Conversions API (gclid) — próxima fase
    }
  }

  return result;
}

// ── Detecção de venda por palavras-chave ─────────────────────

const SALE_SIGNALS_CUSTOMER = [
  'quero', 'vou levar', 'pode separar', 'me separa', 'me reserva',
  'vou buscar', 'vou pegar', 'pode confirmar', 'confirmado', 'fechado',
  'combinado', 'tá bom', 'ta bom', 'pode ser', 'sim pode', 'aceito',
  'vou comprar', 'quero comprar', 'me manda', 'pode mandar', 'vou querer',
  'me passa', 'tá ótimo', 'ta otimo', 'vou sim', 'perfeito',
];

const SALE_SIGNALS_PHARMACY = [
  'anotado', 'separado', 'reservado', 'confirmado', 'pode vir',
  'te aguardamos', 'te esperamos', 'guardamos', 'fica aqui',
  'está pronto', 'esta pronto', 'prontinho', 'já separei', 'ja separei',
  'pode buscar', 'tá separado', 'ta separado',
];

const NO_SALE_SIGNALS = [
  'não temos', 'nao temos', 'não tem', 'nao tem', 'sem estoque',
  'em falta', 'não trabalhamos', 'nao trabalhamos', 'indisponível',
  'indisponivel', 'não fabricamos', 'nao fabricamos', 'no momento não',
  'no momento nao', 'fora de estoque',
];

function detectSale(messages) {
  const result = { detected: false, valueCents: null };
  if (!messages.length) return result;

  // Se farmácia disse "sem estoque" em alguma msg → não é venda
  const pharmacyMsgs = messages.filter(m => m.from_me).map(m => (m.body || '').toLowerCase());
  const hasNoSale = pharmacyMsgs.some(txt =>
    NO_SALE_SIGNALS.some(sig => txt.includes(sig))
  );
  if (hasNoSale) return result;

  // Verifica sinais de venda
  const customerMsgs  = messages.filter(m => !m.from_me).map(m => (m.body || '').toLowerCase());
  const customerSale  = customerMsgs.some(txt => SALE_SIGNALS_CUSTOMER.some(sig => txt.includes(sig)));
  const pharmacySale  = pharmacyMsgs.some(txt => SALE_SIGNALS_PHARMACY.some(sig => txt.includes(sig)));

  if (!customerSale && !pharmacySale) return result;

  // Extrai valor da conversa (todos os textos)
  const allText = messages.map(m => m.body || '').join(' ');
  const prices  = [...allText.matchAll(/R\$\s*(\d+(?:[.,]\d{1,2})?)/gi)];
  if (prices.length) {
    const lastPrice = prices[prices.length - 1][1];
    const valor = parseFloat(lastPrice.replace(/\./g, '').replace(',', '.'));
    if (valor > 0) result.valueCents = Math.round(valor * 100);
  }

  result.detected = true;
  return result;
}

// ── Disparo para Meta CAPI (business_messaging) ──────────────

async function fireCapiEvent({ env, eventName, phone, ctwaClid, value, eventTime, eventId }) {
  const hashedPh  = await sha256(phone || '');
  const pageId    = env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';

  const userData = {};
  if (hashedPh) userData.ph = [hashedPh];
  if (ctwaClid)  userData.ctwa_clid = ctwaClid;
  if (pageId)    userData.page_id   = pageId;
  userData.country = [await sha256('br')];

  const eventEntry = {
    event_name:    eventName,
    event_time:    eventTime,
    event_id:      eventId,
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    user_data:     userData,
    data_processing_options:         ['LDU'],
    data_processing_options_country: 0,
    data_processing_options_state:   0,
  };

  if (eventName === 'Purchase' && value > 0) {
    eventEntry.custom_data = { value, currency: 'BRL', content_category: 'farmacia' };
  }

  const payload = { data: [eventEntry] };
  if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v25.0/${env.META_PIXEL_ID}/events?access_token=${env.META_ACCESS_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    return { ok: resp.ok, status: resp.status };
  } catch (err) {
    console.error('[whatsapp-webhook] CAPI error:', err?.message);
    return { ok: false, status: 0 };
  }
}

// ── Helpers ───────────────────────────────────────────────────

function jidToPhone(jid) {
  return (jid || '').replace(/@.*$/, '').replace(/[^0-9]/g, '');
}

function defaultValueCents(env) {
  const v = parseFloat(env.DEFAULT_PURCHASE_VALUE || '50');
  return Math.round((isNaN(v) ? 50 : v) * 100);
}

async function sha256(value) {
  if (!value) return '';
  const encoded = new TextEncoder().encode(String(value).toLowerCase().trim());
  const buffer  = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
