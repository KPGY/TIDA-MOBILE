/**
 * Google Drive 및 OAuth 2.0 설정
 *
 * Google Cloud Console(https://console.cloud.google.com)에서:
 * 1. 프로젝트 생성 (예: TIDA)
 * 2. API 및 서비스 > 라이브러리 > 'Google Drive API' 사용 설정
 * 3. OAuth 동의 화면 구성 (User Type: 외부, 테스트 사용자에 본인 구글 이메일 등록)
 * 4. 사용자 인증 정보 > OAuth 2.0 클라이언트 ID 만들기:
 *    - 웹 애플리케이션 (Expo 개발 / Web / Expo Go 브라우저 로그인용)
 *    - 필요 시 Android / iOS 클라이언트 ID 추가
 */

export const GOOGLE_CONFIG = {
  WEB_CLIENT_ID: '993804121753-s570tbnp5sbp6a48k80ufpptskqslrat.apps.googleusercontent.com',
  ANDROID_CLIENT_ID: '993804121753-hssqutg9fjms838dg0c75il29d9pmofl.apps.googleusercontent.com',
  IOS_CLIENT_ID: '',

  // OAuth 2.0 엔드포인트
  DISCOVERY: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  },

  // 요청할 권한 (드라이브 파일 생성/수정 및 프로필/이메일)
  SCOPES: [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/drive.file',
  ],

  // 백업 파일 명
  BACKUP_FILE_NAME: 'tida_backup.json',
  APP_SCHEME: 'tidamobile',
  ANDROID_PACKAGE: 'com.kypgy.tidamobile',
};
