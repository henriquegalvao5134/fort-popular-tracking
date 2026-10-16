-- Adiciona campos de rastreamento de origem IA na tabela manual_conversions
-- fonte: 'manual' (legado) | 'ia' (confirmado pelo agente) | 'ia-corrigido' (corrigido pela equipe)
-- supabase_venda_id: UUID da linha em conversation_labels que originou o registro

ALTER TABLE manual_conversions ADD COLUMN fonte TEXT;
ALTER TABLE manual_conversions ADD COLUMN supabase_venda_id TEXT;

-- Índice único para evitar inserção duplicada da mesma conversa IA
CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_supabase_venda_id
  ON manual_conversions(supabase_venda_id)
  WHERE supabase_venda_id IS NOT NULL;
