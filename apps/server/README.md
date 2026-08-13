# EcoV Charge API

Go Fiber 서버는 Electricity Maps API 키를 보호하고 충전 계획과 백테스트를 실행한다.

## 실행

저장소 루트의 `.env`에 서버 전용 환경변수를 설정한다.

```dotenv
ELECTRICITYMAPS_API_URL="https://api.electricitymaps.com/v4"
ELECTRICITYMAPS_API_KEY="YOUR_API_KEY_HERE"
DATABASE_URL="postgres://ecov_charge:ecov_charge@localhost:5432/ecov_charge?sslmode=disable"
GOOGLE_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
SESSION_TTL_DAYS="30"
SERVER_ADDRESS=":8080"
CORS_ALLOWED_ORIGINS="http://localhost:8081,http://localhost:19006"
```

기존 개발용 `.env`의 `EXPO_PUBLIC_ELECTRICITYMAPS_*` 값도 임시 호환되지만, 운영 환경에서는 비공개 서버 변수로 옮겨야 한다.

```bash
bun run db:up
bun run server:dev
```

서버 시작 시 `migrations` 디렉터리의 아직 적용되지 않은 SQL을 자동 실행한다.

## Web 및 iOS Google 로그인

저장소 루트 `.env`에는 Google Cloud에서 만든 Web 및 iOS OAuth Client ID가 필요하다.

```dotenv
GOOGLE_CLIENT_ID="WEB_CLIENT_ID.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="WEB_CLIENT_ID.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="IOS_CLIENT_ID.apps.googleusercontent.com"
EXPO_PUBLIC_SERVER_API_URL="http://localhost:8080"
```

`GOOGLE_CLIENT_ID`와 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`에는 동일한 **웹 애플리케이션**
Client ID를 넣는다. `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`에는 번들 ID
`com.ecovcharge.app`으로 만든 별도의 **iOS** Client ID를 넣어야 한다. 세 값에 모두
Web Client ID를 넣으면 Google이 `Custom scheme URIs are not allowed for 'WEB' client type`
오류로 로그인을 차단한다. Client Secret은 앱 환경변수에 넣지 않는다.

웹 로그인을 사용하려면 Google Cloud Console의 Web Client ID에 실제 웹 주소를
**승인된 자바스크립트 원본**으로 등록한다. 로컬 기본값은 `http://localhost:8081`이며,
프로토콜, 호스트, 포트가 모두 일치해야 한다. 웹 클라이언트는 Google Identity Services가
발급한 ID 토큰을 동일한 서버 로그인 API로 교환한다.

`app.config.ts`는 iOS Client ID에서 Google URL Scheme을 생성한다. Google Sign-In은 네이티브 모듈이므로 Expo Go가 아니라 iOS 개발 빌드로 실행한다.

```bash
bun run ios
bun run web
```

## API

### Google 로그인

앱은 Google Sign-In SDK로 받은 ID 토큰을 서버에 보낸다. 사용자 ID나 이메일만 보내는 방식은 허용하지 않는다.

```http
POST /v1/auth/google
Content-Type: application/json

{
  "idToken": "GOOGLE_SIGNED_ID_TOKEN",
  "deviceName": "Seonwoo's iPhone"
}
```

서버는 Google 서명, issuer, audience, 만료를 검증하고 사용자 계정을 생성하거나 갱신한다. 응답의 세션 토큰은 이후 요청의 `Authorization: Bearer <token>` 헤더에 사용한다. 원본 세션 토큰은 DB에 저장하지 않고 SHA-256 해시만 저장한다.

```http
GET  /v1/me
POST /v1/auth/logout
```

### 차량

모든 차량은 인증된 사용자 계정에 귀속된다.

```http
GET    /v1/vehicles
POST   /v1/vehicles
GET    /v1/vehicles/:vehicleId
PUT    /v1/vehicles/:vehicleId
DELETE /v1/vehicles/:vehicleId
```

### 충전 이력

충전 이력은 사용자와 차량을 함께 참조한다. 서버는 해당 차량의 소유자만 이력을 생성하거나 조회할 수 있도록 확인한다.

```http
GET    /v1/charging-records?vehicleId=:vehicleId&limit=50
POST   /v1/charging-records
GET    /v1/charging-records/:recordId
DELETE /v1/charging-records/:recordId
```

### 능동형 충전 시뮬레이션

클라이언트는 차량, 현재/목표 SOC, 완료 목표 시각, 현재 위치를 세션으로 등록한다. 서버는 즉시 한 번 실행한 뒤 5분 경계마다 탄소 예측과 남은 SOC를 반영해 계획을 다시 만들며, 실제 충전기는 제어하지 않는다. 각 제어 결과는 `charging_session_ticks`에 기록되고 목표 도달 시 집계된 결과가 `charging_records`에도 저장된다.

```http
POST /v1/charging-sessions
GET  /v1/charging-sessions/active?vehicleId=:vehicleId
POST /v1/charging-sessions/:sessionId/stop
```

### 상태 확인

```http
GET /health
```

### 탄소 집약도 예측

```http
GET /v1/carbon/forecast?lat=37.5665&lon=126.978&horizonHours=6
```

### 충전 계획 생성

```http
POST /v1/charging/plans
Content-Type: application/json

{
  "location": {
    "latitude": 37.5665,
    "longitude": 126.978
  },
  "deadline": "2026-08-12T18:00:00Z",
  "currentEnergyKwh": 31.88,
  "targetEnergyKwh": 55.79,
  "vehicle": {
    "batteryCapacityKwh": 79.7,
    "maxChargePowerKw": 11,
    "chargingEfficiency": 0.92
  }
}
```

응답의 `plan.currentPowerKw`가 현재 5분 구간에 적용할 충전 전력이다. `plan.slots`에는 종료시간까지 선택된 충전 구간이 시간순으로 들어간다.

### 백테스트

```http
POST /v1/backtests
Content-Type: application/json

{
  "location": {
    "latitude": 37.5665,
    "longitude": 126.978
  },
  "runs": 100,
  "seed": 20260812
}
```

차량 제원을 생략하면 Model Y 프로토타입 값인 배터리 79.7kWh, AC 11kW, 효율 92%를 사용한다.

## 검사

```bash
bun run server:test
bun run server:check
```

로컬 DB를 멈추려면 다음을 실행한다. 볼륨은 유지되므로 데이터는 삭제되지 않는다.

```bash
bun run db:stop
```
