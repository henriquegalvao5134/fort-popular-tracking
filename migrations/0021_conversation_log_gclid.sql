-- Adiciona coluna google_gclid ao conversation_log.
-- Armazena o gclid extraído do texto da primeira mensagem de leads vindos
-- do Google Ads (site injeta "gclid:AW-XXXXX" no pré-preenchimento do botão WhatsApp).

ALTER TABLE conversation_log ADD COLUMN google_gclid TEXT;

CREATE INDEX IF NOT EXISTS idx_conv_log_google_gclid ON conversation_log(google_gclid);
