import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { colours, spacing } from '../theme';
import { Pill } from './UI';

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { mode, syncState } = useApp();
  const status = mode === 'demo'
    ? { label: 'Local demo', tone: 'amber' as const }
    : syncState === 'synced'
      ? { label: 'Live', tone: 'green' as const }
      : syncState === 'connecting'
        ? { label: 'Syncing', tone: 'blue' as const }
        : { label: 'Offline', tone: 'rose' as const };
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>HOMEbridge</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Pill label={status.label} tone={status.tone} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.lg },
  copy: { flex: 1, paddingRight: spacing.md },
  eyebrow: { color: colours.tealDark, fontSize: 11, fontWeight: '900', letterSpacing: 1.8, marginBottom: spacing.xs },
  title: { color: colours.ink, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  subtitle: { color: colours.muted, fontSize: 14, marginTop: spacing.xs },
});
