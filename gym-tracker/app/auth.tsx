import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";

export default function AuthScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"signIn" | "signUp" | "resetPassword">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);

  const syncStoredUserId = async () => {
    const result = await db.getUser();
    if ("error" in result && result.error) {
      return;
    }

    const currentUserId: string | undefined = result.data?.user?.id;
    if (currentUserId) {
      await AsyncStorage.setItem("userId", currentUserId);
    }
  };

  useEffect(() => {
    syncStoredUserId().catch((syncError) => {
      console.error("Failed to sync stored user id:", syncError);
    });
  }, []);

  useEffect(() => {
    if (resetCooldown <= 0) return;
    const timer = setInterval(() => {
      setResetCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetCooldown]);

  const handleSubmit = async () => {
    if (mode === "resetPassword") {
      if (!password.trim()) {
        setError("Please enter a new password.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      setLoading(true);
      setError(null);
      setInfo(null);

      try {
        const { error: changePasswordError } = await db.changePassword(password);
        if (changePasswordError) {
          setError(changePasswordError.message ?? "Failed to reset password.");
          return;
        }
        setInfo("Password reset successful. You can now sign in.");
        setPassword("");
        setConfirmPassword("");
        setMode("signIn");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }
    if (mode === "signUp" && !username.trim()) {
      setError("Username is required.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "signIn") {
        const { error: signInError } = await db.signIn(email.trim(), password);
        if (signInError) {
          setError(signInError.message ?? "Failed to sign in.");
          return;
        }
      } else {
        const { error: signUpError } = await db.signUp(email.trim(), password, username.trim());
        if (signUpError) {
          setError(signUpError.message ?? "Failed to create account.");
          return;
        }
      }
      await syncStoredUserId();
      router.replace("/(tabs)");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (resetCooldown > 0) {
      setError(`Please wait ${resetCooldown}s before requesting another reset email.`);
      setInfo(null);
      return;
    }

    if (!email.trim()) {
      setError("Enter your email first to reset your password.");
      setInfo(null);
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const redirectTo =
        Platform.OS === "web" && typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : "gymtracker://reset-password";

      const { error: resetError } = await db.requestPasswordReset(email.trim(), redirectTo);
      if (resetError) {
        const message = resetError.message ?? "Failed to send reset email.";
        if (message.toLowerCase().includes("rate limit")) {
          setError("Too many reset requests. Please wait a minute and try again.");
          setResetCooldown(60);
          return;
        }
        setError(message);
        return;
      }

      setInfo("Password reset email sent. Check your inbox for the reset link.");
      setResetCooldown(60);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>Welcome to Summit</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {mode === "signIn"
            ? "Sign in to continue"
            : mode === "signUp"
            ? "Create an account to start tracking"
            : "Set your new password"}
        </Text>

        <View style={styles.form}>
          {mode === "signUp" && (
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
              placeholder="Username"
              placeholderTextColor={colors.textTertiary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
          )}
          {mode !== "resetPassword" && (
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
              placeholder="Email"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          )}
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
            placeholder={mode === "resetPassword" ? "New Password" : "Password"}
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {mode === "resetPassword" && (
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBackground }]}
              placeholder="Confirm New Password"
              placeholderTextColor={colors.textTertiary}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          )}
          {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
          {info && <Text style={[styles.info, { color: colors.success }]}>{info}</Text>}

          {mode === "signIn" && (
            <Pressable
              style={({ pressed }) => [styles.forgotPasswordButton, pressed && { opacity: 0.75 }]}
              onPress={handleForgotPassword}
              disabled={loading || resetCooldown > 0}
            >
              <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>
                {resetCooldown > 0 ? `Forgot password? (${resetCooldown}s)` : "Forgot password?"}
              </Text>
            </Pressable>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
              loading && { opacity: 0.6 },
            ]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {mode === "signIn" ? "Sign In" : mode === "signUp" ? "Create Account" : "Update Password"}
              </Text>
            )}
          </Pressable>

          {mode !== "resetPassword" && (
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.75 }]}
              onPress={() => {
                setMode((prev) => (prev === "signIn" ? "signUp" : "signIn"));
                setError(null);
                setInfo(null);
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.textSecondary }]}>
                {mode === "signIn" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 28,
  },
  form: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    fontSize: 13,
    marginTop: 2,
  },
  info: {
    fontSize: 13,
    marginTop: 2,
  },
  forgotPasswordButton: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    minHeight: 40,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
