import { useMemo } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";
import { TAB_BAR_HEIGHT } from "@/components/MinimizedWorkoutBar";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const screenOptions = useMemo(() => ({
    headerShown: false,
    sceneContainerStyle: { backgroundColor: colors.background },
    tabBarStyle: {
      backgroundColor: colors.tabBar,
      borderTopWidth: 1,
      borderTopColor: colors.tabBarBorder,
      // Each tab item needs ~54px (5px padding + 28px icon box + 16px label +
      // 5px padding). The old 60px bar with 8px padding top and bottom left 44px
      // and squashed/clipped the labels.
      height: TAB_BAR_HEIGHT + insets.bottom,
      paddingBottom: Math.max(insets.bottom, 4),
      paddingTop: 4,
    },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textTertiary,
    tabBarLabelStyle: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600" as const,
    },
  }), [colors, insets.bottom]);

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Workouts",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "barbell" : "barbell-outline"} size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}