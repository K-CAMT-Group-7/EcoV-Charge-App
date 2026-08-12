# EcoV Charge

[한국어](README.md) · [English](README.en.md) · [ไทย](README.th.md)

> A smart EV charging app that keeps charging convenient while helping reduce carbon emissions.

EcoV Charge helps reduce the carbon footprint of electric vehicle charging. By using grid carbon-intensity data, it helps drivers charge during cleaner periods while keeping the charging experience simple.

## Features

- **Simple charging flow**: View vehicle status, current battery level, and charge limit.
- **Grid carbon intensity**: See current grid carbon intensity and a six-hour forecast on a chart.
- **Location-aware data**: Use the device location to resolve the country and regional grid data.
- **Cleaner charging window**: Surface an available charging period with lower estimated emissions.
- **Multi-platform support**: Run the app on iOS, Android, and Web with Expo.

## How to use

1. Launch the app and grant location permission.
2. Review your location and grid carbon intensity on the home screen.
3. Tap `Start charging` to open the charging screen.
4. Review the charge limit and status, then start or stop charging.

If Electricity Maps is not configured, the app still renders using a local fallback forecast.

## Tech stack

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/) / React Native 0.81
- React 19.1 and React Compiler
- File-based routing and Typed Routes with Expo Router
- Bun 1.3 for package management and scripts
- Native TypeScript 7 compiler with TypeScript 5.9 compatibility checks
- Oxlint and Oxfmt powered by Oxc

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) 1.3 or later
- Node.js LTS
- Expo Go or a native development environment for mobile testing

### Install and run

```bash
bun install
bun run dev:clear
```

When the development server is running, press `i`, `a`, or `w` in the terminal to open iOS, Android, or Web.

You can also launch a platform directly:

```bash
bun run ios
bun run android
bun run web
```

### Environment variables

Copy the values from `example.env` into a `.env` file at the project root and configure your Electricity Maps API credentials.

```dotenv
EXPO_PUBLIC_ELECTRICITYMAPS_API_URL="https://api.electricitymaps.com/v4"
EXPO_PUBLIC_ELECTRICITYMAPS_API_KEY="YOUR_API_KEY_HERE"
```

To use a different web reverse-geocoding endpoint, optionally add:

```dotenv
EXPO_PUBLIC_LOCATION_GEOCODER_URL="https://your-api.example.com/reverse"
```

### Code quality checks

```bash
bun run lint
bun run format:check
bun run typecheck
bun run check
```

Check Expo compatibility with:

```bash
bunx expo-doctor
```

## Project structure

```text
.
├── assets/          # App icons and static images
├── src/
│   ├── app/         # Expo Router screens and layout
│   └── packages/    # Location and Electricity Maps API modules
├── app.json         # Expo configuration
├── example.env      # Environment variable example
├── package.json     # Scripts and dependencies
└── tsconfig.json    # TypeScript configuration
```

## Core value

**Plug in. Set your target. Charge cleaner.**

EcoV Charge reduces the need for complex decisions and manual adjustments, helping anyone charge an EV in a more sustainable way.
