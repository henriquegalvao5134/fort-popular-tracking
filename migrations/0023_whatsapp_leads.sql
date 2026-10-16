-- Controle de leads WhatsApp — um registro por conversa (chat_id).
-- Guarda atribuição (ctwaClid / googleGclid), status dos eventos disparados
-- e evita duplicatas de Lead e Purchase por conversa.

CREATE TABLE IF NOT EXISTS whatsapp_leads (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id               TEXT    NOT NULL UNIQUE,   -- JID do lead (ex: 5521...@c.us)
  session_id            TEXT    NOT NULL,
  push_name             TEXT,                      -- nome no WhatsApp
  phone                 TEXT,                      -- número normalizado (somente dígitos)
  ctwa_clid             TEXT,                      -- Meta CTWA attribution ID
  google_gclid          TEXT,                      -- Google Ads click ID
  first_msg_at          INTEGER NOT NULL,          -- Unix ts da primeira mensagem
  lead_fired_at         INTEGER,                   -- quando Lead foi enviado ao Meta CAPI
  lead_event_id         TEXT,                      -- event_id do Lead (dedup)
  purchase_fired_at     INTEGER,                   -- quando Purchase foi enviado
  purchase_event_id     TEXT,                      -- event_id do Purchase (dedup)
  purchase_value_cents  INTEGER,                   -- valor em centavos
  detected_by           TEXT,                      -- 'keywords' | 'manual' | 'ai'
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wa_leads_chat_id    ON whatsapp_leads(chat_id);
CREATE INDEX IF NOT EXISTS idx_wa_leads_ctwa_clid  ON whatsapp_leads(ctwa_clid);
CREATE INDEX IF NOT EXISTS idx_wa_leads_gclid      ON whatsapp_leads(google_gclid);
