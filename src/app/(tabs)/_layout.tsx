import { Tabs } from 'expo-router';
import { Clock, CheckSquare, BarChart2, Settings } from 'lucide-react-native';
import { FluidTabBar } from '@/components/FluidTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FluidTabBar {...props} />}
      screenOptions={{
        headerShown: false,
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
