import React, { useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { Card, EmptyState, Pill, PrimaryButton, SectionHeader, SecondaryButton } from '../components/UI';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { daysUntil, formatDay } from '../utils/format';

export function EvaScreen() {
  const { signOut } = useAuth();
  const { state, resetDemo, mode, members, createInvite, syncError, refresh } = useApp();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const makeInvite = async () => {
    setInviteBusy(true);
    try {
      const code = await createInvite('Mum');
      setInviteCode(code);
      await Share.share({ message: `Join our HomeBridge household with this one-time code: ${code}` });
    } catch (caught) {
      Alert.alert('Could not create invite', caught instanceof Error ? caught.message : 'Please try again.');
    } finally {
      setInviteBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader title={state.child.name} subtitle="Her important information in one place" />
      <Card style={styles.profileCard}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{state.child.initials}</Text></View>
        <Text style={styles.name}>{state.child.name}</Text>
        <Text style={styles.school}>{state.child.school} · {state.child.className}</Text>
        <View style={styles.profilePills}><Pill label={state.child.clothingSize} tone="blue" /><Pill label={`Shoes ${state.child.shoeSize}`} tone="blue" /></View>
      </Card>

      <SectionHeader title="Medical essentials" />
      {state.medicalItems.length ? state.medicalItems.map((item) => {
        const days = daysUntil(item.expiryDate);
        return <Card key={item.id} style={styles.medicalCard}>
          <View style={styles.medicalIcon}><Text style={styles.medicalEmoji}>🩺</Text></View>
          <View style={styles.medicalCopy}><Text style={styles.medicalName}>{item.name}</Text><Text style={styles.medicalMeta}>{item.quantity} devices · {item.location}</Text><Text style={styles.expiry}>Expires {formatDay(item.expiryDate)} · {days} days</Text><Text style={styles.checked}>Last physically checked {formatDay(item.lastCheckedAt)}</Text></View>
          <Pill label={item.replacementStatus} tone={item.replacementStatus === 'OK' ? 'green' : 'rose'} />
        </Card>;
      }) : <EmptyState emoji="🩺" title="No medical items added" body="Add each EpiPen or other essential separately so its location and expiry can be tracked." />}

      <SectionHeader title="School" />
      <Card>
        <InfoRow label="School" value={state.child.school} />
        <InfoRow label="Class" value={state.child.className} />
        <InfoRow label="Calendar" value="Norfolk model + school overrides" />
        <InfoRow label="Collection" value={state.child.collectionPlan} last />
      </Card>

      <SectionHeader title="Shared household" />
      <Card>
        {members.map((member, index) => <React.Fragment key={member.userId}>
          {index ? <View style={styles.divider} /> : null}
          <ParentRow initials={member.displayName.slice(0, 1).toUpperCase()} name={member.displayName} role={member.parentLabel || member.role} status={member.role === 'owner' ? 'Household owner' : 'Connected'} />
        </React.Fragment>)}
        {mode === 'live' && members.length < 2 ? <View style={styles.inviteWrap}>
          <PrimaryButton label={inviteBusy ? 'Creating invite…' : 'Invite Hayley'} onPress={makeInvite} disabled={inviteBusy} />
          {inviteCode ? <Text style={styles.inviteCode}>Invite code: {inviteCode}</Text> : null}
        </View> : null}
      </Card>

      <SectionHeader title="Privacy and data" />
      <Card>
        <SettingRow icon="🔒" title="Private household" body="Only authenticated, invited household members can access these records." />
        <SettingRow icon="🧾" title="Activity history" body="Important changes retain who made them and when." />
        <SettingRow icon="📴" title="Cached on this phone" body={mode === 'live' ? 'Previously loaded records remain visible during a temporary connection loss.' : 'Demo changes remain only on this device.'} />
        {syncError ? <View style={styles.syncError}><Text style={styles.syncErrorTitle}>Last sync issue</Text><Text style={styles.syncErrorBody}>{syncError}</Text><SecondaryButton label="Try syncing again" onPress={() => refresh()} /></View> : null}
      </Card>

      <View style={styles.actions}>
        {mode === 'demo' ? <SecondaryButton label="Reset local demo data" onPress={resetDemo} /> : <SecondaryButton label="Sign out" onPress={() => signOut().catch((caught) => Alert.alert('Could not sign out', caught instanceof Error ? caught.message : 'Please try again.'))} />}
      </View>
    </ScrollView>
  );
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.infoRow, !last && styles.infoBorder]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}
function ParentRow({ initials, name, role, status }: { initials: string; name: string; role: string; status: string }) {
  return <View style={styles.parentRow}><View style={styles.parentAvatar}><Text style={styles.parentInitials}>{initials}</Text></View><View style={styles.parentCopy}><Text style={styles.parentName}>{name}</Text><Text style={styles.parentRole}>{role}</Text></View><Text style={styles.parentStatus}>{status}</Text></View>;
}
function SettingRow({ icon, title, body }: { icon: string; title: string; body: string }) {
  return <View style={styles.settingRow}><Text style={styles.settingIcon}>{icon}</Text><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingBody}>{body}</Text></View></View>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120, backgroundColor: colours.background },
  profileCard: { alignItems: 'center', paddingVertical: spacing.xl },
  avatar: { width: 78, height: 78, borderRadius: 39, backgroundColor: colours.tealDark, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colours.white, fontSize: 34, fontWeight: '900' },
  name: { color: colours.ink, fontSize: 26, fontWeight: '900', marginTop: spacing.md },
  school: { color: colours.muted, fontSize: 13, marginTop: 4, textAlign: 'center' },
  profilePills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  medicalCard: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  medicalIcon: { width: 48, height: 48, borderRadius: radii.md, backgroundColor: colours.roseSoft, alignItems: 'center', justifyContent: 'center' },
  medicalEmoji: { fontSize: 23 },
  medicalCopy: { flex: 1, marginHorizontal: spacing.md },
  medicalName: { color: colours.ink, fontWeight: '900', fontSize: 15 },
  medicalMeta: { color: colours.muted, fontSize: 12, marginTop: 3 },
  expiry: { color: colours.tealDark, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  checked: { color: colours.muted, fontSize: 10, marginTop: 3 },
  infoRow: { minHeight: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.lg },
  infoBorder: { borderBottomWidth: 1, borderBottomColor: colours.line },
  infoLabel: { color: colours.muted, fontSize: 13, fontWeight: '700' },
  infoValue: { flex: 1, color: colours.ink, textAlign: 'right', fontSize: 13, fontWeight: '800' },
  parentRow: { flexDirection: 'row', alignItems: 'center' },
  parentAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colours.tealSoft, alignItems: 'center', justifyContent: 'center' },
  parentInitials: { color: colours.tealDark, fontWeight: '900' },
  parentCopy: { flex: 1, marginLeft: spacing.md },
  parentName: { color: colours.ink, fontWeight: '900' },
  parentRole: { color: colours.muted, fontSize: 12, marginTop: 2 },
  parentStatus: { maxWidth: 125, color: colours.tealDark, fontSize: 11, textAlign: 'right', fontWeight: '700' },
  divider: { height: 1, backgroundColor: colours.line, marginVertical: spacing.lg },
  inviteWrap: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colours.line },
  inviteCode: { color: colours.tealDark, textAlign: 'center', fontSize: 14, fontWeight: '900', letterSpacing: 1, marginTop: spacing.md },
  settingRow: { flexDirection: 'row', paddingVertical: spacing.md },
  settingIcon: { fontSize: 22, width: 34 },
  settingCopy: { flex: 1 },
  settingTitle: { color: colours.ink, fontWeight: '900' },
  settingBody: { color: colours.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  syncError: { backgroundColor: colours.roseSoft, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
  syncErrorTitle: { color: colours.rose, fontWeight: '900' },
  syncErrorBody: { color: colours.muted, fontSize: 12, lineHeight: 18, marginVertical: spacing.sm },
  actions: { marginTop: spacing.xl },
});
