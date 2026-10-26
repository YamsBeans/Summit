import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { db } from "@/backend/db";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";

function RootNav() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();

  useEffect(() => {
    db.getSession().then((result: any) => {
      setSession(result?.data?.session ?? null);
      setLoading(false);
    });

    const result = db.onAuthStateChange(
      (_event: string, nextSession: any) => {
        setSession(nextSession);
      }
    );

    const subscription = result?.data?.subscription;

    return () => {
      if (subscription?.unsubscribe) {
        subscription.unsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthScreen = segments[0] === "auth";
    const inResetPasswordScreen = segments[0] === "reset-password";
    const inPublicRoute = inAuthScreen || inResetPasswordScreen;

    if (!session && !inPublicRoute) {
      router.replace("/auth");
      return;
    }

    if (session && inAuthScreen) {
      router.replace("/(tabs)");
    }
  }, [loading, router, segments, session]);

  if (loading) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="settings" options={{ animation: "slide_from_bottom", animationDuration: 280 }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNav />
    </ThemeProvider>
  );
}