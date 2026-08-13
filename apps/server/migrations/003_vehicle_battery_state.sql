ALTER TABLE vehicles
    ADD COLUMN IF NOT EXISTS current_battery_percent DOUBLE PRECISION NOT NULL DEFAULT 20
    CHECK (current_battery_percent >= 0 AND current_battery_percent <= 100);
