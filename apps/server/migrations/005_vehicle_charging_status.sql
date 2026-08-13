ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS charging_status TEXT NOT NULL DEFAULT 'connected'
    CHECK (charging_status IN ('connected', 'charging', 'completed'));
