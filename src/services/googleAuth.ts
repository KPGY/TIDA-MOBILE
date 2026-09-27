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
 * 유효한 액세스 토큰 반환 (필요시 리프레시 시도)
 */
export async function getValidAccessToken(): Promise<string | null> {
  const tokens = await getStoredTokens();
  if (!tokens || !tokens.accessToken) {
    return null;
  }

  const now = Date.now();
  // 만료 1분 전이면 갱신 필요하다고 판단
  if (tokens.expiresAt && tokens.expiresAt - now > 60 * 1000) {
    return tokens.accessToken;
  }

  // 만료되었고 리프레시 토큰이 있는 경우 갱신 시도
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
    } catch (err) {
      console.warn('Token refresh failed:', err);
    }
  }

  // 갱신 실패했으나 기존 토큰으로 일단 시도해봄 (또는 재로그인 필요)
  return tokens.accessToken;
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

    const result = await request.promptAsync(GOOGLE_CONFIG.DISCOVERY);
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
