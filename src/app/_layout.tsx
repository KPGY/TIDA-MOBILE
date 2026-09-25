import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/store';
import { useEffect } from 'react';
import { getDatabase } from '@/services/db';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CustomAlertModal } from '@/components/CustomAlertModal';

export default function RootLayout() {
  const { bgTextMode } = useAppStore();

  useEffect(() => {
    // Initialize SQLite database table
    try {
      getDatabase();
    } catch (e) {
      console.error('Failed to init SQLite:', e);
    }
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
