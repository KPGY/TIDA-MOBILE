import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/store';
import { useEffect } from 'react';
import { getDatabase } from '@/services/db';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CustomAlertModal } from '@/components/CustomAlertModal';
import { AppState as RNAppState } from 'react-native';
import { performStartupSync, initStoreSyncListener, startPeriodicSyncCheck, flushAutoSync } from '@/services/syncManager';
import { SyncStatusBadge } from '@/components/SyncStatusBadge';

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
        performStartupSync();
      } else if (nextState === 'background' || nextState === 'inactive') {
        flushAutoSync();
      }
    });

    // 4. 앱 켜져 있는 동안 3분(180초)마다 최신 클라우드 변경사항 자동 감지
    const unsubscribePeriodic = startPeriodicSyncCheck(180000);

    return () => {
      unsubscribeStore();
      appStateSub.remove();
      unsubscribePeriodic();
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
