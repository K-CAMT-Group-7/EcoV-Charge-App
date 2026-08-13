package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (store *Store) UpsertGoogleUser(
	ctx context.Context,
	identity account.GoogleIdentity,
) (account.User, error) {
	transaction, err := store.pool.Begin(ctx)
	if err != nil {
		return account.User{}, err
	}
	defer transaction.Rollback(ctx)

	if _, err := transaction.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "google:"+identity.Subject); err != nil {
		return account.User{}, err
	}

	var user account.User
	err = transaction.QueryRow(ctx, `
		SELECT u.id, u.email, u.display_name, u.avatar_url, u.created_at, u.updated_at
		FROM users u
		JOIN social_identities i ON i.user_id = u.id
		WHERE i.provider = 'google' AND i.provider_subject = $1
	`, identity.Subject).Scan(
		&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)
	avatar := nullableText(identity.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		err = transaction.QueryRow(ctx, `
			INSERT INTO users (email, display_name, avatar_url)
			VALUES ($1, $2, $3)
			RETURNING id, email, display_name, avatar_url, created_at, updated_at
		`, identity.Email, identity.DisplayName, avatar).Scan(
			&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return account.User{}, err
		}
		_, err = transaction.Exec(ctx, `
			INSERT INTO social_identities
				(user_id, provider, provider_subject, email, email_verified)
			VALUES ($1, 'google', $2, $3, $4)
		`, user.ID, identity.Subject, identity.Email, identity.EmailVerified)
		if err != nil {
			return account.User{}, err
		}
	} else if err != nil {
		return account.User{}, err
	} else {
		err = transaction.QueryRow(ctx, `
			UPDATE users
			SET email = $2, display_name = $3, avatar_url = $4, updated_at = now()
			WHERE id = $1
			RETURNING id, email, display_name, avatar_url, created_at, updated_at
		`, user.ID, identity.Email, identity.DisplayName, avatar).Scan(
			&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return account.User{}, err
		}
		_, err = transaction.Exec(ctx, `
			UPDATE social_identities
			SET email = $2, email_verified = $3, updated_at = now()
			WHERE provider = 'google' AND provider_subject = $1
		`, identity.Subject, identity.Email, identity.EmailVerified)
		if err != nil {
			return account.User{}, err
		}
	}

	if err := transaction.Commit(ctx); err != nil {
		return account.User{}, err
	}
	return user, nil
}

func (store *Store) CreateSession(
	ctx context.Context,
	userID string,
	tokenHash []byte,
	deviceName string,
	expiresAt time.Time,
) (account.Session, error) {
	var session account.Session
	err := store.pool.QueryRow(ctx, `
		INSERT INTO auth_sessions (user_id, token_hash, device_name, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, expires_at
	`, userID, tokenHash, deviceName, expiresAt).Scan(&session.ID, &session.UserID, &session.ExpiresAt)
	return session, err
}

func (store *Store) GetSessionUser(
	ctx context.Context,
	tokenHash []byte,
	now time.Time,
) (account.Session, account.User, error) {
	var session account.Session
	var user account.User
	err := store.pool.QueryRow(ctx, `
		UPDATE auth_sessions s
		SET last_used_at = $2
		FROM users u
		WHERE s.user_id = u.id
		  AND s.token_hash = $1
		  AND s.revoked_at IS NULL
		  AND s.expires_at > $2
		RETURNING s.id, s.user_id, s.expires_at,
		          u.id, u.email, u.display_name, u.avatar_url, u.created_at, u.updated_at
	`, tokenHash, now).Scan(
		&session.ID, &session.UserID, &session.ExpiresAt,
		&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.CreatedAt, &user.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return account.Session{}, account.User{}, account.ErrNotFound
	}
	return session, user, err
}

func (store *Store) RevokeSession(ctx context.Context, tokenHash []byte) error {
	_, err := store.pool.Exec(ctx, `
		UPDATE auth_sessions SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL
	`, tokenHash)
	return err
}

func (store *Store) CreateVehicle(
	ctx context.Context,
	userID string,
	vehicle account.Vehicle,
) (account.Vehicle, error) {
	err := store.pool.QueryRow(ctx, `
		INSERT INTO vehicles (
			user_id, display_name, manufacturer, model, model_year,
			battery_capacity_kwh, ac_charging_power_kw, dc_fast_charging_power_kw,
			charging_efficiency, connector_types
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING id, user_id, display_name, manufacturer, model, model_year,
		          battery_capacity_kwh, ac_charging_power_kw, dc_fast_charging_power_kw,
		          charging_efficiency, connector_types, created_at, updated_at
	`, userID, vehicle.DisplayName, vehicle.Manufacturer, vehicle.Model, vehicle.ModelYear,
		vehicle.BatteryCapacityKWh, vehicle.ACChargingPowerKW, vehicle.DCFastChargingPowerKW,
		vehicle.ChargingEfficiency, vehicle.ConnectorTypes).Scan(vehicleFields(&vehicle)...)
	return vehicle, err
}

func (store *Store) ListVehicles(ctx context.Context, userID string) ([]account.Vehicle, error) {
	rows, err := store.pool.Query(ctx, vehicleSelect+` WHERE user_id = $1 ORDER BY created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	vehicles := make([]account.Vehicle, 0)
	for rows.Next() {
		var vehicle account.Vehicle
		if err := rows.Scan(vehicleFields(&vehicle)...); err != nil {
			return nil, err
		}
		vehicles = append(vehicles, vehicle)
	}
	return vehicles, rows.Err()
}

func (store *Store) UpdateVehicle(
	ctx context.Context,
	userID string,
	vehicleID string,
	vehicle account.Vehicle,
) (account.Vehicle, error) {
	err := store.pool.QueryRow(ctx, `
		UPDATE vehicles SET
			display_name = $3, manufacturer = $4, model = $5, model_year = $6,
			battery_capacity_kwh = $7, ac_charging_power_kw = $8,
			dc_fast_charging_power_kw = $9, charging_efficiency = $10,
			connector_types = $11, updated_at = now()
		WHERE user_id = $1 AND id = $2
		RETURNING id, user_id, display_name, manufacturer, model, model_year,
		          battery_capacity_kwh, ac_charging_power_kw, dc_fast_charging_power_kw,
		          charging_efficiency, connector_types, created_at, updated_at
	`, userID, vehicleID, vehicle.DisplayName, vehicle.Manufacturer, vehicle.Model,
		vehicle.ModelYear, vehicle.BatteryCapacityKWh, vehicle.ACChargingPowerKW,
		vehicle.DCFastChargingPowerKW, vehicle.ChargingEfficiency, vehicle.ConnectorTypes).
		Scan(vehicleFields(&vehicle)...)
	return vehicle, mapNotFound(err)
}

func (store *Store) GetVehicle(ctx context.Context, userID, vehicleID string) (account.Vehicle, error) {
	var vehicle account.Vehicle
	err := store.pool.QueryRow(ctx, vehicleSelect+` WHERE user_id = $1 AND id = $2`, userID, vehicleID).
		Scan(vehicleFields(&vehicle)...)
	return vehicle, mapNotFound(err)
}

func (store *Store) DeleteVehicle(ctx context.Context, userID, vehicleID string) error {
	result, err := store.pool.Exec(ctx, `DELETE FROM vehicles WHERE user_id = $1 AND id = $2`, userID, vehicleID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return account.ErrNotFound
	}
	return nil
}

func (store *Store) CreateChargingRecord(
	ctx context.Context,
	userID string,
	record account.ChargingRecord,
) (account.ChargingRecord, error) {
	err := store.pool.QueryRow(ctx, `
		INSERT INTO charging_records (
			user_id, vehicle_id, started_at, ended_at, start_battery_percent,
			end_battery_percent, battery_energy_kwh, grid_energy_kwh,
			average_carbon_intensity, emissions_gco2
		)
		SELECT $1, v.id, $3,$4,$5,$6,$7,$8,$9,$10
		FROM vehicles v WHERE v.id = $2 AND v.user_id = $1
		RETURNING id, user_id, vehicle_id, started_at, ended_at,
		          start_battery_percent, end_battery_percent, battery_energy_kwh,
		          grid_energy_kwh, average_carbon_intensity, emissions_gco2,
		          created_at, updated_at
	`, userID, record.VehicleID, record.StartedAt, record.EndedAt,
		record.StartBatteryPercent, record.EndBatteryPercent, record.BatteryEnergyKWh,
		record.GridEnergyKWh, record.AverageCarbonIntensity, record.EmissionsGCO2).
		Scan(chargingRecordFields(&record)...)
	return record, mapNotFound(err)
}

func (store *Store) ListChargingRecords(
	ctx context.Context,
	userID string,
	vehicleID string,
	limit int,
) ([]account.ChargingRecord, error) {
	query := chargingRecordSelect + ` WHERE user_id = $1`
	arguments := []any{userID}
	if vehicleID != "" {
		query += ` AND vehicle_id = $2 ORDER BY started_at DESC LIMIT $3`
		arguments = append(arguments, vehicleID, limit)
	} else {
		query += ` ORDER BY started_at DESC LIMIT $2`
		arguments = append(arguments, limit)
	}
	rows, err := store.pool.Query(ctx, query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]account.ChargingRecord, 0)
	for rows.Next() {
		var record account.ChargingRecord
		if err := rows.Scan(chargingRecordFields(&record)...); err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (store *Store) GetChargingRecord(
	ctx context.Context,
	userID string,
	recordID string,
) (account.ChargingRecord, error) {
	var record account.ChargingRecord
	err := store.pool.QueryRow(ctx, chargingRecordSelect+` WHERE user_id = $1 AND id = $2`, userID, recordID).
		Scan(chargingRecordFields(&record)...)
	return record, mapNotFound(err)
}

func (store *Store) DeleteChargingRecord(ctx context.Context, userID, recordID string) error {
	result, err := store.pool.Exec(ctx, `DELETE FROM charging_records WHERE user_id = $1 AND id = $2`, userID, recordID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return account.ErrNotFound
	}
	return nil
}

const vehicleSelect = `
	SELECT id, user_id, display_name, manufacturer, model, model_year,
	       battery_capacity_kwh, ac_charging_power_kw, dc_fast_charging_power_kw,
	       charging_efficiency, connector_types, created_at, updated_at
	FROM vehicles`

const chargingRecordSelect = `
	SELECT id, user_id, vehicle_id, started_at, ended_at,
	       start_battery_percent, end_battery_percent, battery_energy_kwh,
	       grid_energy_kwh, average_carbon_intensity, emissions_gco2,
	       created_at, updated_at
	FROM charging_records`

func vehicleFields(vehicle *account.Vehicle) []any {
	return []any{
		&vehicle.ID, &vehicle.UserID, &vehicle.DisplayName, &vehicle.Manufacturer,
		&vehicle.Model, &vehicle.ModelYear, &vehicle.BatteryCapacityKWh,
		&vehicle.ACChargingPowerKW, &vehicle.DCFastChargingPowerKW,
		&vehicle.ChargingEfficiency, &vehicle.ConnectorTypes, &vehicle.CreatedAt, &vehicle.UpdatedAt,
	}
}

func chargingRecordFields(record *account.ChargingRecord) []any {
	return []any{
		&record.ID, &record.UserID, &record.VehicleID, &record.StartedAt, &record.EndedAt,
		&record.StartBatteryPercent, &record.EndBatteryPercent, &record.BatteryEnergyKWh,
		&record.GridEnergyKWh, &record.AverageCarbonIntensity, &record.EmissionsGCO2,
		&record.CreatedAt, &record.UpdatedAt,
	}
}

func mapNotFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return account.ErrNotFound
	}
	return err
}

func nullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

var _ account.Store = (*Store)(nil)
