-- Adiciona campos de PII do cliente em manual_conversions.
-- Usados para melhorar o match quality do Meta CAPI.
-- Todos opcionais (podem ficar vazios).
ALTER TABLE manual_conversions ADD COLUMN email        TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN cpf          TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN city         TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN state        TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN zip          TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN neighborhood TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN address      TEXT NOT NULL DEFAULT '';
