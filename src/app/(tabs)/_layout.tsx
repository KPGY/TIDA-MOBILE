import { Tabs } from 'expo-router';
import { Clock, CheckSquare, BarChart2, Settings } from 'lucide-react-native';
import { useAppStore } from '@/store/store';
import { Platform } from 'react-native';

export default function TabsLayout() {
  const { mainTheme, panelTheme, panelTextMode } = useAppStore();
  const isDark = panelTextMode === 'light';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: mainTheme,
        tabBarInactiveTintColor: isDark ? '#94A3B8' : '#64748B',
        tabBarStyle: {
          backgroundColor: panelTheme,
          borderTopColor: isDark ? '#334155' : '#E2E8F0',
          borderTopWidth: 1,
          height: Platform.OS === 'android' ? 64 : 80,
          paddingBottom: Platform.OS === 'android' ? 10 : 25,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '타임라인',
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: '투두·루틴',
          tabBarIcon: ({ color, size }) => <CheckSquare color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: '통계',
          tabBarIcon: ({ color, size }) => <BarChart2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="setting"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
