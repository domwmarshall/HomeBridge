import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card, Field, Pill, PrimaryButton, SectionHeader, SecondaryButton } from '../components/UI';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { CalendarEvent } from '../types';
import { formatDay, formatTime } from '../utils/format';

const filters = ['All', 'School', 'Handover', 'Party', 'Trip', 'Medical', 'Holiday'] as const;
type Filter = typeof filters[number];
const emojis: Record<CalendarEvent['category'], string> = { School: '🏫', Handover: '🔁', Party: '🎈', Trip: '🗺️', Medical: '🩺', Holiday: '☀️' };

export function CalendarScreen() {
  const { state, acknowledgeEvent, addEvent } = useApp();
  const [filter, setFilter] = useState<Filter>('All');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState<CalendarEvent['category']>('School');

  const sorted = useMemo(() => [...state.events]
    .filter((event) => filter === 'All' || event.category === filter)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)), [state.events, filter]);

  const submit = () => {
    if (!title.trim()) return;
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(15, 15, 0, 0);
    addEvent({ title: title.trim(), location: location.trim() || undefined, startsAt: date.toISOString(), category, responsibleParent: 'Both' });
    setTitle(''); setLocation(''); setShowAdd(false);
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppHeader title="Shared calendar" subtitle="One plan, visible to both homes" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {filters.map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Card style={styles.infoCard}>
          <Text style={styles.infoIcon}>🏫</Text>
          <View style={styles.infoCopy}>
            <Text style={styles.infoTitle}>Norfolk school calendar</Text>
            <Text style={styles.infoBody}>Model term dates are included as editable events. Arden Grove dates and INSET days can override them.</Text>
          </View>
        </Card>
        <SectionHeader title="Upcoming" action="Add event" onAction={() => setShowAdd(true)} />
        {sorted.map((event) => (
          <Card key={event.id} style={styles.eventCard}>
            <View style={styles.dateBox}><Text style={styles.dateDay}>{new Date(event.startsAt).getDate()}</Text><Text style={styles.dateMonth}>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(event.startsAt)).toUpperCase()}</Text></View>
            <View style={styles.eventCopy}>
              <View style={styles.titleRow}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.emoji}>{emojis[event.category]}</Text></View>
              <Text style={styles.eventMeta}>{event.category === 'Holiday' ? `${formatDay(event.startsAt)}${event.endsAt ? ` – ${formatDay(event.endsAt)}` : ''}` : `${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}`}</Text>
              {event.location ? <Text style={styles.location}>{event.location}</Text> : null}
              <View style={styles.tags}><Pill label={event.category} tone={event.category === 'Handover' ? 'teal' : event.category === 'Medical' ? 'rose' : 'blue'} /><Pill label={`With ${event.responsibleParent}`} /></View>
              {event.notes ? <Text style={styles.notes}>{event.notes}</Text> : null}
              {!event.acknowledged ? <SecondaryButton label="Acknowledge" onPress={() => acknowledgeEvent(event.id)} /> : <Text style={styles.acknowledged}>✓ Acknowledged</Text>}
            </View>
          </Card>
        ))}
      </ScrollView>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Add shared event</Text>
          <Text style={styles.label}>What is happening?</Text>
          <Field value={title} onChangeText={setTitle} placeholder="Party, school trip, appointment…" />
          <Text style={styles.label}>Location</Text>
          <Field value={location} onChangeText={setLocation} placeholder="Optional" />
          <Text style={styles.label}>Type</Text>
          <View style={styles.categoryGrid}>{(filters.slice(1) as readonly CalendarEvent['category'][]).map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChoice, category === item && styles.categoryChoiceActive]}><Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>{item}</Text></Pressable>)}</View>
          <PrimaryButton label="Add for tomorrow at 15:15" onPress={submit} disabled={!title.trim()} />
          <View style={{ height: spacing.sm }} /><SecondaryButton label="Cancel" onPress={() => setShowAdd(false)} />
        </View></View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120, backgroundColor: colours.background },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  filter: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: radii.pill, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line },
  filterActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  filterText: { color: colours.muted, fontWeight: '700' },
  filterTextActive: { color: colours.white },
  infoCard: { marginTop: spacing.sm, flexDirection: 'row', backgroundColor: colours.blueSoft },
  infoIcon: { fontSize: 28 },
  infoCopy: { flex: 1, marginLeft: spacing.md },
  infoTitle: { color: colours.ink, fontWeight: '900' },
  infoBody: { color: colours.muted, marginTop: 4, lineHeight: 19, fontSize: 13 },
  eventCard: { flexDirection: 'row', marginBottom: spacing.md },
  dateBox: { width: 54, height: 62, borderRadius: radii.md, backgroundColor: colours.tealSoft, alignItems: 'center', justifyContent: 'center' },
  dateDay: { color: colours.tealDark, fontSize: 23, fontWeight: '900' },
  dateMonth: { color: colours.tealDark, fontSize: 10, fontWeight: '900' },
  eventCopy: { flex: 1, marginLeft: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eventTitle: { flex: 1, color: colours.ink, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  emoji: { fontSize: 20, marginLeft: spacing.sm },
  eventMeta: { color: colours.tealDark, fontSize: 12, fontWeight: '800', marginTop: 5 },
  location: { color: colours.muted, fontSize: 13, marginTop: 3 },
  tags: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.sm },
  notes: { color: colours.muted, lineHeight: 19, fontSize: 13, marginVertical: spacing.sm },
  acknowledged: { color: colours.green, fontWeight: '800', fontSize: 13, marginTop: spacing.sm },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20,31,37,0.35)' },
  modalSheet: { backgroundColor: colours.surface, padding: spacing.xl, paddingBottom: 32, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  modalHandle: { width: 42, height: 5, borderRadius: 3, backgroundColor: colours.line, alignSelf: 'center', marginBottom: spacing.lg },
  modalTitle: { color: colours.ink, fontSize: 24, fontWeight: '900', marginBottom: spacing.lg },
  label: { color: colours.ink, fontWeight: '800', fontSize: 13, marginTop: spacing.md, marginBottom: spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl },
  categoryChoice: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.pill, backgroundColor: colours.background },
  categoryChoiceActive: { backgroundColor: colours.tealDark },
  categoryText: { color: colours.muted, fontWeight: '700', fontSize: 12 },
  categoryTextActive: { color: colours.white },
});
