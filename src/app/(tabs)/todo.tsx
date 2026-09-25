import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
} from 'react-native';
import { showAlert } from '@/services/alert';
import {
  Plus,
  Check,
  Circle,
  Flame,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAppStore, Todolist } from '@/store/store';
import { hexToRgba } from '@/utils/colorHelper';
import { AppBackground } from '@/components/AppBackground';
import {
  RoutineItem,
  calculateStreak,
  isRoutineCompletedOnDate,
  formatRepeatDays,
  PRESET_EMOJIS,
  DAYS_LABEL,
  getTodayStr,
  getSuggestedEmoji,
} from '@/utils/routineHelper';

export default function TodoScreen() {
  const {
    bgTheme,
    bubbleTheme,
    panelTheme,
    mainTheme,
    bgTextMode,
    panelTextMode,
    glassmorphismMode,
    todos,
    routines,
    addTodo,
    addSubTodo,
    toggleTodo,
    removeTodo,
    clearCompleted,
    addRoutine,
    toggleRoutine,
    removeRoutine,
  } = useAppStore();

  // Modals
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [subTodoInputs, setSubTodoInputs] = useState<string[]>(['']);

  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineEmoji, setRoutineEmoji] = useState('✨');
  const [routineDays, setRoutineDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // Expanded sub-todos
  const [expandedTodoIds, setExpandedTodoIds] = useState<Record<string, boolean>>({});
  // Inline sub-todo input
  const [inlineSubText, setInlineSubText] = useState<Record<string, string>>({});

  const isBgDark = bgTextMode === 'light';
  const textColor = isBgDark ? '#F8FAFC' : '#0F172A';
  const subTextColor = isBgDark ? '#94A3B8' : '#64748B';

  const isPanelDark = panelTextMode === 'light';
  const cardTextColor = isPanelDark ? '#F8FAFC' : '#0F172A';
  const cardSubTextColor = isPanelDark ? '#94A3B8' : '#64748B';

  const cardBg = glassmorphismMode ? hexToRgba(panelTheme, 0.85) : panelTheme;

  const todayStr = getTodayStr();

  // Toggle todo with haptic feedback
  const handleToggleTodo = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggleTodo(id);
  };

  // Toggle routine with haptic feedback
  const handleToggleRoutine = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    toggleRoutine(id, todayStr);
  };

  // Add Todo submit
  const handleCreateTodo = () => {
    if (!newTodoText.trim()) return;
    const subs = subTodoInputs.filter((s) => s.trim() !== '');
    addTodo(newTodoText.trim(), subs);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNewTodoText('');
    setSubTodoInputs(['']);
    setIsTodoModalOpen(false);
  };

  // Add Routine submit
  const handleCreateRoutine = () => {
    if (!routineTitle.trim()) return;
    addRoutine(routineTitle.trim(), routineEmoji, routineDays);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRoutineTitle('');
    setRoutineEmoji('✨');
    setRoutineDays([0, 1, 2, 3, 4, 5, 6]);
    setIsRoutineModalOpen(false);
  };

  const toggleDaySelection = (dayIndex: number) => {
    if (routineDays.includes(dayIndex)) {
      if (routineDays.length === 1) {
        showAlert('알림', '최소 하루 이상 선택해야 합니다.');
        return;
      }
      setRoutineDays(routineDays.filter((d) => d !== dayIndex));
    } else {
      setRoutineDays([...routineDays, dayIndex].sort((a, b) => a - b));
    }
  };

  const confirmDeleteRoutine = (id: string, title: string) => {
    showAlert('루틴 삭제', `'${title}' 루틴을 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          removeRoutine(id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const confirmDeleteTodo = (id: string, text: string) => {
    showAlert('할 일 삭제', `'${text}' 항목을 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          removeTodo(id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
      },
    ]);
  };

  const toggleAccordion = (id: string) => {
    setExpandedTodoIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddInlineSub = (parentId: string) => {
    const text = (inlineSubText[parentId] || '').trim();
    if (!text) return;
    addSubTodo(parentId, text);
    setInlineSubText((prev) => ({ ...prev, [parentId]: '' }));
    setExpandedTodoIds((prev) => ({ ...prev, [parentId]: true }));
  };

  return (
    <AppBackground style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* =========================================
            1. 습관 루틴 (Routines) Section
           ========================================= */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Flame size={20} color="#F97316" />
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: textColor,
                  textShadowColor: isBgDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2,
                },
              ]}>
              오늘의 루틴
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addSmallBtn, { borderColor: mainTheme }]}
            onPress={() => setIsRoutineModalOpen(true)}>
            <Plus size={16} color={mainTheme} />
            <Text style={[styles.addSmallBtnText, { color: mainTheme }]}>루틴 추가</Text>
          </TouchableOpacity>
        </View>

        {routines.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.emptyCardText, { color: cardSubTextColor }]}>
              등록된 루틴이 없습니다.{'\n'}매일 실천할 작은 습관을 등록해보세요! 💧
            </Text>
          </View>
        ) : (
          <View style={styles.routineList}>
            {routines.map((item) => {
              const isDone = isRoutineCompletedOnDate(item, todayStr);
              const streak = calculateStreak(item.completedDates, item.repeatDays);

              return (
                <View key={item.id} style={[styles.routineCard, { backgroundColor: cardBg }]}>
                  <TouchableOpacity
                    style={styles.routineLeft}
                    onPress={() => handleToggleRoutine(item.id)}>
                    <Text style={styles.routineEmoji}>{item.icon}</Text>
                    <View style={styles.routineInfo}>
                      <Text
                        style={[
                          styles.routineTitle,
                          {
                            color: cardTextColor,
                            textShadowColor: isPanelDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                            textShadowOffset: { width: 0, height: 0.5 },
                            textShadowRadius: 1,
                          },
                          isDone && styles.completedText,
                        ]}>
                        {item.title}
                      </Text>
                      <View style={styles.routineMetaRow}>
                        <Text style={[styles.routineDays, { color: cardSubTextColor }]}>
                          {formatRepeatDays(item.repeatDays)}
                        </Text>
                        {streak > 0 && (
                          <View style={styles.streakBadge}>
                            <Flame size={12} color="#EA580C" />
                            <Text style={styles.streakText}>{streak}일 연속</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.routineRight}>
                    <TouchableOpacity
                      onPress={() => handleToggleRoutine(item.id)}
                      style={[
                        styles.checkCircle,
                        isDone ? { backgroundColor: mainTheme, borderColor: mainTheme } : { borderColor: cardSubTextColor },
                      ]}>
                      {isDone && <Check size={16} color="#FFFFFF" />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDeleteRoutine(item.id, item.title)}
                      style={styles.deleteRoutineBtn}>
                      <Trash2 size={16} color={cardSubTextColor} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* =========================================
            2. 할 일 목록 (Todos) Section
           ========================================= */}
        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>할 일 목록</Text>
            <Text style={[styles.badgeCount, { backgroundColor: cardBg, color: mainTheme }]}>
              {todos.filter((t) => t.completed).length}/{todos.length}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {todos.some((t) => t.completed) && (
              <TouchableOpacity onPress={clearCompleted} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>완료 정리</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.addSmallBtn, { borderColor: mainTheme }]}
              onPress={() => setIsTodoModalOpen(true)}>
              <Plus size={16} color={mainTheme} />
              <Text style={[styles.addSmallBtnText, { color: mainTheme }]}>할 일 추가</Text>
            </TouchableOpacity>
          </View>
        </View>

        {todos.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.emptyCardText, { color: cardSubTextColor }]}>
              할 일이 없습니다.{'\n'}새로운 할 일을 추가하고 오늘 하루를 알차게 채워보세요! ✨
            </Text>
          </View>
        ) : (
          <View style={styles.todoList}>
            {todos.map((todo) => {
              const isExpanded = expandedTodoIds[todo.id];
              const totalSubs = todo.subTodos.length;
              const doneSubs = todo.subTodos.filter((s) => s.completed).length;
              const subPercent = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : null;

              return (
                <View key={todo.id} style={[styles.todoCard, { backgroundColor: cardBg }]}>
                  {/* Main Todo Row */}
                  <View style={styles.todoMainRow}>
                    <TouchableOpacity
                      onPress={() => {
                        if (totalSubs > 0) {
                          if (!isExpanded) {
                            toggleAccordion(todo.id);
                          }
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                          showAlert(
                            '안내',
                            todo.completed
                              ? '하위 작업을 변경하여 완료 여부를 관리할 수 있습니다.'
                              : '하위 작업을 모두 완료해야 메인 할 일이 완료됩니다.'
                          );
                          return;
                        }
                        handleToggleTodo(todo.id);
                      }}
                      style={[
                        styles.checkCircle,
                        todo.completed
                          ? { backgroundColor: mainTheme, borderColor: mainTheme }
                          : { borderColor: cardSubTextColor },
                      ]}>
                      {todo.completed && <Check size={16} color="#FFFFFF" />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.todoContentTouchable}
                      onPress={() => totalSubs > 0 && toggleAccordion(todo.id)}>
                      <Text
                        style={[
                          styles.todoTitle,
                          {
                            color: cardTextColor,
                            textShadowColor: isPanelDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                            textShadowOffset: { width: 0, height: 0.5 },
                            textShadowRadius: 1,
                          },
                          todo.completed && styles.completedText,
                        ]}>
                        {todo.content}
                      </Text>

                      {subPercent !== null && (
                        <View style={styles.subProgressTag}>
                          <Text style={[styles.subProgressText, { color: mainTheme }]}>
                            {doneSubs}/{totalSubs} ({subPercent}%)
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    <View style={styles.todoActions}>
                      {totalSubs > 0 && (
                        <TouchableOpacity onPress={() => toggleAccordion(todo.id)}>
                          {isExpanded ? (
                            <ChevronUp size={18} color={cardSubTextColor} />
                          ) : (
                            <ChevronDown size={18} color={cardSubTextColor} />
                          )}
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => confirmDeleteTodo(todo.id, todo.content)}>
                        <Trash2 size={16} color={cardSubTextColor} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Sub-Todos Container */}
                  {isExpanded && (
                    <View style={styles.subTodosContainer}>
                      {todo.subTodos.map((sub) => (
                        <View key={sub.id} style={styles.subTodoRow}>
                          <TouchableOpacity
                            onPress={() => handleToggleTodo(sub.id)}
                            style={[
                              styles.miniCheckCircle,
                              sub.completed
                                ? { backgroundColor: mainTheme, borderColor: mainTheme }
                                : { borderColor: cardSubTextColor },
                            ]}>
                            {sub.completed && <Check size={12} color="#FFFFFF" />}
                          </TouchableOpacity>
                          <Text
                            style={[
                              styles.subTodoTitle,
                              {
                                color: cardTextColor,
                                textShadowColor: isPanelDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)',
                                textShadowOffset: { width: 0, height: 0.5 },
                                textShadowRadius: 1,
                              },
                              sub.completed && styles.completedText,
                            ]}>
                            {sub.content}
                          </Text>
                        </View>
                      ))}

                      {/* Add Inline Sub-Todo Input */}
                      <View style={styles.inlineSubInputRow}>
                        <TextInput
                          style={[styles.inlineInput, { color: cardTextColor }]}
                          placeholder="하위 작업 추가..."
                          placeholderTextColor={cardSubTextColor}
                          value={inlineSubText[todo.id] || ''}
                          onChangeText={(t) =>
                            setInlineSubText((prev) => ({ ...prev, [todo.id]: t }))
                          }
                          onSubmitEditing={() => handleAddInlineSub(todo.id)}
                        />
                        <TouchableOpacity
                          onPress={() => handleAddInlineSub(todo.id)}
                          style={styles.inlineAddBtn}>
                          <Plus size={16} color={mainTheme} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* =========================================
          3. 새 할 일 생성 모달
         ========================================= */}
      <Modal
        visible={isTodoModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsTodoModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: cardTextColor }]}>새 할 일 추가</Text>
              <TouchableOpacity onPress={() => setIsTodoModalOpen(false)}>
                <X size={22} color={cardTextColor} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[
                styles.modalInput,
                {
                  color: cardTextColor,
                  borderColor: isPanelDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                },
              ]}
              placeholder="할 일을 입력하세요..."
              placeholderTextColor={cardSubTextColor}
              value={newTodoText}
              onChangeText={setNewTodoText}
              autoFocus
            />

            <Text style={[styles.modalSubLabel, { color: cardSubTextColor }]}>하위 작업 (선택)</Text>
            {subTodoInputs.map((sub, idx) => (
              <View key={idx} style={styles.modalSubInputRow}>
                <TextInput
                  style={[
                    styles.modalSubInput,
                    {
                      color: cardTextColor,
                      borderColor: isPanelDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                    },
                  ]}
                  placeholder={`하위 항목 ${idx + 1}`}
                  placeholderTextColor={cardSubTextColor}
                  value={sub}
                  onChangeText={(val) => {
                    const next = [...subTodoInputs];
                    next[idx] = val;
                    setSubTodoInputs(next);
                  }}
                />
                {subTodoInputs.length > 1 && (
                  <TouchableOpacity
                    onPress={() => setSubTodoInputs(subTodoInputs.filter((_, i) => i !== idx))}>
                    <X size={18} color={cardSubTextColor} />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.addSubBtn}
              onPress={() => setSubTodoInputs([...subTodoInputs, ''])}>
              <Plus size={16} color={mainTheme} />
              <Text style={[styles.addSubBtnText, { color: mainTheme }]}>하위 작업 추가</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: mainTheme }]}
              onPress={handleCreateTodo}>
              <Text style={styles.submitBtnText}>저장하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* =========================================
          4. 새 루틴 생성 모달
         ========================================= */}
      <Modal
        visible={isRoutineModalOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsRoutineModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: cardTextColor }]}>새 루틴 추가</Text>
              <TouchableOpacity onPress={() => setIsRoutineModalOpen(false)}>
                <X size={22} color={cardTextColor} />
              </TouchableOpacity>
            </View>

            {/* Title Input */}
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: cardTextColor,
                  borderColor: isPanelDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                },
              ]}
              placeholder="루틴 이름 (예: 물 2L 마시기, 러닝)"
              placeholderTextColor={cardSubTextColor}
              value={routineTitle}
              onChangeText={(text) => {
                setRoutineTitle(text);
                const suggested = getSuggestedEmoji(text);
                if (suggested !== '✨') setRoutineEmoji(suggested);
              }}
              autoFocus
            />

            {/* Emoji Selector */}
            <Text style={[styles.modalSubLabel, { color: cardSubTextColor }]}>이모지 선택</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.emojiScroll}>
              {PRESET_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => setRoutineEmoji(emoji)}
                  style={[
                    styles.emojiBtn,
                    routineEmoji === emoji && {
                      borderColor: mainTheme,
                      backgroundColor: 'rgba(59,130,246,0.15)',
                    },
                  ]}>
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Repeat Days Selector */}
            <Text style={[styles.modalSubLabel, { color: cardSubTextColor }]}>반복 요일</Text>
            <View style={styles.daysRow}>
              {DAYS_LABEL.map((label, idx) => {
                const isSelected = routineDays.includes(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => toggleDaySelection(idx)}
                    style={[
                      styles.dayBtn,
                      isSelected
                        ? { backgroundColor: mainTheme }
                        : { backgroundColor: isPanelDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' },
                    ]}>
                    <Text
                      style={[
                        styles.dayBtnText,
                        isSelected ? { color: '#FFFFFF', fontWeight: '700' } : { color: cardSubTextColor },
                      ]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: mainTheme, marginTop: 24 }]}
              onPress={handleCreateRoutine}>
              <Text style={styles.submitBtnText}>루틴 등록하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  badgeCount: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  addSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addSmallBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  clearBtnText: {
    fontSize: 12,
    color: '#EF4444',
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  routineList: {
    gap: 10,
  },
  routineCard: {
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  routineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  routineEmoji: {
    fontSize: 28,
  },
  routineInfo: {
    flex: 1,
  },
  routineTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  routineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  routineDays: {
    fontSize: 12,
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
  routineRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRoutineBtn: {
    padding: 4,
  },
  todoList: {
    gap: 10,
  },
  todoCard: {
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  todoMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  todoContentTouchable: {
    flex: 1,
  },
  todoTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  completedText: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
  },
  subProgressTag: {
    marginTop: 4,
  },
  subProgressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  todoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subTodosContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    paddingLeft: 36,
    gap: 8,
  },
  subTodoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTodoTitle: {
    fontSize: 14,
  },
  inlineSubInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  inlineInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 4,
  },
  inlineAddBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalSubLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  modalSubInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalSubInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  addSubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  addSubBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emojiScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnText: {
    fontSize: 14,
  },
});
