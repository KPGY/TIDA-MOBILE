import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_CONFIG } from '../constants/googleConfig';

// 브라우저 리다이렉트 세션 완료 처리
WebBrowser.maybeCompleteAuthSession();

const STORAGE_KEYS = {
  CLIENT_ID: '@tida_google_client_id',
  TOKENS: '@tida_google_tokens',
  USER: '@tida_google_user',
  LAST_BACKUP: '@tida_last_backup_time',
};

export interface GoogleUser {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in ms
}

// ─────────────────────────────────────────────────────────────────────────────
// 세션 만료 리스너 시스템
// syncManager 등에서 구독하여 세션 만료 시 자동 복구 흐름을 진행할 수 있도록 함
// ─────────────────────────────────────────────────────────────────────────────
type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export function notifySessionExpired(): void {
  sessionExpiredListeners.forEach((listener) => {
    try {
      listener();
    } catch (_) {}
  });
}

/**
 * 저장된 또는 기본 클라이언트 ID 가져오기 (플랫폼별 자동 선택)
 */
export async function getActiveClientId(): Promise<string> {
  try {
    const customId = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT_ID);
    if (customId && customId.trim()) {
      return customId.trim();
    }
  } catch (e) {
    console.warn('Failed to get custom client ID:', e);
  }

  if (Platform.OS === 'android' && GOOGLE_CONFIG.ANDROID_CLIENT_ID.trim()) {
    return GOOGLE_CONFIG.ANDROID_CLIENT_ID.trim();
  }
  if (Platform.OS === 'ios' && GOOGLE_CONFIG.IOS_CLIENT_ID.trim()) {
    return GOOGLE_CONFIG.IOS_CLIENT_ID.trim();
  }
  return GOOGLE_CONFIG.WEB_CLIENT_ID.trim();
}

/**
 * 커스텀 클라이언트 ID 저장
 */
export async function saveCustomClientId(clientId: string): Promise<void> {
  const trimmed = clientId.trim();
  if (trimmed) {
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_ID, trimmed);
  } else {
    await AsyncStorage.removeItem(STORAGE_KEYS.CLIENT_ID);
  }
}

/**
 * 저장된 구글 사용자 정보 가져오기
 */
export async function getStoredGoogleUser(): Promise<GoogleUser | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 저장된 토큰 정보 가져오기
 */
export async function getStoredTokens(): Promise<GoogleTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.TOKENS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * 마지막 백업 일시 가져오기
 */
export async function getLastBackupTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
  } catch {
    return null;
  }
}

/**
 * 마지막 백업 일시 저장
 */
export async function setLastBackupTime(timeIsoString: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_BACKUP, timeIsoString);
  } catch (e) {
    console.warn('Failed to set last backup time:', e);
  }
}

/**
 * 구글 사용자 프로필 API 호출
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUser> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`사용자 정보 조회 실패 (${response.status})`);
  }

  const data = await response.json();
  return {
    email: data.email || '',
    name: data.name || data.email || 'Google User',
    picture: data.picture,
  };
}

/**
 * 유효한 액세스 토큰 반환 (필요 시 Refresh Token으로 자동 갱신)
 *
 * 반환값:
 *  - string : 유효한 토큰
 *  - null   : Refresh Token도 만료/무효화됨 → 호출자가 getTokenWithRecovery()로 Silent Re-auth 시도
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens || !tokens.accessToken) {
    return null;
  }

  const now = Date.now();
  // 만료 1분 이상 남아 있으면 현재 토큰 바로 사용
  if (tokens.expiresAt && tokens.expiresAt - now > 60 * 1000) {
    return tokens.accessToken;
  }

  // 만료됐거나 곧 만료 → Refresh Token으로 자동 갱신 시도
  if (tokens.refreshToken) {
    try {
      const clientId = await getActiveClientId();
      const refreshResponse = await fetch(GOOGLE_CONFIG.DISCOVERY.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
        }).toString(),
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        const newTokens: GoogleTokens = {
          accessToken: refreshData.access_token,
          refreshToken: tokens.refreshToken,
          expiresAt: Date.now() + (refreshData.expires_in || 3600) * 1000,
        };
        await AsyncStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(newTokens));
        return newTokens.accessToken;
      }

      // ★ 수정: 서버가 리프레시를 거절(400 invalid_grant 등)하면 null 반환
      // → 죽은 토큰을 그대로 리턴하던 기존 버그 수정
      const errorBody = await refreshResponse.json().catch(() => ({}));
      console.warn('[GoogleAuth] Token refresh rejected:', refreshResponse.status, errorBody);
      return null;
    } catch (err) {
      // 네트워크 오류(오프라인 등)는 기존 토큰으로 일단 시도 (서버 거절과 구분)
      console.warn('[GoogleAuth] Token refresh network error (offline?):', err);
      return tokens.accessToken;
    }
  }

  // 리프레시 토큰도 없고 만료된 경우
  return null;
}

/**
 * Silent Re-authentication (prompt: 'none')
 * 사용자에게 로그인 UI를 보여주지 않고 조용히 새 토큰 발급 시도.
 * 기기의 구글 세션이 살아있으면 성공, 그렇지 않으면 null 반환.
 *
 * 성공 조건:
 * - 기기에 구글 계정 세션이 유지되어 있을 것
 * - OAuth 동의(scope)가 이미 허용된 상태일 것
 */
export async function trySilentReauth(): Promise<string | null> {
  try {
    const clientId = await getActiveClientId();
    if (!clientId) return null;

    const redirectUri = AuthSession.makeRedirectUri({
      native: `${GOOGLE_CONFIG.ANDROID_PACKAGE}:/oauthredirect`,
      scheme: GOOGLE_CONFIG.APP_SCHEME,
      path: 'oauthredirect',
    });

    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: GOOGLE_CONFIG.SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'none', // ★ 핵심: UI 없이 백그라운드 인증 시도
      },
    });

    const result = await request.promptAsync(GOOGLE_CONFIG.DISCOVERY, {
      showInRecents: false,
    });

    if (result.type === 'success' && result.params.code) {
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId,
          code: result.params.code,
          extraParams: request.codeVerifier
            ? { code_verifier: request.codeVerifier }
            : undefined,
          redirectUri,
        },
        GOOGLE_CONFIG.DISCOVERY,
      );

      const expiresAt =
        Date.now() + (tokenResult.expiresIn ? tokenResult.expiresIn * 1000 : 3600 * 1000);
      const prevTokens = await getStoredTokens();

      const newTokens: GoogleTokens = {
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken || prevTokens?.refreshToken,
        expiresAt,
      };
      await AsyncStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(newTokens));

      // 사용자 정보도 갱신
      try {
        const user = await fetchGoogleUserInfo(tokenResult.accessToken);
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      } catch (_) {}

      console.log('[GoogleAuth] Silent re-auth succeeded');
      return newTokens.accessToken;
    }

    // prompt:none 실패 (login_required, interaction_required 등)
    const errorCode = (result as any).params?.error ?? result.type;
    console.warn('[GoogleAuth] Silent re-auth failed:', errorCode);
    return null;
  } catch (err) {
    console.warn('[GoogleAuth] Silent re-auth error:', err);
    return null;
  }
}

/**
 * 토큰 완전 복구 시도 (3단계 레이어)
 *
 * 1단계: getValidAccessToken() — 정상 만료 시 Refresh Token으로 자동 갱신
 * 2단계: trySilentReauth()    — Refresh Token 무효화 시 UI 없이 재인증 시도
 * 3단계: 모두 실패 시 null 반환 + 세션 만료 이벤트 발생 → 재로그인 유도
 *
 * syncManager의 API 호출부에서 getValidAccessToken() 대신 이 함수를 사용하면
 * 친구 케이스처럼 "동기화 일시정지 → Refresh Token 무효화" 상황을 자동으로 복구
 */
export async function getTokenWithRecovery(): Promise<string | null> {
  // 1단계
  const token = await getValidAccessToken();
  if (token) return token;

  // 2단계
  console.log('[GoogleAuth] Refresh failed, attempting silent re-auth...');
  const silentToken = await trySilentReauth();
  if (silentToken) return silentToken;

  // 3단계: 모두 실패 → 재로그인 필요
  console.warn('[GoogleAuth] All token recovery attempts failed. Session expired.');
  notifySessionExpired();
  return null;
}

/**
 * 구글 로그인 실행 (OAuth 2.0 PKCE Flow)
 */
export async function signInWithGoogle(): Promise<{
  success: boolean;
  cancelled?: boolean;
  user?: GoogleUser;
  error?: string;
}> {
  try {
    const clientId = await getActiveClientId();
    if (!clientId) {
      return {
        success: false,
        error: 'Google OAuth Client ID가 설정되지 않았습니다. 설정에서 Client ID를 입력해주세요.',
      };
    }

    const redirectUri = AuthSession.makeRedirectUri({
      native: `${GOOGLE_CONFIG.ANDROID_PACKAGE}:/oauthredirect`,
      scheme: GOOGLE_CONFIG.APP_SCHEME,
      path: 'oauthredirect',
    });
    console.log('[GoogleAuth] Redirect URI:', redirectUri);

    const request = new AuthSession.AuthRequest({
      clientId,
      scopes: GOOGLE_CONFIG.SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    });

    const result = await request.promptAsync(GOOGLE_CONFIG.DISCOVERY, {
      showInRecents: false,
    });
    console.log('[GoogleAuth] Auth prompt result:', result);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      return { success: false, cancelled: true };
    }

    if (result.type !== 'success' || !result.params.code) {
      return {
        success: false,
        error: `인증에 실패했습니다 (${result.type})`,
      };
    }

    // Auth Code -> Token 교환
    const tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: result.params.code,
        extraParams: request.codeVerifier
          ? { code_verifier: request.codeVerifier }
          : undefined,
        redirectUri,
      },
      GOOGLE_CONFIG.DISCOVERY,
    );

    // ★ 수정: 토큰 교환이 완전히 완료된 후에 브라우저 닫기
    // 이전: promptAsync 직후 dismiss → Chrome Custom Tab이 토큰 교환 전에 닫혀 에러 화면 잔류
    // 이후: exchangeCodeAsync 완료 후 dismiss → 에러 화면 없이 깔끔하게 닫힘
    try { WebBrowser.dismissAuthSession(); } catch (_) {}
    try { WebBrowser.dismissBrowser(); } catch (_) {}

    const expiresAt =
      Date.now() + (tokenResult.expiresIn ? tokenResult.expiresIn * 1000 : 3600 * 1000);

    const tokens: GoogleTokens = {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt,
    };
    await AsyncStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));

    // 사용자 정보 로드
    const user = await fetchGoogleUserInfo(tokenResult.accessToken);
    await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

    return { success: true, user };
  } catch (error: any) {
    // 에러 시에도 혹시 열려있는 브라우저 닫기
    try { WebBrowser.dismissAuthSession(); } catch (_) {}
    try { WebBrowser.dismissBrowser(); } catch (_) {}
    console.error('Google Sign-in Error:', error);
    return {
      success: false,
      error: error.message || '구글 로그인 중 알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 구글 로그아웃 (로컬 저장소 정리 및 토큰 해제)
 */
export async function signOutGoogle(): Promise<void> {
  try {
    const tokens = await getStoredTokens();
    if (tokens?.accessToken) {
      // 구글 토큰 revoke 시도 (비동기, 실패해도 로컬 정리는 진행)
      fetch(`${GOOGLE_CONFIG.DISCOVERY.revocationEndpoint}?token=${tokens.accessToken}`, {
        method: 'POST',
      }).catch(() => {});
    }
  } catch (_) {}

  await AsyncStorage.multiRemove([STORAGE_KEYS.TOKENS, STORAGE_KEYS.USER]);
}
