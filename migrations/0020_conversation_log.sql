-- WhatsApp conversation log para GD3 tracking stack.
-- Armazena cada mensagem recebida/enviada via OpenWA webhook.
-- ctwa_clid (Click-to-WhatsApp ID) permite atribuir vendas ao anúncio exato no Meta CAPI.

CREATE TABLE IF NOT EXISTS conversation_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT    NOT NULL,              -- OpenWA session ID (UUID)
  chat_id         TEXT    NOT NULL,              -- JID do chat (ex: 5521987654321@c.us)
  wa_message_id   TEXT,                          -- ID serializado da mensagem no WhatsApp
  from_jid        TEXT    NOT NULL,              -- JID do remetente
  from_me         INTEGER NOT NULL DEFAULT 0,    -- 1 = enviado por nós, 0 = recebido
  body            TEXT,                          -- texto da mensagem
  type            TEXT    NOT NULL DEFAULT 'text',  -- text | image | audio | etc.
  timestamp       INTEGER NOT NULL,              -- Unix timestamp da mensagem (do WhatsApp)
  ctwa_clid       TEXT,                          -- Meta Click-to-WhatsApp ID (só na 1ª msg do lead)
  push_name       TEXT,                          -- push name do remetente
  created_at      INTEGER NOT NULL               -- quando esta linha foi gravada no D1
);

CREATE INDEX IF NOT EXISTS idx_conv_log_chat_id   ON conversation_log(chat_id);
CREATE INDEX IF NOT EXISTS idx_conv_log_timestamp ON conversation_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_conv_log_ctwa_clid ON conversation_log(ctwa_clid);
CREATE INDEX IF NOT EXISTS idx_conv_log_session   ON conversation_log(session_id);
