import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  X,
  RotateCcw,
  Calendar as CalendarIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAppStore } from '@/store/store';
import { hexToRgba } from '@/utils/colorHelper';
import { getTodayStr, DAYS_LABEL } from '@/utils/routineHelper';
import { getRecordedDatesForMonth } from '@/services/db';

interface CalendarPickerModalProps {
  visible: boolean;
  currentDate: string;
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
}

interface CalendarDayItem {
  year: number;
  month: number;
  day: number;
  dateStr: string;
  isCurrentMonth: boolean;
  dayOfWeek: number;
}

export function CalendarPickerModal({
  visible,
  currentDate,
  onSelectDate,
  onClose,
}: CalendarPickerModalProps) {
  const insets = useSafeAreaInsets();
  const { panelTheme, mainTheme, panelTextMode, glassmorphismMode } = useAppStore();

  const isDark = panelTextMode === 'light';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
  const cardBg = glassmorphismMode ? hexToRgba(panelTheme, 0.95) : panelTheme;

  const todayStr = useMemo(() => getTodayStr(), []);

  // Parse initial year and month from currentDate
  const [viewYear, setViewYear] = useState<number>(() => {
    const parts = (currentDate || todayStr).split('-').map(Number);
    return parts[0] || new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const parts = (currentDate || todayStr).split('-').map(Number);
    return parts[1] || new Date().getMonth() + 1;
  });

  const [recordedDates, setRecordedDates] = useState<string[]>([]);

  // Update viewYear/viewMonth when modal becomes visible or currentDate changes
  useEffect(() => {
    if (visible) {
      const parts = (currentDate || todayStr).split('-').map(Number);
      if (parts[0] && parts[1]) {
        setViewYear(parts[0]);
        setViewMonth(parts[1]);
      }
    }
  }, [visible, currentDate, todayStr]);

  // Load recorded dates with timeline entries for the current viewing month
  useEffect(() => {
    if (visible) {
      const ymStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}`;
      const dates = getRecordedDatesForMonth(ymStr);
      setRecordedDates(dates);
    }
  }, [visible, viewYear, viewMonth]);

  const handlePrevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayPress = (dayItem: CalendarDayItem) => {
    Haptics.selectionAsync();
    onSelectDate(dayItem.dateStr);
    onClose();
  };

  const handleJumpToToday = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const now = new Date();
    const today = getTodayStr(now);
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth() + 1);
    onSelectDate(today);
    onClose();
  };

  // Generate calendar days grid (including padding for full weeks)
  const calendarDays = useMemo(() => {
    const days: CalendarDayItem[] = [];

    // First day of current month (0: Sun, 1: Mon, ..., 6: Sat)
    const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
    // Total days in current month
    const daysInCurrentMonth = new Date(viewYear, viewMonth, 0).getDate();
    // Total days in previous month
    const daysInPrevMonth = new Date(viewYear, viewMonth - 1, 0).getDate();

    // 1. Previous month trailing days
    const prevYear = viewMonth === 1 ? viewYear - 1 : viewYear;
    const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dateStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(prevYear, prevMonth - 1, day).getDay();
      days.push({
        year: prevYear,
        month: prevMonth,
        day,
        dateStr,
        isCurrentMonth: false,
        dayOfWeek,
      });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(viewYear, viewMonth - 1, d).getDay();
      days.push({
        year: viewYear,
        month: viewMonth,
        day: d,
        dateStr,
        isCurrentMonth: true,
        dayOfWeek,
      });
    }

    // 3. Next month leading days to complete a fixed 6-week (42 days) grid
    // Every month always has exactly 42 cells (6 rows) so modal height and left/right indicators NEVER shift!
    const TOTAL_CELLS = 42;
    const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear;
    const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1;
    const remaining = TOTAL_CELLS - days.length;
    for (let d = 1; d <= remaining; d++) {
      const dateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(nextYear, nextMonth - 1, d).getDay();
      days.push({
        year: nextYear,
        month: nextMonth,
        day: d,
        dateStr,
        isCurrentMonth: false,
        dayOfWeek,
      });
    }

    return days;
  }, [viewYear, viewMonth]);

  const now = new Date();
  const isViewingCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.backdropContainer}>
        {/* Tap outside to dismiss */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdropOverlay} />
        </TouchableWithoutFeedback>

        {/* Bottom Sheet Modal */}
        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: cardBg,
              borderColor,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}>
          {/* Top handle pill */}
          <View style={styles.dragHandle} />

          {/* Header Row: Month Navigator & Close */}
          <View style={styles.headerRow}>
            <View style={styles.monthControls}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={styles.arrowButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="이전 달">
                <ChevronLeft size={22} color={textColor} />
              </TouchableOpacity>

              <View style={styles.monthTitleWrapper}>
                <Text style={[styles.monthTitleText, { color: textColor }]}>
                  {viewYear}년 {viewMonth}월
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleNextMonth}
                style={styles.arrowButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="다음 달">
                <ChevronRight size={22} color={textColor} />
              </TouchableOpacity>
            </View>

            <View style={styles.headerRightButtons}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setViewYear(now.getFullYear());
                  setViewMonth(now.getMonth() + 1);
                }}
                style={[
                  styles.currentMonthBadge,
                  {
                    backgroundColor: hexToRgba(mainTheme, 0.12),
                    borderColor: hexToRgba(mainTheme, 0.25),
                    opacity: isViewingCurrentMonth ? 0 : 1,
                  },
                ]}
                disabled={isViewingCurrentMonth}
                activeOpacity={0.7}>
                <Text style={[styles.currentMonthBadgeText, { color: mainTheme }]}>
                  이번달
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="닫기">
                <X size={20} color={subTextColor} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Weekday Names Header */}
          <View style={styles.weekdaysRow}>
            {DAYS_LABEL.map((label, idx) => {
              const isSun = idx === 0;
              const isSat = idx === 6;
              const dayColor = isSun
                ? '#EF4444'
                : isSat
                ? '#3B82F6'
                : subTextColor;

              return (
                <View key={label} style={styles.weekdayCell}>
                  <Text style={[styles.weekdayText, { color: dayColor }]}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Calendar Day Grid */}
          <View style={styles.gridContainer}>
            {calendarDays.map((item) => {
              const isSelected = item.dateStr === currentDate;
              const isToday = item.dateStr === todayStr;
              const hasRecords = recordedDates.includes(item.dateStr);

              // Day text color
              let dayTextColor = textColor;
              if (isSelected) {
                dayTextColor = '#FFFFFF';
              } else if (!item.isCurrentMonth) {
                dayTextColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.22)';
              } else if (item.dayOfWeek === 0) {
                dayTextColor = '#EF4444'; // Sunday
              } else if (item.dayOfWeek === 6) {
                dayTextColor = '#3B82F6'; // Saturday
              }

              return (
                <TouchableOpacity
                  key={item.dateStr}
                  style={styles.dayCell}
                  activeOpacity={0.65}
                  onPress={() => handleDayPress(item)}>
                  <View
                    style={[
                      styles.dayCircle,
                      isSelected && {
                        backgroundColor: mainTheme,
                        shadowColor: mainTheme,
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.35,
                        shadowRadius: 4,
                        elevation: 3,
                      },
                      isToday &&
                        !isSelected && {
                          borderWidth: 1.5,
                          borderColor: mainTheme,
                        },
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        { color: dayTextColor },
                        (isSelected || isToday) && styles.boldDayText,
                      ]}>
                      {item.day}
                    </Text>

                    {/* Entry indicator dot */}
                    {hasRecords && (
                      <View
                        style={[
                          styles.recordDot,
                          {
                            backgroundColor: isSelected ? '#FFFFFF' : mainTheme,
                          },
                        ]}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Bottom Action Row: Go to Today */}
          <View style={[styles.footerRow, { borderTopColor: borderColor }]}>
            <TouchableOpacity
              onPress={handleJumpToToday}
              style={[
                styles.todayActionButton,
                {
                  backgroundColor: hexToRgba(mainTheme, 0.12),
                  borderColor: hexToRgba(mainTheme, 0.28),
                },
              ]}
              activeOpacity={0.75}>
              <RotateCcw size={15} color={mainTheme} style={{ marginRight: 6 }} />
              <Text style={[styles.todayActionText, { color: mainTheme }]}>
                오늘 날짜로 이동 ({todayStr})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(150, 150, 150, 0.45)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrowButton: {
    padding: 6,
    borderRadius: 18,
  },
  monthTitleWrapper: {
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitleText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentMonthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  currentMonthBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    padding: 6,
    borderRadius: 18,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    marginBottom: 6,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    fontSize: 13,
    fontWeight: '600',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 4,
  },
  dayCell: {
    width: '14.28%', // 100% / 7
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
  },
  boldDayText: {
    fontWeight: '700',
  },
  recordDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    position: 'absolute',
    bottom: 4,
  },
  footerRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  todayActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  todayActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
