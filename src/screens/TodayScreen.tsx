import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card, Pill, PrimaryButton, SectionHeader } from '../components/UI';
import { useApp } from '../store/AppContext';
import { colours, radii, spacing } from '../theme';
import { CalendarEvent, TabKey } from '../types';
import { formatDay, formatLongDate, formatTime } from '../utils/format';

const categoryEmoji: Record<CalendarEvent['category'], string> = {
  School: '🏫', Handover: '🔁', Party: '🎈', Trip: '🗺️', Medical: '🩺', Holiday: '☀️',
};

export function TodayScreen({ navigate }: { navigate: (tab: TabKey) => void }) {
  const { state, toggleHandoverTask, viewerName } = useApp();
  const now = Date.now();
  const upcoming = [...state.events].filter((event) => +new Date(event.endsAt ?? event.startsAt) >= now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)).slice(0, 3);
  const done = state.handoverTasks.filter((task) => task.done).length;
  const total = state.handoverTasks.length;
  const urgent = state.medicalItems.filter((item) => item.replacementStatus !== 'OK');
  const progress = total ? done / total : 0;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader title={`Hello, ${viewerName}`} subtitle={formatLongDate(new Date().toISOString())} />

      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{state.child.initials}</Text></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroLabel}>{state.child.name} is currently with</Text>
            <Text style={styles.heroTitle}>{state.child.currentHousehold === "Dad's house" ? 'Dad' : 'Mum'}</Text>
          </View>
          <Pill label="Today" tone="teal" />
        </View>
        <View style={styles.rule} />
        <Text style={styles.nextLabel}>NEXT COLLECTION</Text>
        <Text style={styles.collection}>{state.child.collectionPlan}</Text>
        <Text style={styles.when}>{formatDay(state.child.nextHandoverAt)} · {formatTime(state.child.nextHandoverAt)}</Text>
      </Card>

      {urgent.length ? (
        <Pressable onPress={() => navigate('child')}>
          <Card style={styles.alertCard}>
            <View style={styles.alertIcon}><Text style={styles.alertEmoji}>!</Text></View>
            <View style={styles.alertCopy}>
              <Text style={styles.alertTitle}>Medical item needs attention</Text>
              <Text style={styles.alertBody}>{urgent[0].name} is marked “{urgent[0].replacementStatus}”.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>
      ) : null}

      <SectionHeader title="Next handover" action="Open checklist" onAction={() => navigate('handover')} />
      <Card>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.cardTitle}>Tuesday transfer bag</Text>
            <Text style={styles.cardSubtitle}>{done} of {total} ready</Text>
          </View>
          <View style={styles.progressBadge}><Text style={styles.progressText}>{Math.round(progress * 100)}%</Text></View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
        <View style={styles.quickTasks}>
          {state.handoverTasks.slice(0, 3).map((task) => (
            <Pressable key={task.id} onPress={() => void toggleHandoverTask(task.id)} style={styles.taskRow}>
              <View style={[styles.checkbox, task.done && styles.checkboxDone]}>{task.done ? <Text style={styles.tick}>✓</Text> : null}</View>
              <Text style={[styles.taskText, task.done && styles.taskTextDone]}>{task.label}</Text>
              {task.essential ? <Pill label="Essential" tone="rose" /> : null}
            </Pressable>
          ))}
        </View>
        <PrimaryButton label="View full handover" onPress={() => navigate('handover')} />
      </Card>

      <SectionHeader title="Coming up" action="View calendar" onAction={() => navigate('calendar')} />
      {upcoming.map((event) => (
        <Pressable key={event.id} onPress={() => navigate('calendar')}>
          <Card style={styles.eventCard}>
            <View style={styles.eventEmoji}><Text style={styles.eventEmojiText}>{categoryEmoji[event.category]}</Text></View>
            <View style={styles.eventCopy}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>{event.category === 'Holiday' ? formatDay(event.startsAt) : `${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}`}</Text>
              {event.location ? <Text style={styles.eventLocation}>{event.location}</Text> : null}
            </View>
            {!event.acknowledged ? <View style={styles.dot} /> : null}
          </Card>
        </Pressable>
      ))}
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 120, backgroundColor: colours.background },
  hero: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colours.white, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colours.tealDark, fontWeight: '900', fontSize: 24 },
  heroCopy: { flex: 1, marginLeft: spacing.md },
  heroLabel: { color: '#BFE1DB', fontSize: 13, fontWeight: '600' },
  heroTitle: { color: colours.white, fontSize: 25, fontWeight: '900', marginTop: 2 },
  rule: { height: 1, backgroundColor: '#397873', marginVertical: spacing.lg },
  nextLabel: { color: '#BFE1DB', fontSize: 10, letterSpacing: 1.3, fontWeight: '900' },
  collection: { color: colours.white, fontSize: 17, lineHeight: 23, fontWeight: '800', marginTop: 6 },
  when: { color: '#DCEDEA', fontSize: 13, marginTop: 5 },
  alertCard: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, backgroundColor: colours.roseSoft, borderColor: '#EBCFD3' },
  alertIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colours.rose, alignItems: 'center', justifyContent: 'center' },
  alertEmoji: { color: colours.white, fontWeight: '900', fontSize: 20 },
  alertCopy: { flex: 1, marginHorizontal: spacing.md },
  alertTitle: { color: colours.ink, fontWeight: '800', fontSize: 15 },
  alertBody: { color: colours.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colours.rose, fontSize: 28 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colours.ink, fontWeight: '900', fontSize: 18 },
  cardSubtitle: { color: colours.muted, fontSize: 13, marginTop: 3 },
  progressBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: colours.tealSoft, alignItems: 'center', justifyContent: 'center' },
  progressText: { color: colours.tealDark, fontWeight: '900', fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colours.line, overflow: 'hidden', marginVertical: spacing.lg },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colours.teal },
  quickTasks: { marginBottom: spacing.lg },
  taskRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: '#C8CFD1', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colours.teal, borderColor: colours.teal },
  tick: { color: colours.white, fontWeight: '900' },
  taskText: { flex: 1, color: colours.ink, fontSize: 14, fontWeight: '600' },
  taskTextDone: { color: colours.muted, textDecorationLine: 'line-through' },
  eventCard: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, paddingVertical: spacing.md },
  eventEmoji: { width: 46, height: 46, borderRadius: radii.md, backgroundColor: colours.blueSoft, alignItems: 'center', justifyContent: 'center' },
  eventEmojiText: { fontSize: 22 },
  eventCopy: { flex: 1, marginLeft: spacing.md },
  eventTitle: { color: colours.ink, fontSize: 15, fontWeight: '800' },
  eventMeta: { color: colours.tealDark, fontSize: 12, fontWeight: '700', marginTop: 3 },
  eventLocation: { color: colours.muted, fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colours.amber },
  bottomSpace: { height: 20 },
});
