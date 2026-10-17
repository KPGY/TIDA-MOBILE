import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, AppState } from 'react-native';
import { Flame, CheckCircle2, Award, Calendar, TrendingUp } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '@/store/store';
import { hexToRgba } from '@/utils/colorHelper';
import { AppBackground } from '@/components/AppBackground';
import {
  calculateStreak,
  getRecentDaysStatus,
  getTodayStr,
  isRoutineCompletedOnDate,
  isRoutineActiveOnDay,
} from '@/utils/routineHelper';

export default function StatsScreen() {
  const {
    bgTheme,
    panelTheme,
    panelThemeEnd,
    mainTheme,
    gradientMode,
    bgTextMode,
    panelTextMode,
    glassmorphismMode,
    routines,
    todos,
  } = useAppStore();

  const [todayStr, setTodayStr] = useState<string>(getTodayStr());

  // 12시(자정) 넘었을 때 통계 일자 자동 갱신
  useEffect(() => {
    const checkMidnight = () => {
      const current = getTodayStr();
      setTodayStr((prev) => (prev !== current ? current : prev));
    };

    const setupMidnightTimer = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0,
        0,
        1,
      );
      const delay = Math.max(1000, nextMidnight.getTime() - now.getTime());
      return setTimeout(() => {
        checkMidnight();
        timerRef.current = setupMidnightTimer();
      }, delay);
    };

    const timerRef = { current: setupMidnightTimer() };

    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkMidnight();
        clearTimeout(timerRef.current);
        timerRef.current = setupMidnightTimer();
      }
    });

    const interval = setInterval(checkMidnight, 30000);

    return () => {
      clearTimeout(timerRef.current);
      clearInterval(interval);
      appStateSub.remove();
    };
  }, []);

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';

  const isPanelDark = panelTextMode === 'light';
  const cardTextColor = isPanelDark ? '#F8FAFC' : '#0F172A';
  const cardSubTextColor = isPanelDark ? '#94A3B8' : '#64748B';

  const cardBgAlpha = glassmorphismMode ? 0.52 : 1;
  const cardBg = glassmorphismMode ? hexToRgba(panelTheme, cardBgAlpha) : panelTheme;
  const cardBorder = glassmorphismMode
    ? isPanelDark
      ? 'rgba(255,255,255,0.28)'
      : 'rgba(255,255,255,0.75)'
    : isPanelDark
      ? 'rgba(255,255,255,0.1)'
      : 'rgba(0,0,0,0.06)';

  const renderCardGradient = (borderRadius?: number) => (
    <>
      {gradientMode && (
        <LinearGradient
          colors={[
            glassmorphismMode ? hexToRgba(panelTheme, cardBgAlpha) : panelTheme,
            glassmorphismMode
              ? hexToRgba(panelThemeEnd || panelTheme, cardBgAlpha)
              : (panelThemeEnd || panelTheme),
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, borderRadius !== undefined ? { borderRadius } : null]}
        />
      )}
      {glassmorphismMode && (
        <LinearGradient
          colors={
            isPanelDark
              ? ['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.02)']
              : ['rgba(255, 255, 255, 0.38)', 'rgba(255, 255, 255, 0.06)']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, borderRadius !== undefined ? { borderRadius } : null]}
          pointerEvents="none"
        />
      )}
    </>
  );

  // Statistics calculations
  const stats = useMemo(() => {
    // 1. Today routines active & completed
    const today = new Date();
    const activeTodayRoutines = routines.filter((r) => isRoutineActiveOnDay(r, today));
    const completedTodayRoutines = activeTodayRoutines.filter((r) =>
      isRoutineCompletedOnDate(r, todayStr),
    );
    const routineCompletionRate =
      activeTodayRoutines.length > 0
        ? Math.round((completedTodayRoutines.length / activeTodayRoutines.length) * 100)
        : 0;

    // 2. Todos stats
    const totalTodos = todos.length;
    const completedTodos = todos.filter((t) => t.completed).length;
    const todoCompletionRate =
      totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

    // 3. Max Streak across all routines
    let maxStreak = 0;
    let bestRoutineTitle = '';
    routines.forEach((r) => {
      const s = calculateStreak(r.completedDates, r.repeatDays);
      if (s > maxStreak) {
        maxStreak = s;
        bestRoutineTitle = r.title;
      }
    });

    return {
      activeTodayCount: activeTodayRoutines.length,
      completedTodayCount: completedTodayRoutines.length,
      routineCompletionRate,
      totalTodos,
      completedTodos,
      todoCompletionRate,
      maxStreak,
      bestRoutineTitle,
    };
  }, [routines, todos, todayStr]);

  return (
    <AppBackground style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>달성 현황 및 통계</Text>
          <Text style={[styles.headerSubtitle, { color: subTextColor }]}>
            작은 습관이 모여 만드는 오늘의 성장 기록 ✨
          </Text>
        </View>

        {/* 3 Summary Metric Cards */}
        <View style={styles.metricsRow}>
          {/* Card 1: Today Routines */}
          <View
            style={[
              styles.metricCard,
              !gradientMode && { backgroundColor: cardBg },
              glassmorphismMode && styles.glassCard,
              { borderColor: cardBorder, overflow: 'hidden' },
            ]}>
            {renderCardGradient(16)}
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
              <TrendingUp size={20} color={mainTheme} />
            </View>
            <Text
              style={[
                styles.metricValue,
                {
                  color: cardTextColor,
                  textShadowColor: isPanelDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                  textShadowOffset: { width: 0, height: 0.5 },
                  textShadowRadius: 1,
                },
              ]}>
              {stats.routineCompletionRate}%
            </Text>
            <Text style={[styles.metricLabel, { color: cardSubTextColor }]}>오늘 루틴 달성</Text>
            <Text style={[styles.metricDetail, { color: mainTheme }]}>
              {stats.completedTodayCount}/{stats.activeTodayCount} 완료
            </Text>
          </View>

          {/* Card 2: Max Streak */}
          <View
            style={[
              styles.metricCard,
              !gradientMode && { backgroundColor: cardBg },
              glassmorphismMode && styles.glassCard,
              { borderColor: cardBorder, overflow: 'hidden' },
            ]}>
            {renderCardGradient(16)}
            <View style={[styles.iconCircle, { backgroundColor: '#FFEDD5' }]}>
              <Flame size={20} color="#EA580C" />
            </View>
            <Text style={[styles.metricValue, { color: '#EA580C' }]}>{stats.maxStreak}일</Text>
            <Text style={[styles.metricLabel, { color: cardSubTextColor }]}>최고 연속 스트릭</Text>
            <Text
              numberOfLines={1}
              style={[styles.metricDetail, { color: cardSubTextColor, fontSize: 11 }]}>
              {stats.bestRoutineTitle || '진행 중'}
            </Text>
          </View>

          {/* Card 3: Todos Done */}
          <View
            style={[
              styles.metricCard,
              !gradientMode && { backgroundColor: cardBg },
              glassmorphismMode && styles.glassCard,
              { borderColor: cardBorder, overflow: 'hidden' },
            ]}>
            {renderCardGradient(16)}
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
              <CheckCircle2 size={20} color="#10B981" />
            </View>
            <Text
              style={[
                styles.metricValue,
                {
                  color: cardTextColor,
                  textShadowColor: isPanelDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                  textShadowOffset: { width: 0, height: 0.5 },
                  textShadowRadius: 1,
                },
              ]}>
              {stats.completedTodos}개
            </Text>
            <Text style={[styles.metricLabel, { color: cardSubTextColor }]}>완료한 할 일</Text>
            <Text style={[styles.metricDetail, { color: '#10B981' }]}>
              달성률 {stats.todoCompletionRate}%
            </Text>
          </View>
        </View>

        {/* Routine Recent 7 Days Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>최근 7일간의 루틴 실천</Text>

          {routines.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                !gradientMode && { backgroundColor: cardBg },
                glassmorphismMode && styles.glassCard,
                { borderColor: cardBorder, overflow: 'hidden' },
              ]}>
              {renderCardGradient(16)}
              <Text style={[styles.emptyText, { color: cardSubTextColor }]}>
                등록된 루틴이 없습니다.
              </Text>
            </View>
          ) : (
            <View style={styles.routineGrid}>
              {routines.map((routine) => {
                const days = getRecentDaysStatus(routine, 7);
                const streak = calculateStreak(routine.completedDates, routine.repeatDays);

                return (
                  <View
                    key={routine.id}
                    style={[
                      styles.routineStatCard,
                      !gradientMode && { backgroundColor: cardBg },
                      glassmorphismMode && styles.glassCard,
                      { borderColor: cardBorder, overflow: 'hidden' },
                    ]}>
                    {renderCardGradient(16)}
                    <View style={styles.routineStatTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 24 }}>{routine.icon}</Text>
                        <Text
                          style={[
                            styles.routineStatTitle,
                            {
                              color: cardTextColor,
                              textShadowColor: isPanelDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                              textShadowOffset: { width: 0, height: 0.5 },
                              textShadowRadius: 1,
                            },
                          ]}>
                          {routine.title}
                        </Text>
                      </View>
                      {streak > 0 && (
                        <View style={styles.streakBadge}>
                          <Flame size={12} color="#EA580C" />
                          <Text style={styles.streakText}>{streak}일</Text>
                        </View>
                      )}
                    </View>

                    {/* 7-Days Dot Matrix */}
                    <View style={styles.dotsRow}>
                      {days.map((d, idx) => (
                        <View key={idx} style={styles.dotColumn}>
                          <Text style={[styles.dotLabel, { color: cardSubTextColor }]}>{d.label}</Text>
                          <View
                            style={[
                              styles.dot,
                              d.isDone
                                ? { backgroundColor: mainTheme }
                                : d.isRequired
                                  ? {
                                      backgroundColor: 'transparent',
                                      borderColor: isPanelDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
                                      borderWidth: 1.5,
                                    }
                                  : { backgroundColor: isPanelDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
                            ]}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  glassCard: {
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  metricDetail: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  routineGrid: {
    gap: 12,
  },
  routineStatCard: {
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  routineStatTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  routineStatTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C2410C',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  dotColumn: {
    alignItems: 'center',
    gap: 6,
  },
  dotLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});
