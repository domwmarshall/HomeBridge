import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createClient,
  processLock,
  SupabaseClient,
} from "@supabase/supabase-js";
import { AppState as NativeAppState, Platform } from "react-native";

const CONFIG_KEY = "@homebridge/supabase-config-v1";

export interface SupabaseConnectionConfig {
  url: string;
  publishableKey: string;
}

export let supabase: SupabaseClient | null = null;
let appStateListener: { remove: () => void } | null = null;

function buildClient(config: SupabaseConnectionConfig) {
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  });

  if (Platform.OS !== "web") {
    appStateListener?.remove();
    appStateListener = NativeAppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
  }
  return client;
}

function normaliseConfig(
  url: string,
  publishableKey: string,
): SupabaseConnectionConfig {
  const cleanUrl = url.trim().replace(/\/$/, "");
  const cleanKey = publishableKey.trim();
  let parsed: URL;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    throw new Error("Enter a valid Supabase Project URL.");
  }
  if (parsed.protocol !== "https:")
    throw new Error("The Supabase Project URL must use HTTPS.");
  if (!cleanKey || cleanKey.length < 20)
    throw new Error(
      "Enter the publishable key from the Supabase Connect panel.",
    );
  return { url: cleanUrl, publishableKey: cleanKey };
}

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function loadSupabaseConfiguration() {
  const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const envKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (envUrl && envKey) {
    supabase = buildClient(normaliseConfig(envUrl, envKey));
    return true;
  }

  const saved = await AsyncStorage.getItem(CONFIG_KEY);
  if (!saved) return false;
  try {
    const parsed = JSON.parse(saved) as SupabaseConnectionConfig;
    const config = normaliseConfig(parsed.url, parsed.publishableKey);
    supabase = buildClient(config);
    return true;
  } catch {
    await AsyncStorage.removeItem(CONFIG_KEY);
    supabase = null;
    return false;
  }
}

export async function configureSupabase(url: string, publishableKey: string) {
  const config = normaliseConfig(url, publishableKey);
  const candidate = buildClient(config);
  const { error } = await candidate.from("households").select("id").limit(1);
  if (error) {
    await candidate.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new Error(
      error.message.includes("Could not find the table") ||
        error.message.includes("relation")
        ? "Connection reached Supabase, but the HomeBridge SQL migration has not been run yet."
        : `Supabase connection failed: ${error.message}`,
    );
  }
  supabase = candidate;
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function clearSupabaseConfiguration() {
  if (supabase)
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  supabase = null;
  await AsyncStorage.removeItem(CONFIG_KEY);
}
