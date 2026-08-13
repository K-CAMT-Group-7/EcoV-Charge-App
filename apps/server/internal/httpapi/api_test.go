package httpapi

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/charging"
)

type stubForecastProvider struct {
	forecast charging.Forecast
}

func (stub stubForecastProvider) Forecast(
	context.Context,
	float64,
	float64,
	int,
) (charging.Forecast, error) {
	return stub.forecast, nil
}

func TestHealthEndpoint(t *testing.T) {
	app := New(Dependencies{CarbonForecast: stubForecastProvider{}})
	request := httptest.NewRequest("GET", "/health", nil)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	if response.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}
}

func TestBacktestEndpointDefaultsToOneHundredRuns(t *testing.T) {
	start := time.Date(2026, time.August, 12, 10, 0, 0, 0, time.UTC)
	points := make([]charging.CarbonPoint, 300)
	for index := range points {
		points[index] = charging.CarbonPoint{
			Datetime:        start.Add(time.Duration(index) * 5 * time.Minute),
			CarbonIntensity: float64(300 + index%40),
		}
	}
	app := New(Dependencies{CarbonForecast: stubForecastProvider{forecast: charging.Forecast{
		Zone: "KR", Points: points,
	}}})
	request := httptest.NewRequest(
		"POST",
		"/v1/backtests",
		strings.NewReader(`{"location":{"latitude":37.5665,"longitude":126.978}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("backtest request failed: %v", err)
	}
	if response.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}
	var payload struct {
		Backtest charging.Backtest `json:"backtest"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Backtest.Summary.Runs != 100 {
		t.Fatalf("expected 100 runs, got %d", payload.Backtest.Summary.Runs)
	}
}
