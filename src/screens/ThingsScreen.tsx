import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { BottomSheet } from '../components/BottomSheet';
import { ItemPhoto, PhotoField } from '../components/PhotoField';
import { Card, DangerButton, EmptyState, Field, Pill, PrimaryButton, SectionHeader, SecondaryButton } from '../components/UI';
import { errorMessage } from '../lib/errors';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { HouseholdLocation, ItemCategory, ItemInput, PickedPhoto } from '../types';

const categories = ['All', 'Uniform', 'Clothing', 'Toy', 'School', 'Medical', 'Other'] as const;
const editCategories = categories.slice(1) as readonly ItemCategory[];
const locations: HouseholdLocation[] = ["Dad's house", "Mum's house", 'School', 'School bag', 'Handover bag', 'In transit', 'Missing', 'Outgrown'];
const neededOptions: Array<HouseholdLocation | 'None'> = ['None', ...locations];

interface ItemFormState {
  name: string;
  category: ItemCategory;
  quantity: string;
  location: HouseholdLocation;
  neededAt: HouseholdLocation | 'None';
  minimumAtDad: string;
  minimumAtMum: string;
  notes: string;
  photo?: PickedPhoto;
}

function blankForm(location: HouseholdLocation): ItemFormState {
  return {
    name: '',
    category: 'Other',
    quantity: '1',
    location,
    neededAt: 'None',
    minimumAtDad: '',
    minimumAtMum: '',
    notes: '',
  };
}

export function ThingsScreen() {
  const { state, addItem, updateItem, deleteItem } = useApp();
  const [filter, setFilter] = useState<typeof categories[number]>('All');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ItemFormState>(() => blankForm(state.child.currentHousehold));
  const [busy, setBusy] = useState(false);

  const items = useMemo(
    () => state.items.filter((item) => (filter === 'All' || item.category === filter) && item.name.toLowerCase().includes(search.toLowerCase())),
    [state.items, filter, search],
  );
  const editingItem = state.items.find((item) => item.id === editingId);

  const openAdd = () => {
    setEditingId(null);
    setForm(blankForm(state.child.currentHousehold));
    setShowForm(true);
  };

  const openEdit = (id: string) => {
    const item = state.items.find((value) => value.id === id);
    if (!item) return;
    setEditingId(id);
    setForm({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      location: item.location,
      neededAt: item.neededAt ?? 'None',
      minimumAtDad: item.minimumAtDad == null ? '' : String(item.minimumAtDad),
      minimumAtMum: item.minimumAtMum == null ? '' : String(item.minimumAtMum),
      notes: item.notes ?? '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    if (busy) return;
    setShowForm(false);
    setEditingId(null);
  };

  const toInput = (): ItemInput => ({
    name: form.name.trim(),
    category: form.category,
    quantity: Math.max(1, Number.parseInt(form.quantity, 10) || 1),
    location: form.location,
    neededAt: form.neededAt === 'None' ? undefined : form.neededAt,
    minimumAtDad: form.minimumAtDad.trim() ? Math.max(0, Number.parseInt(form.minimumAtDad, 10) || 0) : undefined,
    minimumAtMum: form.minimumAtMum.trim() ? Math.max(0, Number.parseInt(form.minimumAtMum, 10) || 0) : undefined,
    notes: form.notes.trim() || undefined,
    photo: form.photo,
  });

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert('Item name needed', 'Enter a clear name for the item.');
      return;
    }
    if (!editingItem?.photoUrl && !editingItem?.photoPath && !form.photo) {
      Alert.alert('Picture needed', 'Take or choose a picture of the actual item before saving.');
      return;
    }
    setBusy(true);
    try {
      if (editingId) await updateItem(editingId, toInput());
      else await addItem(toInput());
      closeForm();
    } catch (caught) {
      Alert.alert('Could not save item', errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert(
      'Remove this item?',
      'It will be removed from both homes and from any linked handover checklist.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            deleteItem(editingId)
              .then(closeForm)
              .catch((caught) => Alert.alert('Could not remove item', errorMessage(caught)))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <AppHeader title="Things" subtitle={`Track ${state.child.name}'s belongings between homes`} />
        <Field value={search} onChangeText={setSearch} placeholder="Search uniform, toys, books…" returnKeyType="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {categories.map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}><Text style={styles.summaryNumber}>{state.items.filter((i) => i.location === "Dad's house").length}</Text><Text style={styles.summaryLabel}>At Dad’s</Text></Card>
          <Card style={styles.summaryCard}><Text style={styles.summaryNumber}>{state.items.filter((i) => i.location === "Mum's house").length}</Text><Text style={styles.summaryLabel}>At Mum’s</Text></Card>
          <Card style={styles.summaryCard}><Text style={[styles.summaryNumber, { color: colours.danger }]}>{state.items.filter((i) => i.location === 'Missing').length}</Text><Text style={styles.summaryLabel}>Missing</Text></Card>
        </View>

        <SectionHeader title={`${items.length} tracked item${items.length === 1 ? '' : 's'}`} action="Add item" onAction={openAdd} />
        {!items.length ? (
          <EmptyState emoji="📷" title="No matching items" body="Add an item with a real picture, or change the current filter." />
        ) : items.map((item) => (
          <Pressable key={item.id} onPress={() => openEdit(item.id)}>
            <Card style={styles.itemCard}>
              <ItemPhoto uri={item.photoUrl} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemName}>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</Text>
                <Text style={styles.itemMeta}>{item.category}{!item.photoUrl ? ' · Photo required' : ''}</Text>
                <View style={styles.itemPills}>
                  <Pill label={item.location} tone={item.location === 'Missing' ? 'rose' : item.location === 'Handover bag' ? 'amber' : 'teal'} />
                  {item.neededAt ? <Pill label={`Needed: ${item.neededAt}`} tone="amber" /> : null}
                </View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      <BottomSheet visible={showForm} title={editingId ? 'Edit item' : 'Track a new item'} onClose={closeForm}>
        <PhotoField
          required
          photo={form.photo}
          existingUrl={editingItem?.photoUrl}
          onChange={(photo) => setForm((current) => ({ ...current, photo }))}
        />

        <Text style={styles.label}>Item name *</Text>
        <Field value={form.name} onChangeText={(name) => setForm((current) => ({ ...current, name }))} placeholder="e.g. Purple swimming bag" autoCapitalize="sentences" />

        <Text style={styles.label}>Category</Text>
        <ChipGrid values={editCategories} selected={form.category} onSelect={(category) => setForm((current) => ({ ...current, category }))} />

        <Text style={styles.label}>Quantity</Text>
        <Field value={form.quantity} onChangeText={(quantity) => setForm((current) => ({ ...current, quantity: quantity.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" placeholder="1" />

        <Text style={styles.label}>Current location</Text>
        <ChipGrid values={locations} selected={form.location} onSelect={(location) => setForm((current) => ({ ...current, location }))} />

        <Text style={styles.label}>Needed next</Text>
        <ChipGrid values={neededOptions} selected={form.neededAt} onSelect={(neededAt) => setForm((current) => ({ ...current, neededAt }))} />

        <Text style={styles.label}>Minimum quantity at each home</Text>
        <View style={styles.twoFields}>
          <View style={styles.fieldHalf}><Text style={styles.miniLabel}>Dad's</Text><Field value={form.minimumAtDad} onChangeText={(minimumAtDad) => setForm((current) => ({ ...current, minimumAtDad: minimumAtDad.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" placeholder="Optional" /></View>
          <View style={styles.fieldHalf}><Text style={styles.miniLabel}>Mum's</Text><Field value={form.minimumAtMum} onChangeText={(minimumAtMum) => setForm((current) => ({ ...current, minimumAtMum: minimumAtMum.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" placeholder="Optional" /></View>
        </View>

        <Text style={styles.label}>Notes</Text>
        <Field multiline value={form.notes} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} placeholder="Colour, size, identifying marks, what belongs with it…" />

        <View style={styles.actions}><PrimaryButton label={editingId ? 'Save item' : 'Add item'} onPress={() => void save()} busy={busy} disabled={!form.name.trim()} /></View>
        {editingId ? <View style={styles.secondaryAction}><DangerButton label="Remove item" onPress={remove} disabled={busy} /></View> : null}
        <View style={styles.secondaryAction}><SecondaryButton label="Cancel" onPress={closeForm} disabled={busy} /></View>
      </BottomSheet>
    </>
  );
}

function ChipGrid<T extends string>({ values, selected, onSelect }: { values: readonly T[]; selected: T; onSelect: (value: T) => void }) {
  return (
    <View style={styles.chipGrid}>
      {values.map((value) => (
        <Pressable key={value} onPress={() => onSelect(value)} style={[styles.chip, selected === value && styles.chipActive]}>
          <Text style={[styles.chipText, selected === value && styles.chipTextActive]}>{value}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120, backgroundColor: colours.background },
  filters: { gap: spacing.sm, paddingVertical: spacing.md },
  filter: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line },
  filterActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  filterText: { color: colours.muted, fontWeight: '700', fontSize: 13 },
  filterTextActive: { color: colours.white },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, padding: spacing.md, alignItems: 'center' },
  summaryNumber: { color: colours.tealDark, fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: colours.muted, fontSize: 11, fontWeight: '700', marginTop: 2 },
  itemCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  itemCopy: { flex: 1, marginLeft: spacing.md },
  itemName: { color: colours.ink, fontSize: 16, fontWeight: '900' },
  itemMeta: { color: colours.muted, fontSize: 12, marginTop: 3 },
  itemPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chevron: { color: colours.muted, fontSize: 28 },
  label: { color: colours.ink, fontWeight: '900', fontSize: 13, marginTop: spacing.lg, marginBottom: spacing.sm },
  miniLabel: { color: colours.muted, fontSize: 11, fontWeight: '800', marginBottom: 5 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colours.background, borderWidth: 1, borderColor: colours.line },
  chipActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  chipText: { color: colours.muted, fontWeight: '800', fontSize: 12 },
  chipTextActive: { color: colours.white },
  twoFields: { flexDirection: 'row', gap: spacing.sm },
  fieldHalf: { flex: 1 },
  actions: { marginTop: spacing.xl },
  secondaryAction: { marginTop: spacing.sm },
});
