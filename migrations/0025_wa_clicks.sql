-- Tabela de rastreamento de cliques no botão de WhatsApp do site.
-- Cada linha = 1 page-load que resultou em clique.
-- O código curto (ex.: G7K2Q) correlaciona o clique com a mensagem no WhatsApp.

CREATE TABLE IF NOT EXISTS wa_clicks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,   -- G + 5 chars, ex.: G7K2Q
  gclid        TEXT    NOT NULL DEFAULT '',
  gbraid       TEXT    NOT NULL DEFAULT '',
  wbraid       TEXT    NOT NULL DEFAULT '',
  fbclid       TEXT    NOT NULL DEFAULT '',
  utm_source   TEXT    NOT NULL DEFAULT '',
  utm_medium   TEXT    NOT NULL DEFAULT '',
  utm_campaign TEXT    NOT NULL DEFAULT '',
  utm_content  TEXT    NOT NULL DEFAULT '',
  utm_term     TEXT    NOT NULL DEFAULT '',
  session_id   TEXT    NOT NULL DEFAULT '',
  clicked_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_wa_clicks_code    ON wa_clicks(code);
CREATE INDEX IF NOT EXISTS idx_wa_clicks_gclid   ON wa_clicks(gclid);
CREATE INDEX IF NOT EXISTS idx_wa_clicks_session ON wa_clicks(session_id);
