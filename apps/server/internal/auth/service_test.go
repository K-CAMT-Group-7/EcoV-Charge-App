package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"testing"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
)

type fakeGoogleVerifier struct {
	identity account.GoogleIdentity
}

func (verifier fakeGoogleVerifier) Verify(context.Context, string) (account.GoogleIdentity, error) {
	return verifier.identity, nil
}

type fakeStore struct {
	user              account.User
	createdTokenHash  []byte
	createdExpiration time.Time
	revokedTokenHash  []byte
}

func (store *fakeStore) UpsertGoogleUser(context.Context, account.GoogleIdentity) (account.User, error) {
	return store.user, nil
}

func (store *fakeStore) CreateSession(
	_ context.Context,
	userID string,
	tokenHash []byte,
	_ string,
	expiresAt time.Time,
) (account.Session, error) {
	store.createdTokenHash = append([]byte(nil), tokenHash...)
	store.createdExpiration = expiresAt
	return account.Session{ID: "session-1", UserID: userID, ExpiresAt: expiresAt}, nil
}

func (store *fakeStore) GetSessionUser(
	_ context.Context,
	tokenHash []byte,
	_ time.Time,
) (account.Session, account.User, error) {
	if string(tokenHash) != string(store.createdTokenHash) {
		return account.Session{}, account.User{}, account.ErrNotFound
	}
	return account.Session{ID: "session-1", UserID: store.user.ID}, store.user, nil
}

func (store *fakeStore) RevokeSession(_ context.Context, tokenHash []byte) error {
	store.revokedTokenHash = append([]byte(nil), tokenHash...)
	return nil
}

func (*fakeStore) CreateVehicle(context.Context, string, account.Vehicle) (account.Vehicle, error) {
	panic("not used")
}
func (*fakeStore) ListVehicles(context.Context, string) ([]account.Vehicle, error) {
	panic("not used")
}
func (*fakeStore) UpdateVehicle(context.Context, string, string, account.Vehicle) (account.Vehicle, error) {
	panic("not used")
}
func (*fakeStore) GetVehicle(context.Context, string, string) (account.Vehicle, error) {
	panic("not used")
}
func (*fakeStore) DeleteVehicle(context.Context, string, string) error { panic("not used") }
func (*fakeStore) CreateChargingRecord(context.Context, string, account.ChargingRecord) (account.ChargingRecord, error) {
	panic("not used")
}
func (*fakeStore) ListChargingRecords(context.Context, string, string, int) ([]account.ChargingRecord, error) {
	panic("not used")
}
func (*fakeStore) GetChargingRecord(context.Context, string, string) (account.ChargingRecord, error) {
	panic("not used")
}
func (*fakeStore) DeleteChargingRecord(context.Context, string, string) error { panic("not used") }

func TestGoogleLoginCreatesHashedServerSession(t *testing.T) {
	fixedNow := time.Date(2026, time.August, 12, 12, 0, 0, 0, time.UTC)
	store := &fakeStore{user: account.User{ID: "user-1", Email: "driver@example.com"}}
	service := NewService(store, fakeGoogleVerifier{identity: account.GoogleIdentity{
		Subject: "google-subject", Email: "driver@example.com", EmailVerified: true,
	}}, 30*24*time.Hour)
	service.now = func() time.Time { return fixedNow }

	result, err := service.LoginWithGoogle(context.Background(), "signed-id-token", "test-device")
	if err != nil {
		t.Fatalf("LoginWithGoogle returned an error: %v", err)
	}
	if result.Token == "" {
		t.Fatal("expected an opaque session token")
	}
	expectedHash := sha256.Sum256([]byte(result.Token))
	if string(store.createdTokenHash) != string(expectedHash[:]) {
		t.Fatal("store did not receive the SHA-256 session token hash")
	}
	if string(store.createdTokenHash) == result.Token {
		t.Fatal("raw token must not be stored")
	}
	if !result.ExpiresAt.Equal(fixedNow.Add(30 * 24 * time.Hour)) {
		t.Fatalf("unexpected expiration: %s", result.ExpiresAt)
	}

	_, user, err := service.Authenticate(context.Background(), result.Token)
	if err != nil || user.ID != "user-1" {
		t.Fatalf("Authenticate failed: user=%+v err=%v", user, err)
	}
	if err := service.Logout(context.Background(), result.Token); err != nil {
		t.Fatalf("Logout failed: %v", err)
	}
	if string(store.revokedTokenHash) != string(expectedHash[:]) {
		t.Fatal("logout did not revoke the hashed token")
	}
}

func TestGoogleLoginRejectsEmptyToken(t *testing.T) {
	service := NewService(&fakeStore{}, fakeGoogleVerifier{}, time.Hour)
	_, err := service.LoginWithGoogle(context.Background(), "", "")
	if err == nil || errors.Is(err, account.ErrNotFound) {
		t.Fatalf("expected an input validation error, got %v", err)
	}
}
