import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/store';
import { useEffect } from 'react';
import { getDatabase } from '@/services/db';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CustomAlertModal } from '@/components/CustomAlertModal';
import { AppState as RNAppState } from 'react-native';
import {
  performStartupSync,
  initStoreSyncListener,
  startPeriodicSyncCheck,
  flushAutoSync,
  initSessionExpiredHandler,
} from '@/services/syncManager';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';
import { showAlert } from '@/services/alert';

import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  const { bgTextMode } = useAppStore();

  useEffect(() => {
    // Initialize SQLite database table
    try {
      getDatabase();
    } catch (e) {
      console.error('Failed to init SQLite:', e);
    }

    // 1. 투두/루틴 스토어 변경 시 자동 동기화 감지 리스너
    const unsubscribeStore = initStoreSyncListener();

    // 2. 앱 시작 시 백그라운드 최신 데이터 동기화
    performStartupSync();

    // 3. 앱 복귀(active) 시 자동 동기화 & 백그라운드 진입 시 대기 중인 업로드 즉시 전송(flush)
    const appStateSub = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // ★ 수정: 여기서 dismissAuthSession을 호출하면 로그인 직후 Chrome Tab이 강제 닫혀
        //   에러 화면이 잔류하는 문제가 있으므로 제거. dismiss는 signInWithGoogle 내부에서 처리.
        performStartupSync();
      } else if (nextState === 'background' || nextState === 'inactive') {
        flushAutoSync();
      }
    });

    // 4. 앱 켜져 있는 동안 30초마다 최신 클라우드 변경사항 자동 감지
    const unsubscribePeriodic = startPeriodicSyncCheck(30000);

    // 5. 세션 만료 핸들러: Silent Re-auth도 실패했을 때 사용자에게 재로그인 유도
    const unsubscribeSessionExpired = initSessionExpiredHandler(() => {
      showAlert(
        '구글 로그인 세션 만료',
        '동기화 세션이 만료되었습니다.\n설정에서 구글 계정을 다시 연결해주세요.',
        [{ text: '확인', style: 'default' }],
      );
    });

    return () => {
      unsubscribeStore();
      appStateSub.remove();
      unsubscribePeriodic();
      unsubscribeSessionExpired();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={bgTextMode === 'light' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <SyncStatusBadge />
      <CustomAlertModal />
    </SafeAreaProvider>
  );
}
