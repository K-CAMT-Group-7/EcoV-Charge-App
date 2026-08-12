# EcoV Charge

> 편리함은 그대로, 탄소 배출은 더 적게 만드는 스마트 전기차 충전 앱

EcoV Charge는 전기차 충전으로 발생하는 탄소 발자국을 줄이기 위한 스마트 충전 앱입니다.
운전자가 차량을 연결하고 **목표 충전량**과 **충전 완료 시간**을 설정하면, 전력망의 탄소 집약도가 낮은 시간대를 우선 활용해 충전을 자동으로 진행합니다.

요청한 시간까지 필요한 충전량을 확보하면서도 더 친환경적인 시간에 전력을 사용하므로, 사용자는 편의성을 포기하지 않고 간편하게 저탄소 충전을 실천할 수 있습니다.

## 주요 기능

- **간단한 충전 설정**: 목표 충전량과 원하는 완료 시간만 입력하면 됩니다.
- **저탄소 시간대 우선 충전**: 전력망의 탄소 집약도가 낮은 시간대를 우선해 충전합니다.
- **자동 충전 스케줄링**: 설정한 조건에 맞춰 최적의 충전 일정을 자동으로 계획합니다.
- **완료 시간 보장**: 친환경 충전을 우선하면서도 차량이 요청한 시간에 준비되도록 관리합니다.
- **편의성과 지속 가능성의 균형**: 일상적인 충전 경험을 바꾸지 않고 탄소 배출을 줄일 수 있습니다.

## 이용 방법

1. 전기차를 충전기에 연결합니다.
2. 원하는 목표 충전량을 설정합니다.
3. 충전이 완료되어야 하는 시간을 선택합니다.
4. EcoV Charge가 전력망의 탄소 집약도를 고려해 충전 시간을 자동으로 조정합니다.
5. 설정한 시간에 충전된 차량을 이용합니다.

## 핵심 가치

**Plug in. Set your target. Charge cleaner.**

EcoV Charge는 복잡한 판단과 수동 조작 없이도 누구나 더 지속 가능한 방식으로 전기차를 충전할 수 있도록 돕습니다.

## 기술 스택

- [Expo SDK 54](https://docs.expo.dev/versions/v54.0.0/) / React Native 0.81
- React 19.1과 React Compiler
- Expo Router의 파일 기반 라우팅 및 Typed Routes
- Bun 1.3 패키지 관리 및 스크립트 실행
- TypeScript 7 네이티브 컴파일러
- Oxc 기반 Oxlint 및 Oxfmt

> TypeScript 7은 아직 안정적인 프로그래밍 API를 제공하지 않으므로 Expo SDK 54 도구와의 호환성을 위해 TypeScript 5.9도 함께 설치합니다. 기본 타입 검사는 네이티브 TypeScript 7이 담당합니다.

## 시작하기

### 요구 사항

- [Bun](https://bun.sh/) 1.3 이상
- Node.js LTS
- 모바일 기기에서 실행하는 경우 Expo Go 또는 네이티브 개발 환경

### 설치 및 실행

```bash
bun install
bun run dev:clear
```

개발 서버가 실행되면 터미널에서 `i`, `a`, `w`를 눌러 각각 iOS, Android, Web을 열 수 있습니다.

플랫폼별로 바로 실행할 수도 있습니다.

```bash
bun run ios
bun run android
bun run web
```

## 코드 품질

```bash
# Oxlint 검사
bun run lint

# Oxfmt 포맷 적용 및 검사
bun run format
bun run format:check

# TypeScript 7 네이티브 타입 검사
bun run typecheck

# 전체 검사
bun run check
```

Expo 호환성 확인이 필요할 때는 다음 명령을 실행합니다.

```bash
bunx expo-doctor
```

## 프로젝트 구조

```text
.
├── assets/          # 앱 아이콘 및 정적 이미지
├── src/
│   └── app/         # Expo Router 화면과 레이아웃
├── app.json         # Expo 앱 설정
├── tsconfig.json    # TypeScript 설정
├── .oxlintrc.json   # Oxlint 설정
└── .oxfmtrc.json    # Oxfmt 설정
```
