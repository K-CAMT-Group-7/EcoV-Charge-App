ALTER TABLE charging_sessions
    ADD COLUMN IF NOT EXISTS control_mode TEXT NOT NULL DEFAULT 'smart'
    CHECK (control_mode IN ('smart', 'force'));
