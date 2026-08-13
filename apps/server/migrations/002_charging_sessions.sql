CREATE TABLE IF NOT EXISTS charging_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'charging', 'completed', 'stopped', 'failed')),
    started_at TIMESTAMPTZ NOT NULL,
    target_at TIMESTAMPTZ NOT NULL,
    initial_battery_percent DOUBLE PRECISION NOT NULL CHECK (initial_battery_percent >= 0 AND initial_battery_percent <= 100),
    current_battery_percent DOUBLE PRECISION NOT NULL CHECK (current_battery_percent >= 0 AND current_battery_percent <= 100),
    target_battery_percent DOUBLE PRECISION NOT NULL CHECK (target_battery_percent >= 0 AND target_battery_percent <= 100),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
    accumulated_battery_energy_kwh DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (accumulated_battery_energy_kwh >= 0),
    accumulated_grid_energy_kwh DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (accumulated_grid_energy_kwh >= 0),
    accumulated_emissions_gco2 DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (accumulated_emissions_gco2 >= 0),
    last_controlled_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (target_at > started_at),
    CHECK (target_battery_percent >= initial_battery_percent)
);

CREATE INDEX IF NOT EXISTS charging_sessions_active_idx
    ON charging_sessions(status, target_at)
    WHERE status IN ('scheduled', 'charging');
CREATE UNIQUE INDEX IF NOT EXISTS charging_sessions_one_active_vehicle_idx
    ON charging_sessions(vehicle_id)
    WHERE status IN ('scheduled', 'charging');

CREATE TABLE IF NOT EXISTS charging_session_ticks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES charging_sessions(id) ON DELETE CASCADE,
    controlled_at TIMESTAMPTZ NOT NULL,
    charging_power_kw DOUBLE PRECISION NOT NULL CHECK (charging_power_kw >= 0),
    battery_energy_kwh DOUBLE PRECISION NOT NULL CHECK (battery_energy_kwh >= 0),
    grid_energy_kwh DOUBLE PRECISION NOT NULL CHECK (grid_energy_kwh >= 0),
    carbon_intensity DOUBLE PRECISION,
    emissions_gco2 DOUBLE PRECISION NOT NULL CHECK (emissions_gco2 >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (session_id, controlled_at)
);
