import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/store';
import { useEffect } from 'react';
import { getDatabase } from '@/services/db';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CustomAlertModal } from '@/components/CustomAlertModal';
import { AppState as RNAppState } from 'react-native';
import { performStartupSync, initStoreSyncListener } from '@/services/syncManager';

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

    // 3. 앱 복귀(active) 시 자동 동기화
    const appStateSub = RNAppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        performStartupSync();
      }
    });

    return () => {
      unsubscribeStore();
      appStateSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style={bgTextMode === 'light' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <CustomAlertModal />
    </SafeAreaProvider>
  );
}
