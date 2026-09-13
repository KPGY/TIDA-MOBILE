# TIDA Mobile (안드로이드 React Native / Expo)

> 데스크톱 어플리케이션 TIDA를 모바일(Android / iOS) 환경에 최적화하여 재탄생시킨 React Native (Expo) 프로젝트입니다.

---

## 📱 주요 화면 및 기능

1. **타임라인 (Timeline / Diary)**
   - 날짜별 빠른 생각/메모 기록
   - 갤러리 사진 첨부 및 미리보기
   - 전체 기록 검색 (`expo-sqlite` 기반 로컬 DB)
   - 최신순 / 시간순 정렬 지원

2. **투두 & 루틴 (Todos & Routines)**
   - **오늘의 습관 루틴**: 요일별 반복 루틴, 불꽃(Flame) 연속 달성(Streak) 계산, 햅틱 피드백
   - **할 일 목록**: 하위 서브 작업(Sub-todo) 지원, 달성률 퍼센트 자동 계산, 원클릭 완료 및 정리

3. **통계 (Stats)**
   - 오늘의 루틴 달성률 & 최고 연속 달성일수 집계
   - 각 루틴별 최근 7일간의 실천 도트 매트릭스

4. **설정 및 테마 커스터마이징 (Settings)**
   - 모던 화이트, 다크 미드나잇, 라벤더, 포레스트 그린, 선셋 코랄 프리셋 테마
   - 포인트 컬러 커스터마이징
   - 데이터 초기화

---

## 🛠 기술 스택

- **Framework**: Expo (React Native 0.86+, React 19)
- **Routing**: Expo Router (File-based Tabs navigation)
- **Database**: `expo-sqlite` (로컬 SQLite 데이터베이스)
- **State Management**: `zustand` + `@react-native-async-storage/async-storage`
- **Media**: `expo-image-picker`, `expo-file-system`
- **Feedback**: `expo-haptics`
- **Icons**: `lucide-react-native`

---

## 🚀 앱 실행 방법

1. 의존성 확인 (이미 설치 완료됨)
   ```bash
   cd tida-mobile
   ```

2. 개발 서버 실행
   ```bash
   npx expo start
   ```

3. 실기기(스마트폰)에서 테스트:
   - 안드로이드 폰의 **Google Play Store**에서 **Expo Go** 앱을 설치합니다.
   - 터미널에 나타나는 QR 코드를 Expo Go 앱의 카메라로 스캔하면 폰에서 즉시 실행됩니다!

4. 안드로이드 에뮬레이터에서 실행 (설치되어 있는 경우):
   - 터미널에서 `a` 키를 누르면 연결된 에뮬레이터에서 자동 실행됩니다.
