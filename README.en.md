# EcoV Charge

[한국어](README.md) · [English](README.en.md) · [ไทย](README.th.md)

> Smart EV charging that keeps the convenience while cutting carbon emissions.

EcoV Charge is a cross-platform app that helps schedule EV charging during periods of lower grid carbon intensity. After a user selects a vehicle, target state of charge (SOC), and completion time, the server builds and continuously revises a plan using Electricity Maps forecasts and the vehicle's specifications.

> [!NOTE]
> Charging is currently a **simulation** for validating the algorithm and user experience. It does not directly control a real vehicle or charger.

## Features

- **Google account sign-in**: The server verifies Google ID tokens from Web and iOS and authenticates requests with hashed session tokens.
- **Account-scoped vehicles**: Add a vehicle from the Tesla catalog and store its battery, charging power, efficiency, and connector specifications in PostgreSQL.
- **Location-aware carbon data**: Display current and forecast grid carbon intensity for the device's location in 15-minute intervals.
- **Smart charging plans**: Given a target SOC and completion time, prioritize the five-minute forecast slots with the lowest carbon intensity.
- **Active replanning**: Recalculate at every five-minute boundary using the remaining SOC and latest forecast, while prioritizing the deadline when time becomes constrained.
- **Charging controls**: Stop smart charging, enable `Force top up` to bypass optimization, or return to smart mode.
- **Impact and history**: Compare estimated emissions against an immediate-charging baseline, then review energy, SOC, and CO₂ savings for completed sessions by vehicle.
- **Cross-platform app**: Share one Expo codebase across iOS, Android, and Web.

If Electricity Maps or location data is unavailable, the home screen uses a regional fallback forecast. Creating and replanning smart-charging sessions requires a running API server, database, and configured Electricity Maps API.

## User flow

1. Sign in with Google and grant location access.
2. Add a vehicle to the account from `My vehicles`.
3. On Home, select a vehicle and review local grid carbon intensity and cumulative impact.
4. In `Start charging`, choose a target SOC and completion time and review the estimated CO₂ savings.
5. Start smart charging, monitor its progress, or stop it/enable forced charging.
6. Open `Charging record` to review completed sessions, energy use, and CO₂ savings per vehicle.

## How it works

The server derives required energy from battery capacity, AC charging power, charging efficiency, and current/target SOC. It sorts the five-minute slots before the deadline by carbon intensity and selects as many as are needed. The simulation applies maximum power when the current slot is selected and 0 kW otherwise. Active sessions are replanned every five minutes using a receding horizon.

Estimated savings compare the optimized plan with an immediate, maximum-power baseline under the same conditions. Every control result is stored in PostgreSQL; completed or stopped sessions are aggregated into charging history and realized simulation results. See [Active charging algorithm](docs/active-charging-algorithm.md) for the detailed model.

## Technical architecture

- **Client**: Expo SDK 54, React Native 0.81, React 19.1, Expo Router 6, TypeScript
- **Authentication**: Google Sign-In / Google Identity Services, bearer sessions, Expo SecureStore
- **Server**: Go 1.25, Fiber v3, background charging scheduler
- **Data**: PostgreSQL 17, `pgx`, embedded SQL migrations
- **External data**: Electricity Maps carbon forecasts, device location, and reverse geocoding
- **Tooling**: Bun 1.3, Oxlint, Oxfmt, Bun Test, Go test
- **Delivery**: Multi-stage non-root Docker image, Docker Compose, GitHub Actions builds and publishing to GHCR

```mermaid
flowchart LR
    A["Expo app<br/>iOS · Android · Web"] -->|"Google ID token / bearer session"| B["Go Fiber API"]
    B --> C[("PostgreSQL")]
    B --> D["Electricity Maps API"]
    B --> E["5-minute scheduler"]
    E --> C
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) 1.3 or later and Node.js LTS
- Go 1.25 or later
- Docker and Docker Compose for PostgreSQL
- An iOS native or Android development environment
- Google OAuth client IDs and an Electricity Maps API key

Google Sign-In uses a native module, so iOS requires a development build instead of Expo Go.

### Install and configure

```bash
bun install
cp example.env .env
```

Replace the placeholders in `.env`. Never put server secrets in `EXPO_PUBLIC_*` variables.

```dotenv
ELECTRICITYMAPS_API_URL="https://api.electricitymaps.com/v4"
ELECTRICITYMAPS_API_KEY="YOUR_API_KEY_HERE"
DATABASE_URL="postgres://ecov_charge:ecov_charge@localhost:5432/ecov_charge?sslmode=disable"
GOOGLE_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"

EXPO_PUBLIC_SERVER_API_URL="http://localhost:8080"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"
```

`GOOGLE_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` use the same Web client ID. Create a separate iOS client ID for bundle ID `com.ecovcharge.app`. See the [server README](apps/server/README.md) for the full OAuth setup and server variables.

To override the reverse-geocoding endpoint used on Web, set the optional `EXPO_PUBLIC_LOCATION_GEOCODER_URL` variable shown in `example.env`.

### Run locally

Run each command in a separate terminal:

```bash
bun run db:up
bun run server:dev
bun run dev:clear
```

Choose a platform from the Expo terminal or launch it directly:

```bash
bun run ios
bun run android
bun run web
```

### Run the server with Docker

`compose.server.example.yaml` is a deployment example that runs the API and PostgreSQL together.

```bash
docker compose -f compose.server.example.yaml up --build
```

Backend changes on `main` and `v*` tags are built and published to GitHub Container Registry by GitHub Actions. Pull requests build the image without publishing it.

### Checks

```bash
bun run check
bun run test
bun run server:check
bunx expo-doctor
```

## Project structure

```text
.
├── apps/server/       # Go Fiber API, scheduler, DB migrations, Dockerfile
├── assets/            # App, brand, and vehicle images
├── docs/              # Active charging algorithm documentation
├── scripts/           # Local and global charging backtests
├── src/
│   ├── app/           # Login, home, vehicle, charging, and history screens
│   └── packages/      # Auth, server API, location, vehicle, and charging modules
├── compose.yaml       # Local PostgreSQL
├── compose.server.example.yaml # API + PostgreSQL example
├── example.env        # Client and server environment variable example
└── package.json       # App, checks, server, and database scripts
```

## Core value

**Plug in. Set your target. Charge cleaner.**

EcoV Charge helps users meet their charging deadline and choose more sustainable periods without having to interpret complex grid data themselves.
