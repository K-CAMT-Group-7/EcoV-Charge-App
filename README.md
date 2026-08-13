# EcoV Charge

[한국어](README.md) · [English](README.en.md) · [ไทย](README.th.md)

> 편리함은 그대로, 탄소 배출은 더 적게 만드는 스마트 전기차 충전 앱

EcoV Charge는 전기차 충전으로 발생하는 탄소 발자국을 줄이기 위한 스마트 충전 앱입니다.
운전자가 차량을 연결하고 목표 충전량과 충전 완료 시간을 설정하면, 전력망의 탄소 집약도가 낮은 시간대를 우선 활용해 더 깨끗한 충전을 돕습니다.

## 주요 기능

- **간단한 충전 화면**: 차량 상태, 현재 배터리 잔량, 충전 한도를 확인할 수 있습니다.
- **탄소 집약도 확인**: 현재 전력망의 탄소 집약도와 향후 6시간 예측을 차트로 보여줍니다.
- **현재 위치 기반 데이터**: 기기 위치를 사용해 국가와 지역 전력망 정보를 확인합니다.
- **저탄소 충전 시간 안내**: 탄소 배출량이 낮은 충전 가능 시간대를 안내합니다.
- **다중 플랫폼 지원**: iOS, Android, Web에서 Expo로 실행할 수 있습니다.

## 이용 방법

1. 앱을 실행하고 위치 권한을 허용합니다.
2. 홈 화면에서 현재 위치와 전력망 탄소 집약도를 확인합니다.
3. `Start charging`을 눌러 충전 화면으로 이동합니다.
4. 충전 상태와 목표 충전 한도를 확인한 뒤 충전을 시작하거나 중지합니다.

Electricity Maps API가 설정되지 않은 경우에도 앱은 지역별 fallback 예측값으로 화면을 표시합니다.

## 기술 스택

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/) / React Native 0.81
- React 19.1 및 React Compiler
- Expo Router 기반 파일 시스템 라우팅 및 Typed Routes
- Bun 1.3 패키지 관리 및 스크립트 실행
- TypeScript 7 네이티브 컴파일러와 TypeScript 5.9 호환 검사
- Oxc 기반 Oxlint 및 Oxfmt

## 시작하기

### 요구 사항

- [Bun](https://bun.sh/) 1.3 이상
- Node.js LTS
- 모바일 실행 시 Expo Go 또는 네이티브 개발 환경

### 설치 및 실행

```bash
bun install
bun run dev:clear
```

개발 서버가 실행되면 터미널에서 `i`, `a`, `w`를 눌러 각각 iOS, Android, Web을 열 수 있습니다.

플랫폼별 실행 명령은 다음과 같습니다.

```bash
bun run ios
bun run android
bun run web
```

### 환경 변수

`example.env`를 참고해 프로젝트 루트에 `.env` 파일을 만들고 Electricity Maps API 정보를 설정합니다.

```dotenv
EXPO_PUBLIC_ELECTRICITYMAPS_API_URL="https://api.electricitymaps.com/v4"
EXPO_PUBLIC_ELECTRICITYMAPS_API_KEY="YOUR_API_KEY_HERE"
```

웹에서 사용할 reverse geocoding endpoint를 바꾸려면 다음 변수를 선택적으로 추가할 수 있습니다.

```dotenv
EXPO_PUBLIC_LOCATION_GEOCODER_URL="https://your-api.example.com/reverse"
```

### 코드 품질 검사

```bash
bun run lint
bun run format:check
bun run typecheck
bun run check
```

Expo 호환성 확인:

```bash
bunx expo-doctor
```

## 프로젝트 구조

```text
.
├── apps/
│   └── server/     # Go Fiber 충전 제어 API
├── assets/          # 앱 아이콘 및 정적 이미지
├── src/
│   ├── app/         # Expo Router 화면과 레이아웃
│   └── packages/    # 차량 데이터, 위치 및 Electricity Maps API 모듈
├── app.json         # Expo 앱 설정
├── example.env      # 환경 변수 예시
├── package.json     # 스크립트 및 의존성
└── tsconfig.json    # TypeScript 설정
```

### Go Fiber 서버

운영 환경에서는 Electricity Maps API 키와 충전 계획 계산을 Go Fiber 서버가 담당한다. 저장소 루트의 Expo 앱과 `apps/server` Go 모듈을 함께 관리하는 모노레포 구조다.

```bash
bun run server:dev
```

Google 로그인은 네이티브 모듈을 사용하므로 iOS에서는 Expo Go 대신 개발 빌드를 실행한다.

```bash
bun run ios
```

현재 제공하는 서버 API는 Google 로그인, 사용자 세션, PostgreSQL 기반 차량·충전 이력 관리, 탄소 집약도 예측 프록시, 저탄소 충전 계획 생성, 100건 백테스트다. 자세한 요청 형식은 [서버 README](apps/server/README.md)를 참고한다.

### 차량 및 충전 데이터 저장소

`VehicleChargingStore`는 차량 메타데이터와 충전 이력을 앱 문서 디렉터리의 JSON 파일에 영구 저장하고 조회하는 클래스입니다. 앱 시작 시 저장된 데이터를 복원하며, 저장/삭제 작업은 파일에 즉시 반영됩니다.

```ts
import { vehicleChargingStore } from '@/packages/vehicles';

await vehicleChargingStore.ready;
const vehicle = vehicleChargingStore.getVehicle('tesla-model-y-long-range');
const latestCharge = vehicleChargingStore.getLatestChargingRecord('tesla-model-y-long-range');
const recentCharges = vehicleChargingStore.listChargingRecords({
  startedFrom: '2026-08-01T00:00:00.000Z',
});
```

## 핵심 가치

**Plug in. Set your target. Charge cleaner.**

EcoV Charge는 복잡한 판단과 수동 조작을 줄여 누구나 더 지속 가능한 방식으로 전기차를 충전할 수 있도록 돕습니다.
