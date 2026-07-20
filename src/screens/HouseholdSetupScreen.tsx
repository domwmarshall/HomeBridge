import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Card, Field, PrimaryButton, SecondaryButton } from '../components/UI';
import { useWorkspace } from '../store/WorkspaceContext';
import { colours, radii, spacing } from '../theme';

export function HouseholdSetupScreen() {
  const { user, signOut } = useAuth();
  const { createHousehold, joinHousehold, error } = useWorkspace();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [displayName, setDisplayName] = useState(String(user?.user_metadata?.display_name ?? ''));
  const [parentLabel, setParentLabel] = useState<'Dad' | 'Mum'>('Dad');
  const [householdName, setHouseholdName] = useState("Our family");
  const [childName, setChildName] = useState('Child');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!displayName.trim() || (mode === 'create' && (!householdName.trim() || !childName.trim())) || (mode === 'join' && !inviteCode.trim())) {
      Alert.alert('Complete the details', 'Please fill in all required fields.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'create') await createHousehold({ householdName, displayName, parentLabel, childName });
      else await joinHousehold({ inviteCode, displayName, parentLabel });
    } catch (caught) {
      Alert.alert('Could not continue', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>HomeBridge</Text>
        <Text style={styles.title}>Set up your shared household</Text>
        <Text style={styles.body}>One parent creates the household. The other joins with a private one-time invite code.</Text>

        <Card>
          <View style={styles.switcher}>
            <Pressable onPress={() => setMode('create')} style={[styles.switch, mode === 'create' && styles.switchActive]}><Text style={[styles.switchText, mode === 'create' && styles.switchTextActive]}>Create household</Text></Pressable>
            <Pressable onPress={() => setMode('join')} style={[styles.switch, mode === 'join' && styles.switchActive]}><Text style={[styles.switchText, mode === 'join' && styles.switchTextActive]}>Join with code</Text></Pressable>
          </View>

          <Text style={styles.label}>Your details</Text>
          <Field value={displayName} onChangeText={setDisplayName} placeholder="Your name" autoCapitalize="words" />
          <View style={styles.parentChoices}>
            {(['Dad', 'Mum'] as const).map((label) => <Pressable key={label} onPress={() => setParentLabel(label)} style={[styles.parentChoice, parentLabel === label && styles.parentChoiceActive]}><Text style={[styles.parentText, parentLabel === label && styles.parentTextActive]}>{label}</Text></Pressable>)}
          </View>

          {mode === 'create' ? <>
            <Text style={styles.label}>Household</Text>
            <Field value={householdName} onChangeText={setHouseholdName} placeholder="Household name" />
            <View style={styles.gap}><Field value={childName} onChangeText={setChildName} placeholder="Child's first name" autoCapitalize="words" /></View>
          </> : <>
            <Text style={styles.label}>Private invite code</Text>
            <Field value={inviteCode} onChangeText={(value) => setInviteCode(value.toUpperCase())} placeholder="e.g. 7A19C2D8B4" autoCapitalize="characters" autoCorrect={false} />
          </>}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.button}><PrimaryButton label={busy ? 'Please wait…' : mode === 'create' ? 'Create HomeBridge household' : 'Join household'} onPress={submit} disabled={busy} /></View>
        </Card>
        <View style={styles.signOut}><SecondaryButton label="Sign out" onPress={() => signOut().catch(() => undefined)} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colours.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingBottom: 48 },
  brand: { color: colours.tealDark, fontSize: 12, fontWeight: '900', letterSpacing: 2.2, textAlign: 'center' },
  title: { color: colours.ink, fontSize: 29, lineHeight: 35, fontWeight: '900', textAlign: 'center', marginTop: spacing.md },
  body: { color: colours.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  switcher: { flexDirection: 'row', backgroundColor: colours.background, borderRadius: radii.md, padding: 4, marginBottom: spacing.lg },
  switch: { flex: 1, minHeight: 42, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  switchActive: { backgroundColor: colours.surface },
  switchText: { color: colours.muted, fontWeight: '800', fontSize: 13 },
  switchTextActive: { color: colours.tealDark },
  label: { color: colours.ink, fontSize: 13, fontWeight: '900', marginTop: spacing.md, marginBottom: spacing.sm },
  parentChoices: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  parentChoice: { flex: 1, minHeight: 44, borderRadius: radii.md, backgroundColor: colours.background, alignItems: 'center', justifyContent: 'center' },
  parentChoiceActive: { backgroundColor: colours.tealDark },
  parentText: { color: colours.muted, fontWeight: '800' },
  parentTextActive: { color: colours.white },
  gap: { marginTop: spacing.md },
  button: { marginTop: spacing.xl },
  error: { color: colours.rose, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
  signOut: { marginTop: spacing.md },
});
