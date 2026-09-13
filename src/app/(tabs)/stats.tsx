import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { Flame, CheckCircle2, Award, Calendar, TrendingUp } from 'lucide-react-native';
import { useAppStore } from '@/store/store';
import {
  calculateStreak,
  getRecentDaysStatus,
  getTodayStr,
  isRoutineCompletedOnDate,
  isRoutineActiveOnDay,
} from '@/utils/routineHelper';

export default function StatsScreen() {
  const { bgTheme, panelTheme, mainTheme, bgTextMode, routines, todos } = useAppStore();

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';
  const cardBg = panelTheme;

  const todayStr = getTodayStr();

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
    <SafeAreaView style={[styles.container, { backgroundColor: bgTheme }]}>
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
          <View style={[styles.metricCard, { backgroundColor: cardBg }]}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
              <TrendingUp size={20} color={mainTheme} />
            </View>
            <Text style={[styles.metricValue, { color: textColor }]}>
              {stats.routineCompletionRate}%
            </Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>오늘 루틴 달성</Text>
            <Text style={[styles.metricDetail, { color: mainTheme }]}>
              {stats.completedTodayCount}/{stats.activeTodayCount} 완료
            </Text>
          </View>

          {/* Card 2: Max Streak */}
          <View style={[styles.metricCard, { backgroundColor: cardBg }]}>
            <View style={[styles.iconCircle, { backgroundColor: '#FFEDD5' }]}>
              <Flame size={20} color="#EA580C" />
            </View>
            <Text style={[styles.metricValue, { color: '#EA580C' }]}>{stats.maxStreak}일</Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>최고 연속 스트릭</Text>
            <Text
              numberOfLines={1}
              style={[styles.metricDetail, { color: subTextColor, fontSize: 11 }]}>
              {stats.bestRoutineTitle || '진행 중'}
            </Text>
          </View>

          {/* Card 3: Todos Done */}
          <View style={[styles.metricCard, { backgroundColor: cardBg }]}>
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
              <CheckCircle2 size={20} color="#10B981" />
            </View>
            <Text style={[styles.metricValue, { color: textColor }]}>
              {stats.completedTodos}개
            </Text>
            <Text style={[styles.metricLabel, { color: subTextColor }]}>완료한 할 일</Text>
            <Text style={[styles.metricDetail, { color: '#10B981' }]}>
              달성률 {stats.todoCompletionRate}%
            </Text>
          </View>
        </View>

        {/* Routine Recent 7 Days Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>최근 7일간의 루틴 실천</Text>

          {routines.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.emptyText, { color: subTextColor }]}>
                등록된 루틴이 없습니다.
              </Text>
            </View>
          ) : (
            <View style={styles.routineGrid}>
              {routines.map((routine) => {
                const days = getRecentDaysStatus(routine, 7);
                const streak = calculateStreak(routine.completedDates, routine.repeatDays);

                return (
                  <View key={routine.id} style={[styles.routineStatCard, { backgroundColor: cardBg }]}>
                    <View style={styles.routineStatTop}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 24 }}>{routine.icon}</Text>
                        <Text style={[styles.routineStatTitle, { color: textColor }]}>
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
                          <Text style={[styles.dotLabel, { color: subTextColor }]}>{d.label}</Text>
                          <View
                            style={[
                              styles.dot,
                              d.isDone
                                ? { backgroundColor: mainTheme }
                                : d.isRequired
                                  ? {
                                      backgroundColor: 'transparent',
                                      borderColor: 'rgba(0,0,0,0.2)',
                                      borderWidth: 1.5,
                                    }
                                  : { backgroundColor: 'rgba(0,0,0,0.06)' },
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
    </SafeAreaView>
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
