-- Add messaging_conversations column to ad_spend to track WhatsApp
-- conversation initiations from Meta Ads (messaging_conversation_started_7d action).
ALTER TABLE ad_spend ADD COLUMN messaging_conversations INTEGER DEFAULT 0;
