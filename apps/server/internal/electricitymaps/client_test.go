package electricitymaps

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(request *http.Request) (*http.Response, error)

func (function roundTripFunc) Do(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestForecastUsesFiveMinuteAPIAndAuthToken(t *testing.T) {
	httpClient := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Header.Get("auth-token") != "test-key" {
			t.Errorf("missing auth-token header")
		}
		if request.URL.Query().Get("temporalGranularity") != "5_minutes" {
			t.Errorf("expected five-minute granularity")
		}
		if request.URL.Query().Get("horizonHours") != "6" {
			t.Errorf("expected six-hour horizon")
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body: io.NopCloser(strings.NewReader(`{
          "zone":"KR",
          "forecast":[
            {"carbonIntensity":480,"datetime":"2026-08-12T10:00:00Z"},
            {"carbonIntensity":470,"datetime":"2026-08-12T10:05:00Z"}
          ]
        }`)),
		}, nil
	})

	client := NewClient("https://api.example.test/v4", "test-key", httpClient)
	forecast, err := client.Forecast(context.Background(), 37.5665, 126.978, 1)
	if err != nil {
		t.Fatalf("Forecast returned an error: %v", err)
	}
	if forecast.Zone != "KR" || len(forecast.Points) != 2 {
		t.Fatalf("unexpected forecast: %+v", forecast)
	}
}
