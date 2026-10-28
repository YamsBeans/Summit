import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { db, isOnline } from "@/backend/db";
import { useTheme } from "@/theme/ThemeContext";

type AuthMode = "signin" | "signup" | "forgot-password";

export default function Auth() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    if (loading) return;
    // Catch the obvious mistakes before a network round trip.
    if (!email.trim()) { setError("Enter your email address."); return; }
    if (mode !== "forgot-password" && !password) { setError("Enter your password."); return; }
    if (mode === "signup" && !username.trim()) { setError("Choose a username."); return; }
    if (mode === "signup" && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (mode === "signup") {
      const { error } = await db.signUp(email.trim(), password, username.trim());
      if (error) setError(error.message);
      else setSuccess("Account created! You can now sign in.");
    } else if (mode === "signin") {
      const { error } = await db.signIn(email.trim(), password);
      if (error) setError(error.message);
    } else if (mode === "forgot-password") {
      const { error } = await db.resetPassword(email.trim());
      if (error) setError(error.message);
      else setSuccess("Password reset email sent! Check your inbox.");
    }

    setLoading(false);
  };

  const titles: Record<AuthMode, string> = {
    signin: "Welcome Back",
    signup: "Create Account",
    "forgot-password": "Reset Password",
  };

  const subtitles: Record<AuthMode, string> = {
    signin: "Log every set. Watch yourself climb.",
    signup: "Track workouts, PRs and progress in one place.",
    "forgot-password": "We'll email you a link to set a new password.",
  };

  const buttonLabels: Record<AuthMode, string> = {
    signin: "Sign In",
    signup: "Sign Up",
    "forgot-password": "Send Reset Email",
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={[styles.logoTile, { backgroundColor: colors.primaryLight }]}>
            <Image source={require("@/assets/images/summit-icon.png")} style={styles.logo} contentFit="contain" />
          </View>
          <Text style={[styles.wordmark, { color: colors.text }]}>Summit</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>{subtitles[mode]}</Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{titles[mode]}</Text>

        {!isOnline && <Text style={[styles.offlineText, { color: colors.warning }]}>⚡ Offline Mode</Text>}

        {mode === "signup" && (
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
            placeholder="Username"
            placeholderTextColor={colors.textTertiary}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            returnKeyType="next"
          />
        )}

        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
          placeholder="Email"
          placeholderTextColor={colors.textTertiary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType={mode === "forgot-password" ? "send" : "next"}
          onSubmitEditing={mode === "forgot-password" ? handleSubmit : undefined}
        />

        {(mode === "signin" || mode === "signup") && (
          <View style={[styles.passwordWrap, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
            <TextInput
              style={[styles.passwordInput, { color: colors.text }]}
              placeholder="Password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              textContentType={mode === "signup" ? "newPassword" : "password"}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              style={styles.eyeBtn}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            >
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textTertiary} />
            </Pressable>
          </View>
        )}

        {mode === "signin" && (
          <Pressable onPress={() => switchMode("forgot-password")} style={styles.forgotLink}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Forgot password?</Text>
          </Pressable>
        )}

        {error && <Text style={[styles.message, { color: colors.danger }]}>{error}</Text>}
        {success && <Text style={[styles.message, { color: colors.success }]}>{success}</Text>}

        <Pressable
          style={[styles.button, { backgroundColor: colors.primary, opacity: loading ? 0.6 : 1 }]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? "Loading..." : buttonLabels[mode]}</Text>
        </Pressable>

        {(mode === "signin" || mode === "signup") && (
          <Pressable onPress={() => switchMode(mode === "signin" ? "signup" : "signin")}>
            <Text style={[styles.switchText, { color: colors.primary }]}>
              {mode === "signup" ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
            </Text>
          </Pressable>
        )}

        {mode === "forgot-password" && (
          <Pressable onPress={() => switchMode("signin")}>
            <Text style={[styles.switchText, { color: colors.primary }]}>Back to Sign In</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 20, paddingTop: 72, gap: 12, width: "100%", maxWidth: 440, alignSelf: "center" },
  brand: { alignItems: "center", marginBottom: 20 },
  logoTile: { width: 84, height: 84, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  logo: { width: 76, height: 76 },
  wordmark: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  tagline: { fontSize: 15, marginTop: 6, textAlign: "center" },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  message: { fontSize: 14, textAlign: "center" },
  passwordWrap: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10 },
  passwordInput: { flex: 1, padding: 12, fontSize: 16 },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  offlineText: { textAlign: "center", fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  switchText: { textAlign: "center", marginTop: 8 },
  forgotLink: { alignSelf: "flex-end" },
  linkText: { fontSize: 14 },
});
