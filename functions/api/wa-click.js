// POST /api/wa-click
//
// Registra um clique no botão de WhatsApp do site com os parâmetros
// de rastreamento da sessão. Endpoint público (sem auth) — só grava
// dados de clique, nenhum dado sensível.
//
// Dual-write: D1 (wa_clicks) + Supabase (cliques_site).
// Se o Supabase falhar, NÃO trava a resposta (waitUntil, fire-and-forget).
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

  // --- D1 write (blocking) ---
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

  // --- Supabase write (non-blocking — falha não trava o clique) ---
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    context.waitUntil(
      fetch(`${env.SUPABASE_URL}/rest/v1/cliques_site`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          client_slug:  'fort-popular',
          codigo:       code,
          gclid, gbraid, wbraid, fbclid,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          session_id,
        }),
      }).catch(e => console.error('wa-click Supabase error:', e.message))
    );
  }

  return json({ ok: true, code });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
