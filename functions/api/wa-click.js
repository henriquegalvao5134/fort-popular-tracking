// POST /api/wa-click
//
// Registra um clique no botão de WhatsApp do site com os parâmetros
// de rastreamento da sessão. Endpoint público (sem auth) — só grava
// dados de clique, nenhum dado sensível.
//
// Body: {
//   code:         string  — código curto gerado no front (ex.: G7K2Q)
//   gclid:        string
//   gbraid:       string
//   wbraid:       string
//   fbclid:       string
//   utm_source:   string
//   utm_medium:   string
//   utm_campaign: string
//   utm_content:  string
//   utm_term:     string
//   session_id:   string  — cookie _krob_sid
// }

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body = {};
  try { body = await request.json(); } catch (_) {}

  const {
    code        = '',
    gclid       = '',
    gbraid      = '',
    wbraid      = '',
    fbclid      = '',
    utm_source   = '',
    utm_medium   = '',
    utm_campaign = '',
    utm_content  = '',
    utm_term     = '',
    session_id   = '',
  } = body;

  if (!code) return json({ error: 'code é obrigatório' }, 400);

  if (env.DB) {
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO wa_clicks
          (code, gclid, gbraid, wbraid, fbclid,
           utm_source, utm_medium, utm_campaign, utm_content, utm_term,
           session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        code, gclid, gbraid, wbraid, fbclid,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        session_id,
      ).run();
    } catch (e) {
      console.error('wa-click D1 error:', e.message);
      return json({ error: 'DB error: ' + e.message }, 500);
    }
  }

  return json({ ok: true, code });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
