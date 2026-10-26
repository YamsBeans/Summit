import { useMemo } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/theme/ThemeContext";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const screenOptions = useMemo(() => ({
    headerShown: false,
    tabBarStyle: {
      backgroundColor: colors.tabBar,
      borderTopWidth: 1,
      borderTopColor: colors.tabBarBorder,
      height: 60 + insets.bottom,
      paddingBottom: insets.bottom + 8,
      paddingTop: 8,
    },
    tabBarActiveTintColor: colors.primary,
    tabBarInactiveTintColor: colors.textTertiary,
    tabBarLabelStyle: {
      fontSize: 12,
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
        name="routines"
        options={{
          title: "Routines",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "list" : "list-outline"} size={24} color={color} />
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