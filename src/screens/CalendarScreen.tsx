import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { BottomSheet } from '../components/BottomSheet';
import { Card, DangerButton, EmptyState, Field, Pill, PrimaryButton, SectionHeader, SecondaryButton } from '../components/UI';
import { errorMessage } from '../lib/errors';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { CalendarEvent, EventCategory, ResponsibleParent } from '../types';
import { formatDay, formatTime } from '../utils/format';

const filters = ['All', 'School', 'Handover', 'Party', 'Trip', 'Medical', 'Holiday'] as const;
type Filter = typeof filters[number];
const eventCategories = filters.slice(1) as readonly EventCategory[];
const parents: ResponsibleParent[] = ['Dad', 'Mum', 'Both'];
const emojis: Record<EventCategory, string> = { School: '🏫', Handover: '🔁', Party: '🎈', Trip: '🗺️', Medical: '🩺', Holiday: '☀️' };

type PickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

interface EventForm {
  title: string;
  location: string;
  notes: string;
  category: EventCategory;
  responsibleParent: ResponsibleParent;
  start: Date;
  hasEnd: boolean;
  end: Date;
}

function newForm(): EventForm {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(15, 15, 0, 0);
  const end = new Date(start);
  end.setHours(16, 15, 0, 0);
  return { title: '', location: '', notes: '', category: 'School', responsibleParent: 'Both', start, hasEnd: false, end };
}

export function CalendarScreen() {
  const { state, acknowledgeEvent, addEvent, updateEvent, deleteEvent } = useApp();
  const [filter, setFilter] = useState<Filter>('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(newForm);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...state.events]
    .filter((event) => filter === 'All' || event.category === filter)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)), [state.events, filter]);

  const openAdd = () => {
    setEditingId(null);
    setForm(newForm());
    setShowForm(true);
  };

  const openEdit = (event: CalendarEvent) => {
    const start = new Date(event.startsAt);
    const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
    setEditingId(event.id);
    setForm({
      title: event.title,
      location: event.location ?? '',
      notes: event.notes ?? '',
      category: event.category,
      responsibleParent: event.responsibleParent,
      start,
      hasEnd: Boolean(event.endsAt),
      end,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    if (busy) return;
    setShowForm(false);
    setPickerTarget(null);
  };

  const onPickerChange = (_event: DateTimePickerEvent, selected?: Date) => {
    const target = pickerTarget;
    setPickerTarget(null);
    if (!selected || !target) return;
    setForm((current) => {
      const next = { ...current };
      if (target === 'startDate' || target === 'startTime') {
        const value = new Date(current.start);
        if (target === 'startDate') value.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        else value.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        next.start = value;
        if (next.hasEnd && next.end <= value) next.end = new Date(value.getTime() + 60 * 60 * 1000);
      } else {
        const value = new Date(current.end);
        if (target === 'endDate') value.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        else value.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        next.end = value;
      }
      return next;
    });
  };

  const save = async () => {
    if (!form.title.trim()) {
      Alert.alert('Event title needed', 'Enter what is happening.');
      return;
    }
    if (form.hasEnd && form.end <= form.start) {
      Alert.alert('Check the end time', 'The end must be after the start.');
      return;
    }
    setBusy(true);
    try {
      const input = {
        title: form.title.trim(),
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        startsAt: form.start.toISOString(),
        endsAt: form.hasEnd ? form.end.toISOString() : undefined,
        category: form.category,
        responsibleParent: form.responsibleParent,
      };
      if (editingId) await updateEvent({ id: editingId, ...input });
      else await addEvent(input);
      closeForm();
    } catch (caught) {
      Alert.alert('Could not save event', errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert('Delete this event?', 'It will disappear from both parents’ calendars.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          setBusy(true);
          deleteEvent(editingId)
            .then(closeForm)
            .catch((caught) => Alert.alert('Could not delete event', errorMessage(caught)))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  const pickerDate = pickerTarget?.startsWith('start') ? form.start : form.end;
  const pickerMode = pickerTarget?.endsWith('Time') ? 'time' : 'date';

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
            <Text style={styles.infoBody}>Model dates are included, but school-specific dates and INSET days should be added or edited here.</Text>
          </View>
        </Card>
        <SectionHeader title="Upcoming" action="Add event" onAction={openAdd} />
        {!sorted.length ? <EmptyState emoji="📅" title="Nothing in this view" body="Add an event or choose a different category." /> : sorted.map((event) => (
          <Pressable key={event.id} onPress={() => openEdit(event)}>
            <Card style={styles.eventCard}>
              <View style={styles.dateBox}><Text style={styles.dateDay}>{new Date(event.startsAt).getDate()}</Text><Text style={styles.dateMonth}>{new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(event.startsAt)).toUpperCase()}</Text></View>
              <View style={styles.eventCopy}>
                <View style={styles.titleRow}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.emoji}>{emojis[event.category]}</Text></View>
                <Text style={styles.eventMeta}>{event.category === 'Holiday' ? `${formatDay(event.startsAt)}${event.endsAt ? ` – ${formatDay(event.endsAt)}` : ''}` : `${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}${event.endsAt ? `–${formatTime(event.endsAt)}` : ''}`}</Text>
                {event.location ? <Text style={styles.location}>{event.location}</Text> : null}
                <View style={styles.tags}><Pill label={event.category} tone={event.category === 'Handover' ? 'teal' : event.category === 'Medical' ? 'rose' : 'blue'} /><Pill label={`With ${event.responsibleParent}`} /></View>
                {event.notes ? <Text style={styles.notes}>{event.notes}</Text> : null}
                {!event.acknowledged ? <SecondaryButton label="Acknowledge" onPress={() => void acknowledgeEvent(event.id).catch((caught) => Alert.alert('Could not acknowledge', errorMessage(caught)))} /> : <Text style={styles.acknowledged}>✓ Acknowledged</Text>}
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>

      <BottomSheet visible={showForm} title={editingId ? 'Edit event' : 'Add shared event'} onClose={closeForm}>
        <Text style={styles.label}>What is happening? *</Text>
        <Field value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="Party, school trip, appointment…" />

        <Text style={styles.label}>Type</Text>
        <ChipGrid values={eventCategories} selected={form.category} onSelect={(category) => setForm((current) => ({ ...current, category }))} />

        <Text style={styles.label}>Responsible parent</Text>
        <ChipGrid values={parents} selected={form.responsibleParent} onSelect={(responsibleParent) => setForm((current) => ({ ...current, responsibleParent }))} />

        <Text style={styles.label}>Starts</Text>
        <View style={styles.dateButtons}>
          <DateButton label={formatDay(form.start.toISOString())} onPress={() => setPickerTarget('startDate')} />
          <DateButton label={formatTime(form.start.toISOString())} onPress={() => setPickerTarget('startTime')} />
        </View>

        <Pressable onPress={() => setForm((current) => ({ ...current, hasEnd: !current.hasEnd }))} style={styles.toggleRow}>
          <View style={[styles.checkbox, form.hasEnd && styles.checkboxActive]}>{form.hasEnd ? <Text style={styles.tick}>✓</Text> : null}</View>
          <Text style={styles.toggleText}>Add an end date/time</Text>
        </Pressable>

        {form.hasEnd ? <View style={styles.dateButtons}>
          <DateButton label={formatDay(form.end.toISOString())} onPress={() => setPickerTarget('endDate')} />
          <DateButton label={formatTime(form.end.toISOString())} onPress={() => setPickerTarget('endTime')} />
        </View> : null}

        <Text style={styles.label}>Location</Text>
        <Field value={form.location} onChangeText={(location) => setForm((current) => ({ ...current, location }))} placeholder="Optional" />

        <Text style={styles.label}>Notes, RSVP or packing details</Text>
        <Field multiline value={form.notes} onChangeText={(notes) => setForm((current) => ({ ...current, notes }))} placeholder="RSVP deadline, consent, what to bring…" />

        <View style={styles.action}><PrimaryButton label={editingId ? 'Save event' : 'Add event'} onPress={() => void save()} busy={busy} disabled={!form.title.trim()} /></View>
        {editingId ? <View style={styles.secondaryAction}><DangerButton label="Delete event" onPress={remove} disabled={busy} /></View> : null}
        <View style={styles.secondaryAction}><SecondaryButton label="Cancel" onPress={closeForm} disabled={busy} /></View>
      </BottomSheet>

      {pickerTarget ? <DateTimePicker value={pickerDate} mode={pickerMode} is24Hour onChange={onPickerChange} /> : null}
    </>
  );
}

function ChipGrid<T extends string>({ values, selected, onSelect }: { values: readonly T[]; selected: T; onSelect: (value: T) => void }) {
  return <View style={styles.chipGrid}>{values.map((value) => <Pressable key={value} onPress={() => onSelect(value)} style={[styles.chip, value === selected && styles.chipActive]}><Text style={[styles.chipText, value === selected && styles.chipTextActive]}>{value}</Text></Pressable>)}</View>;
}

function DateButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.dateButton}><Text style={styles.dateButtonText}>{label}</Text></Pressable>;
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
  label: { color: colours.ink, fontWeight: '900', fontSize: 13, marginTop: spacing.lg, marginBottom: spacing.sm },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colours.background, borderWidth: 1, borderColor: colours.line },
  chipActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  chipText: { color: colours.muted, fontWeight: '800', fontSize: 12 },
  chipTextActive: { color: colours.white },
  dateButtons: { flexDirection: 'row', gap: spacing.sm },
  dateButton: { flex: 1, minHeight: 48, borderRadius: radii.md, backgroundColor: colours.tealSoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  dateButtonText: { color: colours.tealDark, fontWeight: '900', textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  checkbox: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: colours.line, alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: colours.teal, borderColor: colours.teal },
  tick: { color: colours.white, fontWeight: '900' },
  toggleText: { color: colours.ink, fontWeight: '800' },
  action: { marginTop: spacing.xl },
  secondaryAction: { marginTop: spacing.sm },
});
