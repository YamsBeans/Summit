import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeContext";

type ProfileHeaderProps = {
  username: string;
  email: string;
  memberSince: string;
  avatarUrl?: string | null;
};

export default function ProfileHeader({ username, email, memberSince, avatarUrl }: ProfileHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.avatarContainer}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarInitial}>{username?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.username, { color: colors.text }]}>{username}</Text>
      <Text style={[styles.email, { color: colors.textSecondary }]}>{email}</Text>
      <Text style={[styles.memberSince, { color: colors.textTertiary }]}>Member since {memberSince}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: 24, gap: 4 },
  avatarContainer: { marginBottom: 12 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 36, fontWeight: "700", color: "#fff" },
  username: { fontSize: 22, fontWeight: "700" },
  email: { fontSize: 14 },
  memberSince: { fontSize: 12, marginTop: 2 },
});