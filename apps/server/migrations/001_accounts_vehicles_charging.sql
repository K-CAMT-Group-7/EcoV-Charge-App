CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider = 'google'),
    provider_subject TEXT NOT NULL,
    email TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS social_identities_user_id_idx ON social_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash BYTEA NOT NULL UNIQUE,
    device_name TEXT NOT NULL DEFAULT '',
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_active_idx
    ON auth_sessions(token_hash, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    model_year INTEGER NOT NULL CHECK (model_year >= 1886),
    battery_capacity_kwh DOUBLE PRECISION NOT NULL CHECK (battery_capacity_kwh > 0),
    ac_charging_power_kw DOUBLE PRECISION NOT NULL CHECK (ac_charging_power_kw > 0),
    dc_fast_charging_power_kw DOUBLE PRECISION NOT NULL CHECK (dc_fast_charging_power_kw > 0),
    charging_efficiency DOUBLE PRECISION NOT NULL CHECK (charging_efficiency > 0 AND charging_efficiency <= 1),
    connector_types TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vehicles_user_id_idx ON vehicles(user_id);

CREATE TABLE IF NOT EXISTS charging_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ NOT NULL,
    start_battery_percent DOUBLE PRECISION NOT NULL CHECK (start_battery_percent >= 0 AND start_battery_percent <= 100),
    end_battery_percent DOUBLE PRECISION NOT NULL CHECK (end_battery_percent >= start_battery_percent AND end_battery_percent <= 100),
    battery_energy_kwh DOUBLE PRECISION NOT NULL CHECK (battery_energy_kwh > 0),
    grid_energy_kwh DOUBLE PRECISION CHECK (grid_energy_kwh IS NULL OR grid_energy_kwh > 0),
    average_carbon_intensity DOUBLE PRECISION CHECK (average_carbon_intensity IS NULL OR average_carbon_intensity >= 0),
    emissions_gco2 DOUBLE PRECISION CHECK (emissions_gco2 IS NULL OR emissions_gco2 >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS charging_records_user_started_idx
    ON charging_records(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS charging_records_vehicle_started_idx
    ON charging_records(vehicle_id, started_at DESC);
