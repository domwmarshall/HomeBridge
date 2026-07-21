import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { ConnectionScreen } from "./src/screens/ConnectionScreen";
import { ChildScreen } from "./src/screens/ChildScreen";
import { HandoverScreen } from "./src/screens/HandoverScreen";
import { HouseholdSetupScreen } from "./src/screens/HouseholdSetupScreen";
import { InboxScreen } from "./src/screens/InboxScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ThingsScreen } from "./src/screens/ThingsScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { isSupabaseConfigured, loadSupabaseConfiguration } from "./src/lib/supabase";
import { AppProvider, useApp } from "./src/store/AppContext";
import { CommunicationProvider } from "./src/store/CommunicationContext";
import { AppNavigationProvider } from "./src/store/NavigationContext";
import { WorkspaceProvider, useWorkspace } from "./src/store/WorkspaceContext";
import { colours } from "./src/theme";
import { TabKey } from "./src/types";

const TAB_STORAGE_KEY = "@homebridge/active-tab-v1";

function AppShell() {
  const [tab, setTab] = useState<TabKey>("today");
  const { state } = useApp();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TAB_STORAGE_KEY)
      .then((saved) => {
        if (
          saved === "today" ||
          saved === "calendar" ||
          saved === "things" ||
          saved === "handover" ||
          saved === "child" ||
          saved === "inbox"
        ) {
          setTab(saved);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(TAB_STORAGE_KEY, tab);
  }, [tab]);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    const openNotification = (response: Notifications.NotificationResponse | null) => {
      const screen = response?.notification.request.content.data?.screen;
      if (
        screen === "today" ||
        screen === "calendar" ||
        screen === "things" ||
        screen === "handover" ||
        screen === "child" ||
        screen === "inbox"
      ) {
        setTab(screen);
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(openNotification);
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => subscription.remove();
  }, []);

  const tabs: Array<{ key: Exclude<TabKey, "inbox">; label: string; icon: string }> = [
    { key: "today", label: "Today", icon: "⌂" },
    { key: "calendar", label: "Calendar", icon: "▦" },
    { key: "things", label: "Things", icon: "▣" },
    { key: "handover", label: "Handover", icon: "⇄" },
    { key: "child", label: state.child.name, icon: state.child.initials },
  ];

  const screen: Record<TabKey, React.ReactNode> = {
    today: <TodayScreen navigate={setTab} />,
    calendar: <CalendarScreen />,
    things: <ThingsScreen />,
    handover: <HandoverScreen />,
    child: <ChildScreen />,
    inbox: <InboxScreen navigate={setTab} />,
  };

  const tabBottom = Math.max(insets.bottom, 10);

  return (
    <AppNavigationProvider tab={tab} navigate={setTab}>
      <View style={[styles.safe, { paddingTop: Math.max(insets.top, 8) }]}>
        <StatusBar style="dark" />
        <View
          style={[
            styles.screen,
            { paddingBottom: keyboardVisible ? 0 : tabBottom + 82 },
          ]}
        >
          {screen[tab]}
        </View>
        {!keyboardVisible ? (
        <View style={[styles.tabBar, { bottom: tabBottom }]}>
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Text style={[styles.icon, active && styles.iconActive]}>{item.icon}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        ) : null}
      </View>
    </AppNavigationProvider>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <SafeAreaView style={styles.loading}>
      <StatusBar style="dark" />
      <ActivityIndicator size="large" color={colours.tealDark} />
      <Text style={styles.loadingText}>{label}</Text>
    </SafeAreaView>
  );
}

function WorkspaceGate() {
  const { loading, workspace } = useWorkspace();
  if (loading) return <LoadingScreen label="Opening your shared household…" />;
  if (!workspace) return <HouseholdSetupScreen />;
  return (
    <AppProvider workspace={workspace}>
      <CommunicationProvider workspace={workspace}>
        <AppShell />
      </CommunicationProvider>
    </AppProvider>
  );
}

function Root({ onConnected }: { onConnected: () => void }) {
  const { loading, session } = useAuth();
  const [localDemo, setLocalDemo] = useState(false);
  if (localDemo) {
    return (
      <AppProvider>
        <CommunicationProvider>
          <AppShell />
        </CommunicationProvider>
      </AppProvider>
    );
  }
  if (!isSupabaseConfigured()) {
    return <ConnectionScreen onUseDemo={() => setLocalDemo(true)} onConnected={onConnected} />;
  }
  if (loading) return <LoadingScreen label="Checking your secure session…" />;
  if (!session) return <AuthScreen onUseDemo={() => setLocalDemo(true)} />;
  return (
    <WorkspaceProvider>
      <WorkspaceGate />
    </WorkspaceProvider>
  );
}

function HomeBridgeApp() {
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [configurationVersion, setConfigurationVersion] = useState(0);
  useEffect(() => {
    loadSupabaseConfiguration().finally(() => setConfigurationLoaded(true));
  }, []);
  if (!configurationLoaded) return <LoadingScreen label="Preparing HomeBridge…" />;
  return (
    <AuthProvider key={configurationVersion}>
      <Root onConnected={() => setConfigurationVersion((value) => value + 1)} />
    </AuthProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <HomeBridgeApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colours.background },
  screen: { flex: 1 },
  tabBar: {
    position: "absolute",
    left: 12,
    right: 12,
    height: 74,
    borderRadius: 24,
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
    flexDirection: "row",
    paddingHorizontal: 5,
    paddingVertical: 5,
    shadowColor: colours.shadow,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 9,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 },
  iconWrap: { width: 34, height: 30, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconWrapActive: { backgroundColor: colours.tealSoft },
  icon: { color: colours.muted, fontSize: 18, fontWeight: "900" },
  iconActive: { color: colours.tealDark },
  label: { width: "100%", paddingHorizontal: 2, color: colours.muted, fontSize: 9, fontWeight: "700", marginTop: 3, textAlign: "center" },
  labelActive: { color: colours.tealDark, fontWeight: "900" },
  loading: { flex: 1, backgroundColor: colours.background, alignItems: "center", justifyContent: "center", padding: 28 },
  loadingText: { color: colours.muted, fontSize: 14, marginTop: 16, textAlign: "center" },
});
