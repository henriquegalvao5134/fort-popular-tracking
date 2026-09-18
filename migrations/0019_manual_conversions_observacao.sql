-- Campos de produto e observação para conversões manuais (Fort Popular).
-- produto    = medicamento ou produto vendido/solicitado
-- observacao = nota livre sobre o atendimento (ex: "cliente não responde")
ALTER TABLE manual_conversions ADD COLUMN produto    TEXT NOT NULL DEFAULT '';
ALTER TABLE manual_conversions ADD COLUMN observacao TEXT NOT NULL DEFAULT '';
