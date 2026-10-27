import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const getStorage = () => {
  if (Platform.OS === "web") {
    return undefined; // uses localStorage by default on web
  }
  // Only import AsyncStorage on native
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  return AsyncStorage;
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});