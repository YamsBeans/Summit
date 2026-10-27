import React, { createContext, useContext, useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type ThemeMode = "light" | "dark" | "system";

type ThemeColors = {
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  primaryLight: string;
  border: string;
  borderLight: string;
  danger: string;
  dangerLight: string;
  success: string;
  successLight: string;
  warning: string;
  warningLight: string;
  tabBar: string;
  tabBarBorder: string;
  inputBackground: string;
  cardBackground: string;
  headerBackground: string;
};

const lightColors: ThemeColors = {
  background: "#f0f2f8",
  surface: "#ffffff",
  surfaceSecondary: "#f4f5fb",
  text: "#0f1117",
  textSecondary: "#6b7280",
  textTertiary: "#9ca3af",
  primary: "#5046e5",
  primaryLight: "#ede9fe",
  border: "#e2e4ef",
  borderLight: "#f0f2f8",
  danger: "#dc2626",
  dangerLight: "#fef2f2",
  success: "#16a34a",
  successLight: "#f0fdf4",
  warning: "#d97706",
  warningLight: "#fef3c7",
  tabBar: "#ffffff",
  tabBarBorder: "#e2e4ef",
  inputBackground: "#ffffff",
  cardBackground: "#ffffff",
  headerBackground: "#ffffff",
};

const darkColors: ThemeColors = {
  background: "#0a0a0f",
  surface: "#16161e",
  surfaceSecondary: "#1e1e28",
  text: "#f1f1f8",
  textSecondary: "#8a8aa0",
  textTertiary: "#5a5a70",
  primary: "#7c6fef",
  primaryLight: "#2a1f6a",
  border: "#2a2a38",
  borderLight: "#1e1e28",
  danger: "#ff453a",
  dangerLight: "#3d1412",
  success: "#30d158",
  successLight: "#0d3320",
  warning: "#ffd60a",
  warningLight: "#3d2e00",
  tabBar: "#0a0a0f",
  tabBarBorder: "#2a2a38",
  inputBackground: "#1e1e28",
  cardBackground: "#16161e",
  headerBackground: "#0a0a0f",
};

type ThemeContextType = {
  colors: ThemeColors;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  colors: lightColors,
  mode: "system",
  isDark: false,
  setMode: () => {},
});

const THEME_STORAGE_KEY = "@gym_tracker_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setModeState(stored);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
  };

  const isDark =
    mode === "dark" || (mode === "system" && systemScheme === "dark");

  const colors = isDark ? darkColors : lightColors;

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ colors, mode, isDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}