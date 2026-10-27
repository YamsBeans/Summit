import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
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

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (mode === "signup") {
      const { error } = await db.signUp(email, password, username);
      if (error) setError(error.message);
      else setSuccess("Account created! You can now sign in.");
    } else if (mode === "signin") {
      const { error } = await db.signIn(email, password);
      if (error) setError(error.message);
    } else if (mode === "forgot-password") {
      const { error } = await db.resetPassword(email);
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
          keyboardType="email-address"
          returnKeyType="next"
        />

        {(mode === "signin" || mode === "signup") && (
          <TextInput
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBackground, color: colors.text }]}
            placeholder="Password"
            placeholderTextColor={colors.textTertiary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        )}

        {mode === "signin" && (
          <Pressable onPress={() => switchMode("forgot-password")} style={styles.forgotLink}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Forgot password?</Text>
          </Pressable>
        )}

        {error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {success && <Text style={{ color: colors.success }}>{success}</Text>}

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
  container: { flexGrow: 1, padding: 16, paddingTop: 100, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 },
  offlineText: { textAlign: "center", fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  button: { paddingVertical: 12, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  switchText: { textAlign: "center", marginTop: 8 },
  forgotLink: { alignSelf: "flex-end" },
  linkText: { fontSize: 14 },
});
