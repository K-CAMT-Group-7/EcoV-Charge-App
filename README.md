# EcoV Charge(K-CAMT 2026 해커톤 산출물)

[한국어](README.md) · [English](README.en.md) · [ไทย](README.th.md)

> 편리함은 그대로, 탄소 배출은 더 적게 만드는 스마트 전기차 충전 앱

EcoV Charge는 전력망의 탄소 집약도가 낮은 시간대를 골라 전기차를 충전하도록 돕는 크로스 플랫폼 앱입니다. 사용자가 차량, 목표 배터리 잔량(SOC), 완료 시각을 지정하면 서버가 Electricity Maps 예측과 차량 제원을 바탕으로 충전 계획을 만들고 주기적으로 다시 계산합니다.

> [!NOTE]
> 현재 충전 기능은 알고리즘과 사용자 경험을 검증하는 **시뮬레이션**입니다. 실제 차량이나 충전기를 직접 제어하지 않습니다.

## 주요 기능

- **Google 계정 로그인**: Web 및 iOS Google ID 토큰을 서버에서 검증하고 해시된 세션 토큰으로 인증합니다.
- **계정별 차량 관리**: Tesla 카탈로그에서 차량을 추가하고 배터리 용량, 충전 전력, 효율, 커넥터 정보를 PostgreSQL에 저장합니다.
- **위치 기반 탄소 정보**: 기기 위치에 맞는 현재 전력망 탄소 집약도와 향후 예측을 15분 간격 차트로 표시합니다.
- **스마트 충전 계획**: 목표 SOC와 완료 시각을 입력하면 5분 단위 예측 중 탄소 집약도가 낮은 슬롯을 우선 선택합니다.
- **능동형 재계획**: 서버가 5분 경계마다 남은 SOC와 최신 예측을 반영하고, 목표 달성에 필요한 시간이 부족하면 충전을 우선합니다.
- **충전 제어 모드**: 스마트 충전을 중지하거나, 최적화를 잠시 해제하는 `Force top up`을 켜고 다시 스마트 모드로 돌아갈 수 있습니다.
- **탄소 절감 효과 및 기록**: 즉시 충전 기준선과 최적화 계획의 예상 배출량을 비교하고, 완료된 세션의 에너지·SOC·탄소 절감량을 차량별로 조회합니다.
- **다중 플랫폼**: 하나의 Expo 코드베이스로 iOS, Android, Web을 지원합니다.

Electricity Maps 또는 위치 정보를 사용할 수 없을 때 홈 화면은 지역별 fallback 예측값을 표시합니다. 스마트 충전 세션 생성과 재계획에는 실행 중인 API 서버, 데이터베이스, Electricity Maps API 설정이 필요합니다.

## 이용 흐름

1. Google 계정으로 로그인하고 위치 권한을 허용합니다.
2. `My vehicles`에서 차량을 계정에 추가합니다.
3. 홈에서 차량과 지역 전력망의 탄소 집약도, 누적 충전 효과를 확인합니다.
4. `Start charging`에서 목표 SOC와 완료 시각을 선택하고 예상 탄소 절감량을 확인합니다.
5. 스마트 충전을 시작한 뒤 진행 상태를 확인하거나 중지/강제 충전 모드를 선택합니다.
6. `Charging record`에서 차량별 완료 세션과 에너지 사용량, 절감한 CO₂를 확인합니다.

## 동작 방식

서버는 차량의 배터리 용량, AC 충전 전력, 충전 효율과 현재/목표 SOC로 필요한 에너지를 계산합니다. 완료 시각까지의 5분 슬롯을 탄소 집약도 순으로 정렬해 필요한 수만큼 선택하며, 현재 슬롯의 선택 여부에 따라 최대 전력 또는 0kW를 적용한 것으로 시뮬레이션합니다. 활성 세션은 5분마다 이동 지평선 방식으로 재계획됩니다.

즉시 최대 전력으로 충전하는 기준선과 최적화 계획을 같은 조건에서 비교해 예상 절감량을 계산합니다. 각 제어 결과는 PostgreSQL에 저장되고, 완료 또는 중지된 세션은 충전 이력과 실제 시뮬레이션 결과로 집계됩니다. 알고리즘 상세는 [능동형 충전 알고리즘 문서](docs/active-charging-algorithm.md)를 참고하세요.

## 기술 구성

- **클라이언트**: Expo SDK 54, React Native 0.81, React 19.1, Expo Router 6, TypeScript
- **인증**: Google Sign-In / Google Identity Services, Bearer 세션, Expo SecureStore
- **서버**: Go 1.25, Fiber v3, 백그라운드 충전 스케줄러
- **데이터**: PostgreSQL 17, `pgx`, 임베디드 SQL 마이그레이션
- **외부 데이터**: Electricity Maps 탄소 집약도 예측, 기기 위치 및 reverse geocoding
- **도구**: Bun 1.3, Oxlint, Oxfmt, Bun Test, Go test
- **배포**: 멀티 스테이지/비루트 Docker 이미지, Docker Compose, GitHub Actions 기반 GHCR 빌드·배포

```mermaid
flowchart LR
    A["Expo 앱<br/>iOS · Android · Web"] -->|"Google ID token / Bearer session"| B["Go Fiber API"]
    B --> C[("PostgreSQL")]
    B --> D["Electricity Maps API"]
    B --> E["5분 충전 스케줄러"]
    E --> C
```

## 시작하기

### 요구 사항

- [Bun](https://bun.sh/) 1.3 이상 및 Node.js LTS
- Go 1.25 이상
- Docker 및 Docker Compose(PostgreSQL 실행용)
- iOS 네이티브 개발 환경 또는 Android 개발 환경
- Google OAuth Client ID와 Electricity Maps API 키

Google Sign-In은 네이티브 모듈을 사용하므로 iOS에서는 Expo Go가 아닌 개발 빌드가 필요합니다.

### 설치 및 환경 변수

```bash
bun install
cp example.env .env
```

`.env`의 placeholder를 실제 값으로 바꿉니다. 서버 비밀키는 `EXPO_PUBLIC_*` 변수에 넣지 마세요.

```dotenv
ELECTRICITYMAPS_API_URL="https://api.electricitymaps.com/v4"
ELECTRICITYMAPS_API_KEY="YOUR_API_KEY_HERE"
DATABASE_URL="postgres://ecov_charge:ecov_charge@localhost:5432/ecov_charge?sslmode=disable"
GOOGLE_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"

EXPO_PUBLIC_SERVER_API_URL="http://localhost:8080"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"
```

`GOOGLE_CLIENT_ID`와 `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`는 같은 Web Client ID를 사용합니다. iOS Client ID는 번들 ID `com.ecovcharge.app`용으로 별도 생성해야 합니다. 자세한 OAuth 설정과 전체 서버 변수는 [서버 README](apps/server/README.md)를 참고하세요.

Web의 reverse-geocoding endpoint를 변경하려면 `example.env`에 설명된 선택 변수 `EXPO_PUBLIC_LOCATION_GEOCODER_URL`을 설정합니다.

### 로컬 실행

각 명령은 별도 터미널에서 실행합니다.

```bash
bun run db:up
bun run server:dev
bun run dev:clear
```

Expo 터미널에서 플랫폼을 선택하거나 직접 실행할 수 있습니다.

```bash
bun run ios
bun run android
bun run web
```

### Docker로 서버 실행

`compose.server.example.yaml`은 API와 PostgreSQL을 함께 실행하는 배포 예시입니다.

```bash
docker compose -f compose.server.example.yaml up --build
```

`main` 브랜치와 `v*` 태그의 백엔드 변경은 GitHub Actions에서 이미지를 빌드해 GitHub Container Registry에 게시합니다. Pull Request에서는 푸시 없이 빌드만 검증합니다.

### 검사

```bash
bun run check
bun run test
bun run server:check
bunx expo-doctor
```

## 프로젝트 구조

```text
.
├── apps/server/       # Go Fiber API, 스케줄러, DB 마이그레이션, Dockerfile
├── assets/            # 앱 아이콘, 브랜드 및 차량 이미지
├── docs/              # 능동형 충전 알고리즘 설명
├── scripts/           # 로컬 및 글로벌 충전 백테스트
├── src/
│   ├── app/           # 로그인, 홈, 차량, 충전, 충전 기록 화면
│   └── packages/      # 인증, 서버 API, 위치, 차량, 충전 모듈
├── compose.yaml       # 로컬 PostgreSQL
├── compose.server.example.yaml # API + PostgreSQL 실행 예시
├── example.env        # 클라이언트/서버 환경 변수 예시
└── package.json       # 앱, 검사, 서버 및 DB 스크립트
```

## 핵심 가치

**Plug in. Set your target. Charge cleaner.**

EcoV Charge는 사용자가 복잡한 전력망 정보를 직접 해석하지 않아도 완료 목표를 지키면서 더 지속 가능한 충전 시간을 선택할 수 있도록 돕습니다.
