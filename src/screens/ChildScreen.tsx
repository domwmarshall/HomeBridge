import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AppHeader } from '../components/AppHeader';
import { BottomSheet } from '../components/BottomSheet';
import { ItemPhoto, PhotoField } from '../components/PhotoField';
import { Card, DangerButton, EmptyState, Field, Pill, PrimaryButton, SectionHeader, SecondaryButton } from '../components/UI';
import { errorMessage } from '../lib/errors';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { ChildProfileInput, HouseholdLocation, MedicalItem, MedicalItemInput, PickedPhoto } from '../types';
import { daysUntil, formatDay } from '../utils/format';

const locations: HouseholdLocation[] = ["Dad's house", "Mum's house", 'School', 'School bag', 'Handover bag', 'In transit', 'Missing', 'Outgrown'];
const statuses: MedicalItem['replacementStatus'][] = ['OK', 'Due soon', 'Requested', 'Replaced'];

type OpenSheet = 'profile' | 'medical' | 'invite' | null;

interface MedicalForm {
  name: string;
  location: HouseholdLocation;
  quantity: string;
  expiryDate: Date;
  replacementStatus: MedicalItem['replacementStatus'];
  notes: string;
  photo?: PickedPhoto;
}

export function ChildScreen() {
  const { signOut } = useAuth();
  const {
    state,
    resetDemo,
    mode,
    members,
    pendingInvites,
    createInvite,
    revokeInvite,
    removeMember,
    workspaceRole,
    syncError,
    refresh,
    updateChild,
    addMedicalItem,
    updateMedicalItem,
    deleteMedicalItem,
  } = useApp();

  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [editingMedicalId, setEditingMedicalId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ChildProfileInput>({
    name: state.child.name,
    school: state.child.school === 'School not added' ? '' : state.child.school,
    className: state.child.className === 'Class not added' ? '' : state.child.className,
    allergies: state.child.allergies,
    clothingSize: state.child.clothingSize === 'Size not added' ? '' : state.child.clothingSize,
    shoeSize: state.child.shoeSize === 'Not added' ? '' : state.child.shoeSize,
  });
  const [allergiesText, setAllergiesText] = useState(state.child.allergies.join(', '));
  const [medicalForm, setMedicalForm] = useState<MedicalForm>(() => freshMedicalForm(state.child.currentHousehold));

  const editingMedical = state.medicalItems.find((item) => item.id === editingMedicalId);
  const otherParent = members.some((member) => member.parentLabel === 'Mum') ? 'Dad' : 'Mum';

  const openProfile = () => {
    setProfile({
      name: state.child.name,
      school: state.child.school === 'School not added' ? '' : state.child.school,
      className: state.child.className === 'Class not added' ? '' : state.child.className,
      allergies: state.child.allergies,
      clothingSize: state.child.clothingSize === 'Size not added' ? '' : state.child.clothingSize,
      shoeSize: state.child.shoeSize === 'Not added' ? '' : state.child.shoeSize,
    });
    setAllergiesText(state.child.allergies.join(', '));
    setSheet('profile');
  };

  const openAddMedical = () => {
    setEditingMedicalId(null);
    setMedicalForm(freshMedicalForm(state.child.currentHousehold));
    setSheet('medical');
  };

  const openMedical = (item: MedicalItem) => {
    setEditingMedicalId(item.id);
    setMedicalForm({
      name: item.name,
      location: item.location,
      quantity: String(item.quantity),
      expiryDate: new Date(item.expiryDate),
      replacementStatus: item.replacementStatus,
      notes: item.notes ?? '',
    });
    setSheet('medical');
  };

  const saveProfile = async () => {
    if (!profile.name.trim()) return;
    setBusy(true);
    try {
      await updateChild({
        ...profile,
        name: profile.name.trim(),
        school: profile.school.trim(),
        className: profile.className.trim(),
        clothingSize: profile.clothingSize.trim(),
        shoeSize: profile.shoeSize.trim(),
        allergies: allergiesText.split(',').map((value) => value.trim()).filter(Boolean),
      });
      setSheet(null);
    } catch (caught) {
      Alert.alert('Could not update profile', errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const medicalInput = (): MedicalItemInput => ({
    name: medicalForm.name.trim(),
    location: medicalForm.location,
    quantity: Math.max(1, Number.parseInt(medicalForm.quantity, 10) || 1),
    expiryDate: medicalForm.expiryDate.toISOString(),
    replacementStatus: medicalForm.replacementStatus,
    notes: medicalForm.notes.trim() || undefined,
    photo: medicalForm.photo,
  });

  const saveMedical = async () => {
    if (!medicalForm.name.trim()) {
      Alert.alert('Name needed', 'Enter the medicine or device name.');
      return;
    }
    if (!editingMedical?.photoPath && !editingMedical?.photoUrl && !medicalForm.photo) {
      Alert.alert('Picture needed', 'Take or choose a clear picture of the device or label.');
      return;
    }
    setBusy(true);
    try {
      if (editingMedicalId) await updateMedicalItem(editingMedicalId, medicalInput());
      else await addMedicalItem(medicalInput());
      setSheet(null);
    } catch (caught) {
      Alert.alert('Could not save medical item', errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeMedical = () => {
    if (!editingMedicalId) return;
    Alert.alert('Remove this medical item?', 'Its location and expiry record will be deleted from both homes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          setBusy(true);
          deleteMedicalItem(editingMedicalId)
            .then(() => setSheet(null))
            .catch((caught) => Alert.alert('Could not remove medical item', errorMessage(caught)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const makeInvite = async () => {
    setBusy(true);
    try {
      const code = await createInvite(otherParent);
      setInviteCode(code);
      setSheet('invite');
    } catch (caught) {
      Alert.alert('Could not create invite', errorMessage(caught, 'Run the HomeBridge v0.7 database patch and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const shareInvite = async () => {
    if (!inviteCode) return;
    await Share.share({ message: `Join our HomeBridge household with this one-time code: ${inviteCode}\n\nThe code expires in 7 days and can be used once.` });
  };


  const revokePendingInvite = (inviteId: string, parentLabel?: string) => {
    Alert.alert(
      'Revoke invitation?',
      `${parentLabel ? `${parentLabel}'s` : 'This'} one-time code will stop working immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            revokeInvite(inviteId).catch((caught) =>
              Alert.alert('Could not revoke invite', errorMessage(caught)),
            );
          },
        },
      ],
    );
  };

  const removeHouseholdMember = (userId: string, displayName: string) => {
    Alert.alert('Remove household member?', `${displayName} will immediately lose access to this household.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          removeMember(userId).catch((caught) => Alert.alert('Could not remove member', errorMessage(caught)));
        },
      },
    ]);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title={state.child.name} subtitle="Important information shared between both homes" />
        <Pressable onPress={openProfile}>
          <Card style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{state.child.initials}</Text></View>
            <Text style={styles.name}>{state.child.name}</Text>
            <Text style={styles.school}>{state.child.school} · {state.child.className}</Text>
            <View style={styles.profilePills}><Pill label={state.child.clothingSize} tone="blue" /><Pill label={`Shoes ${state.child.shoeSize}`} tone="blue" /></View>
            <Text style={styles.editHint}>Tap to edit profile</Text>
          </Card>
        </Pressable>

        <SectionHeader title="Medical essentials" action="Add medical item" onAction={openAddMedical} />
        {state.medicalItems.length ? state.medicalItems.map((item) => {
          const days = daysUntil(item.expiryDate);
          return (
            <Pressable key={item.id} onPress={() => openMedical(item)}>
              <Card style={styles.medicalCard}>
                <ItemPhoto uri={item.photoUrl} size={54} />
                <View style={styles.medicalCopy}>
                  <Text style={styles.medicalName}>{item.name}</Text>
                  <Text style={styles.medicalMeta}>{item.quantity} device{item.quantity === 1 ? '' : 's'} · {item.location}{!item.photoUrl ? ' · Photo required' : ''}</Text>
                  <Text style={[styles.expiry, days <= 60 && styles.expiryUrgent]}>Expires {formatDay(item.expiryDate)} · {days} days</Text>
                  <Text style={styles.checked}>Last physically checked {formatDay(item.lastCheckedAt)}</Text>
                </View>
                <Pill label={item.replacementStatus} tone={item.replacementStatus === 'OK' ? 'green' : 'rose'} />
              </Card>
            </Pressable>
          );
        }) : <EmptyState emoji="🩺" title="No medical items added" body="Add each EpiPen or other essential separately, including a clear picture, location and expiry." />}

        <SectionHeader title="School" action="Edit" onAction={openProfile} />
        <Card>
          <InfoRow label="School" value={state.child.school} />
          <InfoRow label="Class" value={state.child.className} />
          <InfoRow label="Allergies" value={state.child.allergies.length ? state.child.allergies.join(', ') : 'None added'} />
          <InfoRow label="Collection" value={state.child.collectionPlan} last />
        </Card>

        <SectionHeader title="Shared household" />
        <Card>
          {members.map((member, index) => (
            <React.Fragment key={member.userId}>
              {index ? <View style={styles.divider} /> : null}
              <View style={styles.parentRow}>
                <View style={styles.parentAvatar}><Text style={styles.parentInitials}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.parentCopy}><Text style={styles.parentName}>{member.displayName}</Text><Text style={styles.parentRole}>{member.parentLabel || member.role}</Text></View>
                <View style={styles.parentRight}>
                  <Text style={styles.parentStatus}>{member.role === 'owner' ? 'Household owner' : 'Connected'}</Text>
                  {workspaceRole === 'owner' && member.role !== 'owner' ? <Pressable onPress={() => removeHouseholdMember(member.userId, member.displayName)}><Text style={styles.removeMember}>Remove</Text></Pressable> : null}
                </View>
              </View>
            </React.Fragment>
          ))}
          {mode === 'live' && pendingInvites.length ? (
            <View style={styles.pendingInvites}>
              <Text style={styles.pendingTitle}>Pending invitation</Text>
              {pendingInvites.map((invite) => (
                <View key={invite.id} style={styles.pendingRow}>
                  <View style={styles.pendingCopy}>
                    <Text style={styles.pendingName}>{invite.parentLabel ?? 'Parent'} invite</Text>
                    <Text style={styles.pendingMeta}>Expires {formatDay(invite.expiresAt)}</Text>
                  </View>
                  {workspaceRole === 'owner' ? (
                    <Pressable onPress={() => revokePendingInvite(invite.id, invite.parentLabel)}>
                      <Text style={styles.removeMember}>Revoke</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {mode === 'live' && members.length < 2 ? <View style={styles.inviteWrap}>
            <PrimaryButton label={busy ? 'Creating invite…' : pendingInvites.length ? `Create another ${otherParent} code` : `Invite ${otherParent}`} onPress={() => void makeInvite()} disabled={busy} />
          </View> : null}
          {mode === 'live' && members.length >= 2 ? <Text style={styles.connectedNote}>Both parents are connected to this household.</Text> : null}
        </Card>

        <SectionHeader title="Privacy and data" />
        <Card>
          <SettingRow icon="🔒" title="Private household" body="Only authenticated, invited household members can access these records." />
          <SettingRow icon="🧾" title="Activity history" body="Important changes retain who made them and when." />
          <SettingRow icon="📴" title="Cached on this phone" body={mode === 'live' ? 'Previously loaded records remain visible during a temporary connection loss.' : 'Demo changes remain only on this device.'} />
          {syncError ? <View style={styles.syncError}><Text style={styles.syncErrorTitle}>Last sync issue</Text><Text style={styles.syncErrorBody}>{syncError}</Text><SecondaryButton label="Try syncing again" onPress={() => void refresh()} /></View> : null}
        </Card>

        <View style={styles.actions}>
          {mode === 'demo' ? <SecondaryButton label="Reset local demo data" onPress={resetDemo} /> : <SecondaryButton label="Sign out" onPress={() => signOut().catch((caught) => Alert.alert('Could not sign out', errorMessage(caught)))} />}
        </View>
      </ScrollView>

      <BottomSheet visible={sheet === 'profile'} title={`Edit ${state.child.name}'s profile`} onClose={() => setSheet(null)}>
        <Text style={styles.label}>First name *</Text>
        <Field value={profile.name} onChangeText={(name) => setProfile((current) => ({ ...current, name }))} autoCapitalize="words" />
        <Text style={styles.label}>School</Text>
        <Field value={profile.school} onChangeText={(school) => setProfile((current) => ({ ...current, school }))} placeholder="School name" />
        <Text style={styles.label}>Class or year</Text>
        <Field value={profile.className} onChangeText={(className) => setProfile((current) => ({ ...current, className }))} placeholder="e.g. Year 2" />
        <Text style={styles.label}>Allergies</Text>
        <Field value={allergiesText} onChangeText={setAllergiesText} placeholder="Separate multiple allergies with commas" />
        <Text style={styles.label}>Clothing size</Text>
        <Field value={profile.clothingSize} onChangeText={(clothingSize) => setProfile((current) => ({ ...current, clothingSize }))} placeholder="e.g. 6–7 years" />
        <Text style={styles.label}>Shoe size</Text>
        <Field value={profile.shoeSize} onChangeText={(shoeSize) => setProfile((current) => ({ ...current, shoeSize }))} placeholder="e.g. UK 12" />
        <View style={styles.sheetAction}><PrimaryButton label="Save profile" onPress={() => void saveProfile()} busy={busy} disabled={!profile.name.trim()} /></View>
      </BottomSheet>

      <BottomSheet visible={sheet === 'medical'} title={editingMedicalId ? 'Edit medical item' : 'Add medical item'} onClose={() => setSheet(null)}>
        <PhotoField required photo={medicalForm.photo} existingUrl={editingMedical?.photoUrl} label="Picture of device or label" onChange={(photo) => setMedicalForm((current) => ({ ...current, photo }))} />
        <Text style={styles.label}>Name *</Text>
        <Field value={medicalForm.name} onChangeText={(name) => setMedicalForm((current) => ({ ...current, name }))} placeholder="e.g. EpiPen 0.3 mg" />
        <Text style={styles.label}>Location</Text>
        <ChipGrid values={locations} selected={medicalForm.location} onSelect={(location) => setMedicalForm((current) => ({ ...current, location }))} />
        <Text style={styles.label}>Quantity</Text>
        <Field value={medicalForm.quantity} onChangeText={(quantity) => setMedicalForm((current) => ({ ...current, quantity: quantity.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" />
        <Text style={styles.label}>Expiry date</Text>
        <Pressable style={styles.dateButton} onPress={() => setShowExpiryPicker(true)}><Text style={styles.dateButtonText}>{formatDay(medicalForm.expiryDate.toISOString())}</Text></Pressable>
        <Text style={styles.label}>Replacement status</Text>
        <ChipGrid values={statuses} selected={medicalForm.replacementStatus} onSelect={(replacementStatus) => setMedicalForm((current) => ({ ...current, replacementStatus }))} />
        <Text style={styles.label}>Notes</Text>
        <Field multiline value={medicalForm.notes} onChangeText={(notes) => setMedicalForm((current) => ({ ...current, notes }))} placeholder="Dose, prescription request, storage details…" />
        <View style={styles.sheetAction}><PrimaryButton label={editingMedicalId ? 'Save medical item' : 'Add medical item'} onPress={() => void saveMedical()} busy={busy} disabled={!medicalForm.name.trim()} /></View>
        {editingMedicalId ? <View style={styles.secondaryAction}><DangerButton label="Remove medical item" onPress={removeMedical} disabled={busy} /></View> : null}
      </BottomSheet>

      <BottomSheet visible={sheet === 'invite'} title="Invite created" onClose={() => setSheet(null)}>
        <Text style={styles.inviteExplanation}>Send this one-time code privately. It expires after seven days and can only be used once.</Text>
        <View style={styles.codeBox}><Text selectable style={styles.inviteCode}>{inviteCode}</Text></View>
        <PrimaryButton label="Share invite code" onPress={() => void shareInvite()} />
        <View style={styles.secondaryAction}><SecondaryButton label="Done" onPress={() => setSheet(null)} /></View>
      </BottomSheet>

      {showExpiryPicker ? <DateTimePicker value={medicalForm.expiryDate} mode="date" onChange={(_event: DateTimePickerEvent, date?: Date) => { setShowExpiryPicker(false); if (date) setMedicalForm((current) => ({ ...current, expiryDate: date })); }} /> : null}
    </>
  );
}

function freshMedicalForm(location: HouseholdLocation): MedicalForm {
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return { name: '', location, quantity: '1', expiryDate: expiry, replacementStatus: 'OK', notes: '' };
}

function ChipGrid<T extends string>({ values, selected, onSelect }: { values: readonly T[]; selected: T; onSelect: (value: T) => void }) {
  return <View style={styles.chipGrid}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.chip, selected === value && styles.chipActive]}><Text style={[styles.chipText, selected === value && styles.chipTextActive]}>{value}</Text></Pressable>)}</View>;
}

function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[styles.infoRow, !last && styles.infoBorder]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
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
  editHint: { color: colours.tealDark, fontSize: 11, fontWeight: '800', marginTop: spacing.md },
  medicalCard: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  medicalCopy: { flex: 1, marginHorizontal: spacing.md },
  medicalName: { color: colours.ink, fontWeight: '900', fontSize: 15 },
  medicalMeta: { color: colours.muted, fontSize: 12, marginTop: 3 },
  expiry: { color: colours.tealDark, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  expiryUrgent: { color: colours.rose },
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
  parentRight: { alignItems: 'flex-end' },
  parentStatus: { maxWidth: 125, color: colours.tealDark, fontSize: 11, textAlign: 'right', fontWeight: '700' },
  removeMember: { color: colours.rose, fontSize: 11, fontWeight: '900', marginTop: 7 },
  divider: { height: 1, backgroundColor: colours.line, marginVertical: spacing.lg },
  pendingInvites: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colours.line },
  pendingTitle: { color: colours.ink, fontWeight: '900', fontSize: 13, marginBottom: spacing.sm },
  pendingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  pendingCopy: { flex: 1 },
  pendingName: { color: colours.ink, fontWeight: '800', fontSize: 13 },
  pendingMeta: { color: colours.muted, fontSize: 11, marginTop: 2 },
  inviteWrap: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colours.line },
  connectedNote: { color: colours.green, fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colours.line },
  settingRow: { flexDirection: 'row', paddingVertical: spacing.md },
  settingIcon: { fontSize: 22, width: 34 },
  settingCopy: { flex: 1 },
  settingTitle: { color: colours.ink, fontWeight: '900' },
  settingBody: { color: colours.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
  syncError: { backgroundColor: colours.roseSoft, borderRadius: radii.md, padding: spacing.md, marginTop: spacing.md },
  syncErrorTitle: { color: colours.rose, fontWeight: '900' },
  syncErrorBody: { color: colours.muted, fontSize: 12, lineHeight: 18, marginVertical: spacing.sm },
  actions: { marginTop: spacing.xl },
  label: { color: colours.ink, fontWeight: '900', fontSize: 13, marginTop: spacing.lg, marginBottom: spacing.sm },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colours.background, borderWidth: 1, borderColor: colours.line },
  chipActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  chipText: { color: colours.muted, fontWeight: '800', fontSize: 12 },
  chipTextActive: { color: colours.white },
  dateButton: { minHeight: 50, borderRadius: radii.md, backgroundColor: colours.tealSoft, alignItems: 'center', justifyContent: 'center' },
  dateButtonText: { color: colours.tealDark, fontWeight: '900' },
  sheetAction: { marginTop: spacing.xl },
  secondaryAction: { marginTop: spacing.sm },
  inviteExplanation: { color: colours.muted, lineHeight: 20, textAlign: 'center' },
  codeBox: { backgroundColor: colours.tealSoft, borderRadius: radii.lg, padding: spacing.xl, marginVertical: spacing.xl },
  inviteCode: { color: colours.tealDark, textAlign: 'center', fontSize: 26, fontWeight: '900', letterSpacing: 3 },
});
