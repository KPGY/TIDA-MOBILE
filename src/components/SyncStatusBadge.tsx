import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshCw, Check, AlertCircle } from 'lucide-react-native';
import { addSyncListener, SyncStatus } from '@/services/syncManager';
import { useAppStore } from '@/store/store';

export function SyncStatusBadge() {
  const insets = useSafeAreaInsets();
  const { bgTextMode, mainTheme } = useAppStore();
  const [status, setStatus] = useState<SyncStatus>('idle');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const isDark = bgTextMode === 'light';

  useEffect(() => {
    const unsub = addSyncListener((newStatus) => {
      setStatus(newStatus);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (status === 'syncing') {
      // 1. Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // 2. Start continuous spin
      spinAnim.setValue(0);
      spinLoopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spinLoopRef.current.start();
    } else if (status === 'synced') {
      if (spinLoopRef.current) {
        spinLoopRef.current.stop();
      }
      spinAnim.setValue(0);

      // 잠깐 유지 후 서서히 Fade out
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(1800),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (status === 'error') {
      if (spinLoopRef.current) {
        spinLoopRef.current.stop();
      }
      spinAnim.setValue(0);

      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // idle
      if (spinLoopRef.current) {
        spinLoopRef.current.stop();
      }
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [status]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrapper,
        { top: insets.top > 0 ? insets.top + 5 : 12 },
      ]}>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: fadeAnim,
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.94)' : 'rgba(255, 255, 255, 0.96)',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
          },
        ]}>
        {status === 'syncing' && (
          <>
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <RefreshCw size={11} color={mainTheme} />
            </Animated.View>
            <Text style={[styles.text, { color: isDark ? '#E2E8F0' : '#334155' }]}>
              동기화 중...
            </Text>
          </>
        )}

        {status === 'synced' && (
          <>
            <Check size={12} color="#10B981" />
            <Text style={[styles.text, { color: '#10B981' }]}>동기화 완료</Text>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle size={12} color="#EF4444" />
            <Text style={[styles.text, { color: '#EF4444' }]}>동기화 실패</Text>
          </>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 99999,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});
