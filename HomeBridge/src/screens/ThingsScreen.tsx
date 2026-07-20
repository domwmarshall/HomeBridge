import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card, Field, Pill, PrimaryButton, SectionHeader, SecondaryButton } from '../components/UI';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { HouseholdLocation, ItemCategory } from '../types';

const categories = ['All', 'Uniform', 'Clothing', 'Toy', 'School', 'Medical', 'Other'] as const;
const locations: HouseholdLocation[] = ["Dad's house", "Mum's house", 'School', 'School bag', 'Handover bag', 'In transit', 'Missing', 'Outgrown'];

export function ThingsScreen() {
  const { state, moveItem, addItem } = useApp();
  const [filter, setFilter] = useState<typeof categories[number]>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<ItemCategory>('Other');

  const items = useMemo(() => state.items.filter((item) => (filter === 'All' || item.category === filter) && item.name.toLowerCase().includes(search.toLowerCase())), [state.items, filter, search]);
  const selectedItem = state.items.find((item) => item.id === selected);

  const add = () => {
    if (!newName.trim()) return;
    addItem({ name: newName.trim(), category: newCategory, quantity: 1, location: state.child.currentHousehold, imageEmoji: '📦' });
    setNewName(''); setShowAdd(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title="Things" subtitle="Know where Eva’s belongings are" />
        <Field value={search} onChangeText={setSearch} placeholder="Search uniform, toys, books…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{categories.map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</ScrollView>

        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}><Text style={styles.summaryNumber}>{state.items.filter((i) => i.location === "Dad's house").length}</Text><Text style={styles.summaryLabel}>At Dad’s</Text></Card>
          <Card style={styles.summaryCard}><Text style={styles.summaryNumber}>{state.items.filter((i) => i.location === "Mum's house").length}</Text><Text style={styles.summaryLabel}>At Mum’s</Text></Card>
          <Card style={styles.summaryCard}><Text style={[styles.summaryNumber, { color: colours.danger }]}>{state.items.filter((i) => i.location === 'Missing').length}</Text><Text style={styles.summaryLabel}>Missing</Text></Card>
        </View>

        <SectionHeader title={`${items.length} tracked items`} action="Add item" onAction={() => setShowAdd(true)} />
        {items.map((item) => (
          <Pressable key={item.id} onPress={() => setSelected(item.id)}>
            <Card style={styles.itemCard}>
              <View style={styles.itemIcon}><Text style={styles.itemEmoji}>{item.imageEmoji}</Text></View>
              <View style={styles.itemCopy}>
                <Text style={styles.itemName}>{item.name}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</Text>
                <Text style={styles.itemMeta}>{item.category}</Text>
                <View style={styles.itemPills}><Pill label={item.location} tone={item.location === 'Missing' ? 'rose' : item.location === 'Handover bag' ? 'amber' : 'teal'} />{item.neededAt ? <Pill label={`Needed: ${item.neededAt}`} tone="amber" /> : null}</View>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={Boolean(selectedItem)} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.bigEmoji}>{selectedItem?.imageEmoji}</Text>
          <Text style={styles.modalTitle}>{selectedItem?.name}</Text>
          <Text style={styles.modalBody}>Update where this item is now. The change will appear in both homes once Supabase is connected.</Text>
          <View style={styles.locationGrid}>{locations.map((location) => <Pressable key={location} onPress={() => { if (selectedItem) moveItem(selectedItem.id, location); setSelected(null); }} style={[styles.locationChoice, selectedItem?.location === location && styles.locationChoiceActive]}><Text style={[styles.locationText, selectedItem?.location === location && styles.locationTextActive]}>{location}</Text></Pressable>)}</View>
          <SecondaryButton label="Close" onPress={() => setSelected(null)} />
        </View></View>
      </Modal>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <View style={styles.modalHandle} /><Text style={styles.modalTitle}>Track a new item</Text>
          <Text style={styles.label}>Item name</Text><Field value={newName} onChangeText={setNewName} placeholder="e.g. Purple swimming bag" />
          <Text style={styles.label}>Category</Text><View style={styles.locationGrid}>{(categories.slice(1) as readonly ItemCategory[]).map((item) => <Pressable key={item} onPress={() => setNewCategory(item)} style={[styles.locationChoice, newCategory === item && styles.locationChoiceActive]}><Text style={[styles.locationText, newCategory === item && styles.locationTextActive]}>{item}</Text></Pressable>)}</View>
          <PrimaryButton label="Add item" onPress={add} disabled={!newName.trim()} /><View style={{ height: spacing.sm }} /><SecondaryButton label="Cancel" onPress={() => setShowAdd(false)} />
        </View></View>
      </Modal>
    </>
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
  itemIcon: { width: 54, height: 54, borderRadius: radii.md, backgroundColor: colours.background, alignItems: 'center', justifyContent: 'center' },
  itemEmoji: { fontSize: 27 },
  itemCopy: { flex: 1, marginLeft: spacing.md },
  itemName: { color: colours.ink, fontSize: 16, fontWeight: '900' },
  itemMeta: { color: colours.muted, fontSize: 12, marginTop: 3 },
  itemPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chevron: { color: colours.muted, fontSize: 28 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,31,37,0.35)' },
  modalSheet: { maxHeight: '88%', backgroundColor: colours.surface, padding: spacing.xl, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  modalHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colours.line, alignSelf: 'center', marginBottom: spacing.lg },
  bigEmoji: { fontSize: 42, textAlign: 'center' },
  modalTitle: { color: colours.ink, fontSize: 24, fontWeight: '900', textAlign: 'center', marginVertical: spacing.sm },
  modalBody: { color: colours.muted, textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg },
  locationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  locationChoice: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colours.background },
  locationChoiceActive: { backgroundColor: colours.tealDark },
  locationText: { color: colours.muted, fontWeight: '700', fontSize: 12 },
  locationTextActive: { color: colours.white },
  label: { color: colours.ink, fontWeight: '800', fontSize: 13, marginTop: spacing.md, marginBottom: spacing.sm },
});
