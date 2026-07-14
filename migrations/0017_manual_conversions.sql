-- Manual conversion registration for Fort Popular.
-- Logged by the pharmacy team when a WhatsApp conversation results in
-- a contact or a purchase. Fires to Meta CAPI with action_source 'chat'.
CREATE TABLE IF NOT EXISTS manual_conversions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id         TEXT NOT NULL UNIQUE,          -- UUID, used for Meta dedup
    event_name       TEXT NOT NULL,                 -- 'Contact' | 'Purchase'
    display_name     TEXT NOT NULL DEFAULT '',
    phone_last4      TEXT NOT NULL DEFAULT '',
    phone_normalized TEXT NOT NULL DEFAULT '',
    value_cents      INTEGER NOT NULL DEFAULT 0,    -- 0 for Contact events
    event_date       TEXT NOT NULL,                 -- YYYY-MM-DD
    origem           TEXT NOT NULL DEFAULT 'ad',    -- 'ad' | 'organic' | 'referral'
    meta_ok          INTEGER NOT NULL DEFAULT 0,    -- 1 = CAPI accepted
    registered_at    INTEGER NOT NULL               -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_manual_conversions_date
    ON manual_conversions(event_date);

CREATE INDEX IF NOT EXISTS idx_manual_conversions_event_name
    ON manual_conversions(event_name);
