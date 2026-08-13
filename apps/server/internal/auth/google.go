package auth

import (
	"context"
	"fmt"
	"strings"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
	"google.golang.org/api/idtoken"
)

type GoogleIDTokenVerifier struct {
	clientID string
}

func NewGoogleIDTokenVerifier(clientID string) *GoogleIDTokenVerifier {
	return &GoogleIDTokenVerifier{clientID: clientID}
}

func (verifier *GoogleIDTokenVerifier) Verify(
	ctx context.Context,
	rawIDToken string,
) (account.GoogleIdentity, error) {
	payload, err := idtoken.Validate(ctx, rawIDToken, verifier.clientID)
	if err != nil {
		return account.GoogleIdentity{}, fmt.Errorf("invalid Google ID token: %w", err)
	}
	subject := strings.TrimSpace(payload.Subject)
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	picture, _ := payload.Claims["picture"].(string)
	emailVerified, _ := payload.Claims["email_verified"].(bool)
	if subject == "" || strings.TrimSpace(email) == "" {
		return account.GoogleIdentity{}, fmt.Errorf("Google ID token is missing subject or email")
	}
	return account.GoogleIdentity{
		Subject:       subject,
		Email:         strings.TrimSpace(email),
		EmailVerified: emailVerified,
		DisplayName:   strings.TrimSpace(name),
		AvatarURL:     strings.TrimSpace(picture),
	}, nil
}
