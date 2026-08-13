package electricitymaps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/charging"
)

type HTTPClient interface {
	Do(request *http.Request) (*http.Response, error)
}

type Client struct {
	baseURL    string
	apiKey     string
	httpClient HTTPClient
}

type forecastResponse struct {
	Zone     string `json:"zone"`
	Forecast []struct {
		CarbonIntensity float64   `json:"carbonIntensity"`
		Datetime        time.Time `json:"datetime"`
	} `json:"forecast"`
}

func NewClient(baseURL, apiKey string, httpClient HTTPClient) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{
		baseURL:    strings.TrimRight(strings.TrimSuffix(baseURL, "/v4"), "/"),
		apiKey:     apiKey,
		httpClient: httpClient,
	}
}

func (c *Client) Forecast(
	ctx context.Context,
	latitude float64,
	longitude float64,
	horizonHours int,
) (charging.Forecast, error) {
	horizonHours = supportedHorizon(horizonHours)
	query := url.Values{
		"lat":                 {strconv.FormatFloat(latitude, 'f', -1, 64)},
		"lon":                 {strconv.FormatFloat(longitude, 'f', -1, 64)},
		"temporalGranularity": {"5_minutes"},
		"horizonHours":        {strconv.Itoa(horizonHours)},
	}
	endpoint := c.baseURL + "/v4/carbon-intensity/forecast?" + query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return charging.Forecast{}, fmt.Errorf("create Electricity Maps request: %w", err)
	}
	request.Header.Set("auth-token", c.apiKey)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return charging.Forecast{}, fmt.Errorf("request Electricity Maps forecast: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 4_096))
		return charging.Forecast{}, fmt.Errorf(
			"Electricity Maps returned %s: %s",
			response.Status,
			strings.TrimSpace(string(body)),
		)
	}

	var payload forecastResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return charging.Forecast{}, fmt.Errorf("decode Electricity Maps forecast: %w", err)
	}
	points := make([]charging.CarbonPoint, 0, len(payload.Forecast))
	for _, point := range payload.Forecast {
		if point.CarbonIntensity < 0 || point.Datetime.IsZero() {
			continue
		}
		points = append(points, charging.CarbonPoint{
			Datetime:        point.Datetime,
			CarbonIntensity: point.CarbonIntensity,
		})
	}
	if len(points) < 2 {
		return charging.Forecast{}, fmt.Errorf("Electricity Maps returned fewer than two valid points")
	}

	return charging.Forecast{Zone: payload.Zone, Points: points}, nil
}

func supportedHorizon(requested int) int {
	for _, supported := range []int{6, 24, 48, 72} {
		if requested <= supported {
			return supported
		}
	}
	return 72
}
