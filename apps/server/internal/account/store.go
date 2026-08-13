package account

import (
	"context"
	"errors"
	"time"
)

var ErrNotFound = errors.New("resource not found")

type Store interface {
	UpsertGoogleUser(ctx context.Context, identity GoogleIdentity) (User, error)
	CreateSession(ctx context.Context, userID string, tokenHash []byte, deviceName string, expiresAt time.Time) (Session, error)
	GetSessionUser(ctx context.Context, tokenHash []byte, now time.Time) (Session, User, error)
	RevokeSession(ctx context.Context, tokenHash []byte) error

	CreateVehicle(ctx context.Context, userID string, vehicle Vehicle) (Vehicle, error)
	UpdateVehicle(ctx context.Context, userID, vehicleID string, vehicle Vehicle) (Vehicle, error)
	ListVehicles(ctx context.Context, userID string) ([]Vehicle, error)
	GetVehicle(ctx context.Context, userID, vehicleID string) (Vehicle, error)
	DeleteVehicle(ctx context.Context, userID, vehicleID string) error

	CreateChargingRecord(ctx context.Context, userID string, record ChargingRecord) (ChargingRecord, error)
	ListChargingRecords(ctx context.Context, userID, vehicleID string, limit int) ([]ChargingRecord, error)
	GetChargingRecord(ctx context.Context, userID, recordID string) (ChargingRecord, error)
	DeleteChargingRecord(ctx context.Context, userID, recordID string) error
}
