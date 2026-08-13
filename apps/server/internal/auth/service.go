package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
)

type GoogleVerifier interface {
	Verify(ctx context.Context, rawIDToken string) (account.GoogleIdentity, error)
}

type Service struct {
	store      account.Store
	google     GoogleVerifier
	sessionTTL time.Duration
	now        func() time.Time
}

type LoginResult struct {
	Token     string       `json:"token"`
	ExpiresAt time.Time    `json:"expiresAt"`
	User      account.User `json:"user"`
}

func NewService(store account.Store, google GoogleVerifier, sessionTTL time.Duration) *Service {
	return &Service{store: store, google: google, sessionTTL: sessionTTL, now: time.Now}
}

func (service *Service) LoginWithGoogle(
	ctx context.Context,
	idToken string,
	deviceName string,
) (LoginResult, error) {
	if strings.TrimSpace(idToken) == "" {
		return LoginResult{}, fmt.Errorf("Google ID token is required")
	}
	identity, err := service.google.Verify(ctx, idToken)
	if err != nil {
		return LoginResult{}, fmt.Errorf("verify Google identity: %w", err)
	}
	user, err := service.store.UpsertGoogleUser(ctx, identity)
	if err != nil {
		return LoginResult{}, fmt.Errorf("save Google account: %w", err)
	}

	token, tokenHash, err := newSessionToken()
	if err != nil {
		return LoginResult{}, err
	}
	expiresAt := service.now().UTC().Add(service.sessionTTL)
	if _, err := service.store.CreateSession(ctx, user.ID, tokenHash, deviceName, expiresAt); err != nil {
		return LoginResult{}, fmt.Errorf("create session: %w", err)
	}
	return LoginResult{Token: token, ExpiresAt: expiresAt, User: user}, nil
}

func (service *Service) Authenticate(ctx context.Context, token string) (account.Session, account.User, error) {
	if strings.TrimSpace(token) == "" {
		return account.Session{}, account.User{}, fmt.Errorf("session token is required")
	}
	hash := sha256.Sum256([]byte(token))
	return service.store.GetSessionUser(ctx, hash[:], service.now().UTC())
}

func (service *Service) Logout(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	return service.store.RevokeSession(ctx, hash[:])
}

func newSessionToken() (string, []byte, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], nil
}
