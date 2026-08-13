ALTER TABLE charging_sessions
    ADD COLUMN IF NOT EXISTS estimated_optimized_emissions_gco2 DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (estimated_optimized_emissions_gco2 >= 0),
    ADD COLUMN IF NOT EXISTS estimated_immediate_emissions_gco2 DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (estimated_immediate_emissions_gco2 >= 0),
    ADD COLUMN IF NOT EXISTS estimated_carbon_savings_gco2 DOUBLE PRECISION NOT NULL DEFAULT 0
        CHECK (estimated_carbon_savings_gco2 >= 0);
