import React, { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colours, radii, spacing } from '../theme';

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? <Pressable hitSlop={8} onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'teal' | 'amber' | 'rose' | 'green' | 'blue' }) {
  const palette = {
    neutral: [colours.background, colours.muted],
    teal: [colours.tealSoft, colours.tealDark],
    amber: [colours.amberSoft, '#8D5A1E'],
    rose: [colours.roseSoft, colours.rose],
    green: [colours.greenSoft, colours.green],
    blue: [colours.blueSoft, colours.blue],
  }[tone];
  return <View style={[styles.pill, { backgroundColor: palette[0] }]}><Text style={[styles.pillText, { color: palette[1] }]}>{label}</Text></View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function PrimaryButton({ label, onPress, disabled = false, busy = false }: ButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [styles.primaryButton, (disabled || busy) && styles.disabled, pressed && !disabled && !busy && styles.pressed]}>
      {busy ? <ActivityIndicator color={colours.white} /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false, busy = false }: ButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [styles.secondaryButton, (disabled || busy) && styles.disabled, pressed && !disabled && !busy && styles.pressed]}>
      {busy ? <ActivityIndicator color={colours.tealDark} /> : <Text style={styles.secondaryButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function DangerButton({ label, onPress, disabled = false, busy = false }: ButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [styles.dangerButton, (disabled || busy) && styles.disabled, pressed && !disabled && !busy && styles.pressed]}>
      {busy ? <ActivityIndicator color={colours.danger} /> : <Text style={styles.dangerButtonText}>{label}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor="#98A1A6" {...props} style={[styles.field, props.multiline && styles.multiline, props.style]} />;
}

export function EmptyState({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return <Card style={styles.empty}><Text style={styles.emptyEmoji}>{emoji}</Text><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyBody}>{body}</Text></Card>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colours.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colours.line,
    shadowColor: colours.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { flex: 1, color: colours.ink, fontSize: 19, fontWeight: '800' },
  sectionAction: { color: colours.tealDark, fontSize: 14, fontWeight: '800', marginLeft: spacing.md },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill },
  pillText: { fontSize: 12, fontWeight: '800' },
  primaryButton: { minHeight: 50, backgroundColor: colours.teal, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  primaryButtonText: { color: colours.white, fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 48, backgroundColor: colours.tealSoft, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  secondaryButtonText: { color: colours.tealDark, fontSize: 15, fontWeight: '800' },
  dangerButton: { minHeight: 48, backgroundColor: colours.dangerSoft, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  dangerButtonText: { color: colours.danger, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.78 },
  field: { minHeight: 50, borderWidth: 1, borderColor: colours.line, borderRadius: radii.md, backgroundColor: '#FBFAF7', paddingHorizontal: spacing.lg, color: colours.ink, fontSize: 15 },
  multiline: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyEmoji: { fontSize: 34, marginBottom: spacing.sm },
  emptyTitle: { color: colours.ink, fontSize: 17, fontWeight: '800' },
  emptyBody: { color: colours.muted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 },
});
