import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { EvaScreen } from './src/screens/EvaScreen';
import { HandoverScreen } from './src/screens/HandoverScreen';
import { HouseholdSetupScreen } from './src/screens/HouseholdSetupScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { ThingsScreen } from './src/screens/ThingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { isSupabaseConfigured, loadSupabaseConfiguration } from './src/lib/supabase';
import { AppProvider } from './src/store/AppContext';
import { WorkspaceProvider, useWorkspace } from './src/store/WorkspaceContext';
import { colours } from './src/theme';
import { TabKey } from './src/types';

const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'today', label: 'Today', icon: '⌂' },
  { key: 'calendar', label: 'Calendar', icon: '▦' },
  { key: 'things', label: 'Things', icon: '◇' },
  { key: 'handover', label: 'Handover', icon: '↔' },
  { key: 'eva', label: 'Eva', icon: '●' },
];

function AppShell() {
  const [tab, setTab] = useState<TabKey>('today');
  const screen = {
    today: <TodayScreen navigate={setTab} />,
    calendar: <CalendarScreen />,
    things: <ThingsScreen />,
    handover: <HandoverScreen />,
    eva: <EvaScreen />,
  }[tab];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.screen}>{screen}</View>
      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={styles.tab} accessibilityRole="button" accessibilityState={{ selected: active }}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive]}><Text style={[styles.icon, active && styles.iconActive]}>{item.icon}</Text></View>
              <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return <SafeAreaView style={styles.loading}><StatusBar style="dark" /><ActivityIndicator size="large" color={colours.tealDark} /><Text style={styles.loadingText}>{label}</Text></SafeAreaView>;
}

function WorkspaceGate() {
  const { loading, workspace } = useWorkspace();
  if (loading) return <LoadingScreen label="Opening your shared household…" />;
  if (!workspace) return <HouseholdSetupScreen />;
  return <AppProvider workspace={workspace}><AppShell /></AppProvider>;
}

function Root({ onConnected }: { onConnected: () => void }) {
  const { loading, session } = useAuth();
  const [localDemo, setLocalDemo] = useState(false);

  if (localDemo) return <AppProvider><AppShell /></AppProvider>;
  if (!isSupabaseConfigured()) return <ConnectionScreen onUseDemo={() => setLocalDemo(true)} onConnected={onConnected} />;
  if (loading) return <LoadingScreen label="Checking your secure session…" />;
  if (!session) return <AuthScreen onUseDemo={() => setLocalDemo(true)} />;
  return <WorkspaceProvider><WorkspaceGate /></WorkspaceProvider>;
}

export default function App() {
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [configurationVersion, setConfigurationVersion] = useState(0);

  useEffect(() => {
    loadSupabaseConfiguration().finally(() => setConfigurationLoaded(true));
  }, []);

  if (!configurationLoaded) return <LoadingScreen label="Preparing HomeBridge…" />;
  return <AuthProvider key={configurationVersion}><Root onConnected={() => setConfigurationVersion((value) => value + 1)} /></AuthProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colours.background, paddingTop: Platform.OS === 'android' ? 24 : 0 },
  screen: { flex: 1 },
  tabBar: { position: 'absolute', left: 12, right: 12, bottom: Platform.OS === 'ios' ? 18 : 12, height: 72, borderRadius: 24, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line, flexDirection: 'row', paddingHorizontal: 5, shadowColor: colours.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 15, elevation: 9 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { width: 32, height: 29, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconWrapActive: { backgroundColor: colours.tealSoft },
  icon: { color: colours.muted, fontSize: 18, fontWeight: '900' },
  iconActive: { color: colours.tealDark },
  label: { color: colours.muted, fontSize: 9, fontWeight: '700', marginTop: 3 },
  labelActive: { color: colours.tealDark, fontWeight: '900' },
  loading: { flex: 1, backgroundColor: colours.background, alignItems: 'center', justifyContent: 'center', padding: 28 },
  loadingText: { color: colours.muted, fontSize: 14, marginTop: 16, textAlign: 'center' },
});
