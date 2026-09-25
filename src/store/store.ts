import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getContrastMode,
  getAdaptiveBubbleTextMode,
  getAdaptivePanelTextMode,
} from '../utils/colorHelper';
import { RoutineItem, SubRoutine } from '../utils/routineHelper';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

export interface SubTodo {
  id: string;
  content: string;
  completed: boolean;
  order: number;
}

export interface Todolist {
  id: string;
  content: string;
  completed: boolean;
  subTodos: SubTodo[];
  order: number;
  color?: string;
}

export interface ThemeColors {
  bgTheme: string;
  bubbleTheme: string;
  panelTheme: string;
  mainTheme: string;
}

export interface GradientColors {
  bgThemeEnd: string;
  bubbleThemeEnd: string;
  panelThemeEnd: string;
  mainThemeEnd: string;
}

export interface SavedTheme {
  id: string;
  name: string;
  createdAt: number;
  bgTheme: string;
  bubbleTheme: string;
  panelTheme: string;
  mainTheme: string;
  bgThemeEnd: string;
  bubbleThemeEnd: string;
  panelThemeEnd: string;
  mainThemeEnd: string;
  gradientMode: boolean;
  glassmorphismMode?: boolean;
  bgAttachmentPath?: string | null;
}

export type StartPageOption = 'home' | 'todo';
export type MessageOrderOption = 'top' | 'bottom';

export interface AppState extends ThemeColors, GradientColors {
  gradientMode: boolean;
  glassmorphismMode: boolean;
  bgAttachmentPath: string | null;
  bgOpacity: number; // 0.0 ~ 1.0 (배경 오버레이 투명도)
  startPage: StartPageOption;
  messageOrder: MessageOrderOption;
  bgTextMode: 'light' | 'dark';
  bubbleTextMode: 'light' | 'dark';
  panelTextMode: 'light' | 'dark';
  mainTextMode: 'light' | 'dark';
  savedThemes: SavedTheme[];
  activeThemeId: string | null;

  // Actions
  setSingleColor: (key: keyof ThemeColors, color: string) => void;
  setSingleGradientColor: (key: keyof GradientColors, color: string) => void;
  setGradientMode: (mode: boolean) => void;
  setGlassmorphismMode: (mode: boolean) => void;
  setbgAttachmentPath: (path: string | null) => void;
  setBgOpacity: (opacity: number) => void;
  setStartPage: (page: StartPageOption) => void;
  setMessageOrder: (order: MessageOrderOption) => void;
  saveCurrentTheme: (name: string) => void;
  applySavedTheme: (id: string) => void;
  deleteSavedTheme: (id: string) => void;
  resetAll: () => void;

  // Todos
  todos: Todolist[];
  addTodo: (content: string, subContents?: string[], color?: string) => void;
  addSubTodo: (parentId: string, content: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  removeCompleteTodo: () => void;
  updateTodo: (
    id: string,
    content: string,
    subTodos: { id: string; content: string }[],
    color?: string,
  ) => void;
  clearCompleted: () => void;
  reorderTodos: (newTodos: Todolist[]) => void;

  // Routines
  routines: RoutineItem[];
  addRoutine: (
    title: string,
    icon?: string,
    repeatDays?: number[],
    color?: string,
    subRoutines?: { id?: string; title: string }[],
  ) => void;
  toggleRoutine: (id: string, dateStr?: string) => void;
  toggleSubRoutine: (
    routineId: string,
    subRoutineId: string,
    dateStr?: string,
  ) => void;
  removeRoutine: (id: string) => void;
  updateRoutine: (
    id: string,
    title: string,
    icon: string,
    repeatDays: number[],
    color?: string,
    subRoutines?: { id?: string; title: string }[],
  ) => void;
  reorderRoutines: (newRoutines: RoutineItem[]) => void;
}

const defaultColors: ThemeColors = {
  bgTheme: '#FFFFFF',
  bubbleTheme: '#1E293B',
  panelTheme: '#F8FAFC',
  mainTheme: '#3B82F6',
};

const defaultGradientColors: GradientColors = {
  bgThemeEnd: '#F1F5F9',
  bubbleThemeEnd: '#0F172A',
  panelThemeEnd: '#E2E8F0',
  mainThemeEnd: '#2563EB',
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...defaultColors,
      ...defaultGradientColors,
      gradientMode: false,
      glassmorphismMode: false,
      bgAttachmentPath: null,
      bgOpacity: 0.45,
      startPage: 'home',
      messageOrder: 'top',
      savedThemes: [],
      activeThemeId: null,
      bgTextMode: getContrastMode(defaultColors.bgTheme),
      bubbleTextMode: getAdaptiveBubbleTextMode(defaultColors.bubbleTheme, defaultColors.bgTheme, false),
      panelTextMode: getAdaptivePanelTextMode(defaultColors.panelTheme, defaultColors.bgTheme, false),
      mainTextMode: getContrastMode(defaultColors.mainTheme),

      todos: [],
      routines: [],

      setSingleColor: (key, color) => {
        set((state) => {
          const updated = { ...state, [key]: color };
          return {
            ...updated,
            bgTextMode: getContrastMode(updated.bgTheme),
            bubbleTextMode: getAdaptiveBubbleTextMode(
              updated.bubbleTheme,
              updated.bgTheme,
              updated.glassmorphismMode,
            ),
            panelTextMode: getAdaptivePanelTextMode(
              updated.panelTheme,
              updated.bgTheme,
              updated.glassmorphismMode,
            ),
            mainTextMode: getContrastMode(updated.mainTheme),
          };
        });
      },

      setSingleGradientColor: (key, color) => {
        set({ [key]: color });
      },

      setGradientMode: (mode) => set({ gradientMode: mode }),
      setGlassmorphismMode: (mode) =>
        set((state) => ({
          glassmorphismMode: mode,
          bubbleTextMode: getAdaptiveBubbleTextMode(
            state.bubbleTheme,
            state.bgTheme,
            mode,
          ),
          panelTextMode: getAdaptivePanelTextMode(
            state.panelTheme,
            state.bgTheme,
            mode,
          ),
        })),
      setbgAttachmentPath: (path) => set({ bgAttachmentPath: path }),
      setBgOpacity: (opacity) => set({ bgOpacity: opacity }),
      setStartPage: (startPage) => set({ startPage }),
      setMessageOrder: (messageOrder) => set({ messageOrder }),

      saveCurrentTheme: (name) => {
        const state = get();
        const newTheme: SavedTheme = {
          id: generateId(),
          name: name.trim() || `테마 ${state.savedThemes.length + 1}`,
          createdAt: Date.now(),
          bgTheme: state.bgTheme,
          bubbleTheme: state.bubbleTheme,
          panelTheme: state.panelTheme,
          mainTheme: state.mainTheme,
          bgThemeEnd: state.bgThemeEnd,
          bubbleThemeEnd: state.bubbleThemeEnd,
          panelThemeEnd: state.panelThemeEnd,
          mainThemeEnd: state.mainThemeEnd,
          gradientMode: state.gradientMode,
          glassmorphismMode: state.glassmorphismMode,
          bgAttachmentPath: state.bgAttachmentPath,
        };
        set({
          savedThemes: [...state.savedThemes, newTheme],
          activeThemeId: newTheme.id,
        });
      },

      applySavedTheme: (id) => {
        const target = get().savedThemes.find((t) => t.id === id);
        if (!target) return;
        const isGlass = target.glassmorphismMode ?? false;
        set({
          bgTheme: target.bgTheme,
          bubbleTheme: target.bubbleTheme,
          panelTheme: target.panelTheme,
          mainTheme: target.mainTheme,
          bgThemeEnd: target.bgThemeEnd,
          bubbleThemeEnd: target.bubbleThemeEnd,
          panelThemeEnd: target.panelThemeEnd,
          mainThemeEnd: target.mainThemeEnd,
          gradientMode: target.gradientMode,
          glassmorphismMode: isGlass,
          bgAttachmentPath: target.bgAttachmentPath ?? null,
          activeThemeId: target.id,
          bgTextMode: getContrastMode(target.bgTheme),
          bubbleTextMode: getAdaptiveBubbleTextMode(target.bubbleTheme, target.bgTheme, isGlass),
          panelTextMode: getAdaptivePanelTextMode(target.panelTheme, target.bgTheme, isGlass),
          mainTextMode: getContrastMode(target.mainTheme),
        });
      },

      deleteSavedTheme: (id) => {
        set((state) => ({
          savedThemes: state.savedThemes.filter((t) => t.id !== id),
          activeThemeId: state.activeThemeId === id ? null : state.activeThemeId,
        }));
      },

      resetAll: () => {
        set({
          ...defaultColors,
          ...defaultGradientColors,
          gradientMode: false,
          glassmorphismMode: false,
          bgAttachmentPath: null,
          bgOpacity: 0.45,
          startPage: 'home',
          messageOrder: 'top',
          savedThemes: [],
          activeThemeId: null,
          bgTextMode: getContrastMode(defaultColors.bgTheme),
          bubbleTextMode: getAdaptiveBubbleTextMode(defaultColors.bubbleTheme, defaultColors.bgTheme, false),
          panelTextMode: getAdaptivePanelTextMode(defaultColors.panelTheme, defaultColors.bgTheme, false),
          mainTextMode: getContrastMode(defaultColors.mainTheme),
          todos: [],
          routines: [],
        });
      },

      // --- 투두(Todo) 액션 ---
      addTodo: (content, subContents = [], color = 'transparent') => {
        if (!content.trim()) return;
        const newTodo: Todolist = {
          id: generateId(),
          content: content.trim(),
          completed: false,
          order: get().todos.length,
          color,
          subTodos: subContents
            .filter((sub) => sub.trim() !== '')
            .map((sub, index) => ({
              id: generateId(),
              content: sub.trim(),
              completed: false,
              order: index,
            })),
        };
        set((state) => ({ todos: [...state.todos, newTodo] }));
      },

      addSubTodo: (parentId, content) => {
        if (!content.trim()) return;
        set((state) => ({
          todos: state.todos.map((todo) => {
            if (todo.id === parentId) {
              const newSub: SubTodo = {
                id: generateId(),
                content: content.trim(),
                completed: false,
                order: todo.subTodos.length,
              };
              return {
                ...todo,
                subTodos: [...todo.subTodos, newSub],
                completed: false,
              };
            }
            return todo;
          }),
        }));
      },

      toggleTodo: (id) => {
        set((state) => ({
          todos: state.todos.map((todo) => {
            if (todo.id === id) {
              // 하위 투두가 있는 경우 메인 투두를 직접 클릭하여 완료할 수 없음 (하위 투두들의 완료 여부에 의해 결정)
              if (todo.subTodos && todo.subTodos.length > 0) {
                return todo;
              }
              const nextStatus = !todo.completed;
              return {
                ...todo,
                completed: nextStatus,
              };
            }

            const hasSub = todo.subTodos.some((sub) => sub.id === id);
            if (hasSub) {
              const updatedSubTodos = todo.subTodos.map((sub) =>
                sub.id === id ? { ...sub, completed: !sub.completed } : sub,
              );
              const allSubCompleted = updatedSubTodos.length > 0 && updatedSubTodos.every((sub) => sub.completed);
              return {
                ...todo,
                subTodos: updatedSubTodos,
                completed: allSubCompleted,
              };
            }

            return todo;
          }),
        }));
      },

      removeTodo: (id) => {
        set((state) => ({
          todos: state.todos.filter((todo) => todo.id !== id),
        }));
      },

      removeCompleteTodo: () => {
        set((state) => ({
          todos: state.todos.filter((todo) => !todo.completed),
        }));
      },

      updateTodo: (id, content, subTodos, color) => {
        set((state) => ({
          todos: state.todos.map((todo) => {
            if (todo.id === id) {
              return {
                ...todo,
                content,
                color: color !== undefined ? color : todo.color,
                subTodos: subTodos.map((s, index) => {
                  const existingSub = todo.subTodos.find((old) => old.id === s.id);
                  return {
                    id: s.id || generateId(),
                    content: s.content,
                    completed: existingSub ? existingSub.completed : false,
                    order: index,
                  };
                }),
              };
            }
            return todo;
          }),
        }));
      },

      clearCompleted: () => {
        set((state) => ({
          todos: state.todos.filter((todo) => !todo.completed),
        }));
      },

      reorderTodos: (newTodos) => {
        set({ todos: newTodos });
      },

      // --- 루틴(Routine) 액션 ---
      addRoutine: (
        title,
        icon = '✨',
        repeatDays = [0, 1, 2, 3, 4, 5, 6],
        color = 'transparent',
        subRoutines = [],
      ) => {
        if (!title.trim()) return;
        const newRoutine: RoutineItem = {
          id: generateId(),
          title: title.trim(),
          icon: icon || '✨',
          repeatDays: repeatDays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : repeatDays,
          completedDates: [],
          order: get().routines.length,
          color,
          createdAt: new Date().toISOString(),
          subRoutines: subRoutines
            .filter((s) => s.title && s.title.trim() !== '')
            .map((s) => ({
              id: s.id || generateId(),
              title: s.title.trim(),
              completedDates: [],
            })),
        };
        set((state) => ({
          routines: [...state.routines, newRoutine],
        }));
      },

      toggleRoutine: (id, dateStr) => {
        const targetDate = dateStr || new Date().toISOString().slice(0, 10);
        set((state) => ({
          routines: state.routines.map((routine) => {
            if (routine.id === id) {
              const dates = routine.completedDates || [];
              const isAlreadyDone = dates.includes(targetDate);
              const updatedDates = isAlreadyDone
                ? dates.filter((d) => d !== targetDate)
                : [...dates, targetDate];

              const updatedSubRoutines = routine.subRoutines
                ? routine.subRoutines.map((sub) => {
                    const subDates = sub.completedDates || [];
                    return {
                      ...sub,
                      completedDates: isAlreadyDone
                        ? subDates.filter((d) => d !== targetDate)
                        : subDates.includes(targetDate)
                          ? subDates
                          : [...subDates, targetDate],
                    };
                  })
                : routine.subRoutines;

              return {
                ...routine,
                completedDates: updatedDates,
                subRoutines: updatedSubRoutines,
              };
            }
            return routine;
          }),
        }));
      },

      toggleSubRoutine: (routineId, subRoutineId, dateStr) => {
        const targetDate = dateStr || new Date().toISOString().slice(0, 10);
        set((state) => ({
          routines: state.routines.map((routine) => {
            if (routine.id === routineId && routine.subRoutines) {
              const updatedSubRoutines = routine.subRoutines.map((sub) => {
                if (sub.id === subRoutineId) {
                  const dates = sub.completedDates || [];
                  const isDone = dates.includes(targetDate);
                  return {
                    ...sub,
                    completedDates: isDone
                      ? dates.filter((d) => d !== targetDate)
                      : [...dates, targetDate],
                  };
                }
                return sub;
              });

              const allDone =
                updatedSubRoutines.length > 0 &&
                updatedSubRoutines.every((sub) =>
                  (sub.completedDates || []).includes(targetDate),
                );

              const parentDates = routine.completedDates || [];
              const updatedParentDates = allDone
                ? parentDates.includes(targetDate)
                  ? parentDates
                  : [...parentDates, targetDate]
                : parentDates.filter((d) => d !== targetDate);

              return {
                ...routine,
                completedDates: updatedParentDates,
                subRoutines: updatedSubRoutines,
              };
            }
            return routine;
          }),
        }));
      },

      removeRoutine: (id) => {
        set((state) => ({
          routines: state.routines.filter((r) => r.id !== id),
        }));
      },

      updateRoutine: (id, title, icon, repeatDays, color, subRoutines) => {
        set((state) => ({
          routines: state.routines.map((routine) => {
            if (routine.id === id) {
              return {
                ...routine,
                title,
                icon,
                repeatDays,
                color: color !== undefined ? color : routine.color,
                subRoutines: (subRoutines || []).map((s) => {
                  const existing = routine.subRoutines?.find((old) => old.id === s.id);
                  return {
                    id: s.id || generateId(),
                    title: s.title,
                    completedDates: existing ? existing.completedDates : [],
                  };
                }),
              };
            }
            return routine;
          }),
        }));
      },

      reorderRoutines: (newRoutines) => {
        set({ routines: newRoutines });
      },
    }),
    {
      name: 'tida-mobile-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
