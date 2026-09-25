import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Dimensions,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/store';
import { hexToRgba } from '@/utils/colorHelper';
import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';

export type FluidTabBarProps = NonNullable<ComponentProps<typeof Tabs>['tabBar']> extends (props: infer P) => any ? P : any;

export function FluidTabBar({ state, descriptors, navigation }: FluidTabBarProps) {
  const { mainTheme, panelTheme, panelTextMode } = useAppStore();
  const isDark = panelTextMode === 'light';
  const insets = useSafeAreaInsets();

  const routes = state.routes;
  const activeIndex = state.index;
  const totalTabs = routes.length;

  const windowWidth = Dimensions.get('window').width;
  const [barWidth, setBarWidth] = useState(windowWidth - 24);
  const barRef = useRef<View>(null);

  const tabWidth = barWidth / totalTabs;
  // 버튼 크기에 딱 맞추어 꽉 차도록 여백 2px 설정
  const pillPadding = 2;
  const pillWidth = Math.max(0, tabWidth - pillPadding * 2);

  // Reanimated 공유 값: 슬라이더 캡슐 위치
  const translateX = useSharedValue(activeIndex * tabWidth);

  // 탭 변경 시 부드러운 감속 이징으로 목표 탭에 매끄럽게 안착
  useEffect(() => {
    translateX.value = withTiming(activeIndex * tabWidth, {
      duration: 220,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [activeIndex, tabWidth]);

  // 컨테이너 레이아웃 측정
  const updateBarPosition = () => {
    barRef.current?.measure((_x, _y, width) => {
      if (width > 0) setBarWidth(width);
    });
  };

  // 터치식 탭 이동 핸들러 (100% 확실한 탭 전환 및 햅틱)
  const handleTabPress = (routeIndex: number) => {
    if (routeIndex === state.index) return;
    const route = routes[routeIndex];

    Haptics.selectionAsync();

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });

    if (event.defaultPrevented) return;

    if (navigation.dispatch) {
      try {
        navigation.dispatch({
          type: 'NAVIGATE',
          payload: {
            name: route.name,
            params: route.params,
            merge: true,
          },
          target: state.key,
        });
      } catch (err) {
        console.warn('[FluidTabBar] navigation.dispatch error:', err);
      }
    }
  };

  // 인디케이터 스타일: 스케일 왜곡 없이 정밀한 X축 슬라이딩만 적용
  const dropletAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // 네비게이션 바 높이 및 안전 여백 계산
  const bottomInset = insets.bottom;
  const bottomPadding = bottomInset > 0
    ? bottomInset + (Platform.OS === 'android' ? 8 : 4)
    : (Platform.OS === 'ios' ? 24 : 12);

  const inactiveColor = isDark ? '#94A3B8' : '#64748B';

  return (
    <View
      style={[
        styles.outerContainer,
        {
          backgroundColor: panelTheme,
          borderTopColor: isDark ? '#334155' : '#E2E8F0',
          paddingBottom: bottomPadding,
        },
      ]}>
      {/* 
        버튼 및 인디케이터 영역: 높이 54dp로 고정하고 overflow hidden을 적용하여
        어떠한 터치 효과도 하단 네비게이션 바로 절대 새어나가지 않습니다.
      */}
      <View
        ref={barRef}
        onLayout={updateBarPosition}
        style={[
          styles.innerBar,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          },
        ]}>
        {/* 버튼 크기에 딱 맞추어 꽉 차는 슬라이딩 캡슐 인디케이터 */}
        <Animated.View
          style={[
            styles.dropletIndicator,
            {
              width: pillWidth,
              left: pillPadding,
              backgroundColor: hexToRgba(mainTheme, isDark ? 0.22 : 0.14),
              borderColor: hexToRgba(mainTheme, isDark ? 0.45 : 0.3),
              shadowColor: mainTheme,
            },
            dropletAnimatedStyle,
          ]}
        />

        {/* 
          각 탭 아이템: 순수 터치 방식의 독립적 Pressable 적용
          - 복잡한 제스처 간섭 없이 터치하는 즉시 100% 확실하게 화면 전환
          - android_ripple={null} 로 네비게이션 바 쪽 번짐 원천 차단
        */}
        {routes.map((route, index) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const label =
            options.title !== undefined
              ? options.title
              : typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : route.name;

          const icon = options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused ? mainTheme : inactiveColor,
            size: 21,
          });

          return (
            <Pressable
              key={route.key}
              onPress={() => handleTabPress(index)}
              android_ripple={null}
              style={({ pressed }) => [
                styles.tabItem,
                { width: tabWidth },
                pressed && { opacity: 0.7 },
              ]}>
              <View style={styles.iconWrapper}>{icon}</View>
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? mainTheme : inactiveColor,
                    fontWeight: isFocused ? '700' : '500',
                  },
                ]}
                numberOfLines={1}>
                {typeof label === 'string' ? label : route.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    borderTopWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  innerBar: {
    flexDirection: 'row',
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
  },
  dropletIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 25,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  tabItem: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    zIndex: 1,
  },
  iconWrapper: {
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 2,
    letterSpacing: -0.2,
  },
});
