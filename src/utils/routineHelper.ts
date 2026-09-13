export interface SubRoutine {
  id: string;
  title: string;
  completedDates?: string[];
}

export interface RoutineItem {
  id: string;
  icon: string;
  title: string;
  repeatDays: number[];
  completedDates: string[];
  order: number;
  color?: string;
  createdAt: string;
  subRoutines?: SubRoutine[];
}

export const PRESET_EMOJIS = [
  '💧',
  '💊',
  '🏃',
  '🏋️',
  '📖',
  '⏰',
  '🧹',
  '🧘',
  '💻',
  '✍️',
  '🥗',
  '☕',
  '🌿',
  '🎯',
  '💤',
  '🎨',
  '🚶',
  '🍎',
  '🚿',
  '✨',
];

export const DAYS_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 반복 요일 배열을 한글 텍스트로 포맷팅
 */
export const formatRepeatDays = (repeatDays?: number[]): string => {
  if (!repeatDays || repeatDays.length === 0 || repeatDays.length === 7) {
    return '매일';
  }
  if (
    repeatDays.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => repeatDays.includes(d))
  ) {
    return '평일 (월~금)';
  }
  if (
    repeatDays.length === 2 &&
    [0, 6].every((d) => repeatDays.includes(d))
  ) {
    return '주말 (토, 일)';
  }
  const sorted = [...repeatDays].sort((a, b) => a - b);
  return sorted.map((d) => DAYS_LABEL[d]).join('·');
};

/**
 * 오늘 날짜를 "YYYY-MM-DD" 포맷으로 반환
 */
export const getTodayStr = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * 특정 날짜에 루틴이 활성화(해당 요일)되는지 여부
 */
export const isRoutineActiveOnDay = (
  routine: RoutineItem,
  date: Date = new Date(),
): boolean => {
  if (!routine.repeatDays || routine.repeatDays.length === 0 || routine.repeatDays.length === 7) {
    return true;
  }
  const day = date.getDay();
  return routine.repeatDays.includes(day);
};

/**
 * 오늘(또는 특정 날짜) 루틴 완료 여부
 */
export const isRoutineCompletedOnDate = (
  routine: RoutineItem,
  dateStr: string = getTodayStr(),
): boolean => {
  if (!routine.completedDates) return false;
  return routine.completedDates.includes(dateStr);
};

/**
 * 연속 달성일수(Streak) 계산
 */
export const calculateStreak = (
  completedDates: string[] = [],
  repeatDays: number[] = [],
): number => {
  if (!completedDates || completedDates.length === 0) return 0;

  const completedSet = new Set(completedDates);
  const isEveryday = !repeatDays || repeatDays.length === 0 || repeatDays.length === 7;
  const isDayRequired = (d: Date) => (isEveryday ? true : repeatDays.includes(d.getDay()));

  let streak = 0;
  const checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  const todayStr = getTodayStr(checkDate);
  const isTodayDone = completedSet.has(todayStr);

  if (isTodayDone) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    if (isDayRequired(checkDate)) {
      const dateStr = getTodayStr(checkDate);
      if (completedSet.has(dateStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    if (streak > 365) break;
  }

  return streak;
};

/**
 * 키워드 기반 이모지 자동 추천
 */
export const getSuggestedEmoji = (text: string): string => {
  const t = text.trim().toLowerCase();
  if (!t) return '✨';

  if (/물|수분|워터|drink|water/.test(t)) return '💧';
  if (/영양제|약|비타민|유산균|pill|medicine|vitamin/.test(t)) return '💊';
  if (/운동|헬스|스트레칭|러닝|조깅|스쿼트|workout|gym|run|fitness/.test(t)) return '🏃';
  if (/웨이트|덤벨|쇠질|바벨/.test(t)) return '🏋️';
  if (/독서|책|공부|강의|학습|read|book|study/.test(t)) return '📖';
  if (/기상|아침|알람|wake|morning/.test(t)) return '⏰';
  if (/청소|빨래|정리|clean/.test(t)) return '🧹';
  if (/명상|마음|휴식|relax|meditat/.test(t)) return '🧘';
  if (/코딩|개발|작업|프로그래밍|code|dev/.test(t)) return '💻';
  if (/일기|기록|글쓰기|diary|write/.test(t)) return '✍️';
  if (/샐러드|식단|과일|식사|diet|salad/.test(t)) return '🥗';
  if (/커피|카페|coffee|cafe/.test(t)) return '☕';
  if (/산책|걷기|walk/.test(t)) return '🚶';
  if (/수면|취침|잠|sleep/.test(t)) return '💤';
  if (/식물|화분|꽃|plant/.test(t)) return '🌿';
  if (/목표|다짐|goal/.test(t)) return '🎯';
  if (/샤워|세안|shower/.test(t)) return '🚿';

  return '✨';
};

/**
 * 최근 N일간의 달성 도트 정보 생성
 */
export const getRecentDaysStatus = (
  routine: RoutineItem,
  daysCount: number = 7,
): { dateStr: string; label: string; isDone: boolean; isRequired: boolean }[] => {
  const result = [];
  const completedSet = new Set(routine.completedDates || []);

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getTodayStr(d);
    const dayOfWeek = d.getDay();
    const isRequired = isRoutineActiveOnDay(routine, d);
    const isDone = completedSet.has(dateStr);

    result.push({
      dateStr,
      label: DAYS_LABEL[dayOfWeek],
      isDone,
      isRequired,
    });
  }

  return result;
};

/**
 * 특정 날짜에 하위 루틴이 완료되었는지 확인
 */
export const isSubRoutineCompletedOnDate = (
  subRoutine?: { completedDates?: string[] },
  dateStr: string = getTodayStr(),
): boolean => {
  if (!subRoutine || !subRoutine.completedDates) return false;
  return subRoutine.completedDates.includes(dateStr);
};
