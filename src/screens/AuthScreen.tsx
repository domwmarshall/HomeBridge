import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Card, Field, PrimaryButton, SecondaryButton } from '../components/UI';
import { colours, radii, spacing } from '../theme';

export function AuthScreen({ onUseDemo }: { onUseDemo: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 8 || (mode === 'signup' && !displayName.trim())) {
      Alert.alert('Check the details', 'Use a valid email, a password of at least eight characters, and your name.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else {
        const result = await signUp(email, password, displayName);
        if (result.needsConfirmation) {
          Alert.alert('Check your email', 'Open the confirmation email from Supabase, then return here and sign in.');
          setMode('signin');
        }
      }
    } catch (caught) {
      Alert.alert('Could not continue', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}><Text style={styles.logoMark}>↔</Text></View>
        <Text style={styles.brand}>HomeBridge</Text>
        <Text style={styles.title}>Everything your child needs, between two homes.</Text>
        <Text style={styles.body}>Private shared planning for handovers, belongings, school dates and medical essentials.</Text>

        <Card style={styles.card}>
          <View style={styles.switcher}>
            <Pressable onPress={() => setMode('signin')} style={[styles.switch, mode === 'signin' && styles.switchActive]}><Text style={[styles.switchText, mode === 'signin' && styles.switchTextActive]}>Sign in</Text></Pressable>
            <Pressable onPress={() => setMode('signup')} style={[styles.switch, mode === 'signup' && styles.switchActive]}><Text style={[styles.switchText, mode === 'signup' && styles.switchTextActive]}>Create account</Text></Pressable>
          </View>
          {mode === 'signup' ? <Field value={displayName} onChangeText={setDisplayName} placeholder="Your name" autoCapitalize="words" /> : null}
          <View style={styles.gap}><Field value={email} onChangeText={setEmail} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></View>
          <View style={styles.gap}><Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry autoCapitalize="none" /></View>
          <View style={styles.button}><PrimaryButton label={busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create secure account'} onPress={submit} disabled={busy} /></View>
        </Card>

        <View style={styles.demo}><SecondaryButton label="Open local demo instead" onPress={onUseDemo} /></View>
        <Text style={styles.privacy}>Real shared records are protected by Supabase authentication and household-level Row Level Security.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colours.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingBottom: 48 },
  logo: { width: 62, height: 62, borderRadius: 22, backgroundColor: colours.tealDark, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  logoMark: { color: colours.white, fontSize: 31, fontWeight: '900' },
  brand: { color: colours.tealDark, fontSize: 12, fontWeight: '900', letterSpacing: 2.2, textAlign: 'center', marginTop: spacing.md },
  title: { color: colours.ink, fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center', marginTop: spacing.md },
  body: { color: colours.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  card: { gap: 0 },
  switcher: { flexDirection: 'row', backgroundColor: colours.background, borderRadius: radii.md, padding: 4, marginBottom: spacing.lg },
  switch: { flex: 1, minHeight: 42, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  switchActive: { backgroundColor: colours.surface },
  switchText: { color: colours.muted, fontWeight: '800' },
  switchTextActive: { color: colours.tealDark },
  gap: { marginTop: spacing.md },
  button: { marginTop: spacing.lg },
  demo: { marginTop: spacing.md },
  privacy: { color: colours.muted, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: spacing.lg },
});
