import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppStore } from '@/store/store';
import { useEffect } from 'react';
import { getDatabase } from '@/services/db';

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
    <>
      <StatusBar style={bgTextMode === 'light' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
