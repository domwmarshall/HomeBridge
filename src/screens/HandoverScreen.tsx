import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppHeader } from '../components/AppHeader';
import { Card, Field, Pill, PrimaryButton, SectionHeader } from '../components/UI';
import { useApp } from '../store/AppContext';
import { colours, spacing } from '../theme';
import { formatDay, formatTime } from '../utils/format';

export function HandoverScreen() {
  const { state, toggleHandoverTask, updateHandoverNote, completeHandover } = useApp();
  const [confirmed, setConfirmed] = useState(false);
  const done = state.handoverTasks.filter((task) => task.done).length;
  const essentialsReady = state.handoverTasks.filter((task) => task.essential).every((task) => task.done);
  const progress = done / state.handoverTasks.length;

  const finish = async () => {
    if (!essentialsReady) {
      Alert.alert('Essential items are not ready', 'Please confirm the school bag and travel EpiPen before completing the handover.');
      return;
    }
    if (!confirmed) { setConfirmed(true); return; }
    try {
      await completeHandover();
      setConfirmed(false);
      Alert.alert('Handover completed', 'Checked belongings have been moved to the receiving household.');
    } catch {
      setConfirmed(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <AppHeader title="Handover" subtitle="A calm, shared checklist" />
      <Card style={styles.summary}>
        <View style={styles.routeRow}><View><Text style={styles.routeLabel}>FROM</Text><Text style={styles.routeValue}>{state.child.currentHousehold === "Dad's house" ? 'Dad' : 'Mum'}</Text></View><View style={styles.arrow}><Text style={styles.arrowText}>→</Text></View><View style={styles.routeRight}><Text style={styles.routeLabel}>TO</Text><Text style={styles.routeValue}>{state.child.nextHandoverTo}</Text></View></View>
        <View style={styles.rule} />
        <Text style={styles.time}>{formatDay(state.child.nextHandoverAt)} at {formatTime(state.child.nextHandoverAt)}</Text>
        <Text style={styles.plan}>{state.child.collectionPlan}</Text>
      </Card>

      <SectionHeader title="Transfer bag" />
      <Card>
        <View style={styles.progressHeader}><Text style={styles.progressTitle}>{done} of {state.handoverTasks.length} ready</Text><Pill label={essentialsReady ? 'Essentials ready' : 'Check essentials'} tone={essentialsReady ? 'green' : 'rose'} /></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
        {state.handoverTasks.map((task) => (
          <Pressable key={task.id} onPress={() => toggleHandoverTask(task.id)} style={styles.taskRow}>
            <View style={[styles.checkbox, task.done && styles.checkboxDone]}>{task.done ? <Text style={styles.tick}>✓</Text> : null}</View>
            <View style={styles.taskCopy}><Text style={[styles.taskText, task.done && styles.taskTextDone]}>{task.label}</Text>{task.itemId ? <Text style={styles.taskHint}>Item location will update automatically</Text> : null}</View>
            {task.essential ? <Pill label="Essential" tone="rose" /> : null}
          </Pressable>
        ))}
      </Card>

      <SectionHeader title="Pass-on note" />
      <Field multiline value={state.handoverNote} onChangeText={updateHandoverNote} placeholder="School messages, homework, something Eva is excited about…" />
      <Text style={styles.noteHint}>Keep this practical and child-focused. Both parents will see the note in the activity history.</Text>

      <View style={styles.buttonWrap}>
        <PrimaryButton label={confirmed ? 'Tap again to confirm handover' : 'Complete handover'} onPress={finish} />
        {confirmed ? <Text style={styles.confirmHint}>This will move checked items and switch Eva’s current household.</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 140, backgroundColor: colours.background },
  summary: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  routeRow: { flexDirection: 'row', alignItems: 'center' },
  routeLabel: { color: '#BFE1DB', fontSize: 10, letterSpacing: 1.4, fontWeight: '900' },
  routeValue: { color: colours.white, fontSize: 23, fontWeight: '900', marginTop: 4 },
  routeRight: { flex: 1, alignItems: 'flex-end' },
  arrow: { flex: 1, alignItems: 'center' },
  arrowText: { color: '#BFE1DB', fontSize: 30 },
  rule: { height: 1, backgroundColor: '#397873', marginVertical: spacing.lg },
  time: { color: colours.white, fontSize: 17, fontWeight: '900' },
  plan: { color: '#DCEDEA', fontSize: 13, marginTop: 4 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressTitle: { color: colours.ink, fontWeight: '900', fontSize: 17 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colours.line, overflow: 'hidden', marginVertical: spacing.lg },
  progressFill: { height: 8, backgroundColor: colours.teal, borderRadius: 4 },
  taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderTopWidth: 1, borderTopColor: colours.line, gap: spacing.md },
  checkbox: { width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: '#C7CECF', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colours.teal, borderColor: colours.teal },
  tick: { color: colours.white, fontWeight: '900' },
  taskCopy: { flex: 1 },
  taskText: { color: colours.ink, fontWeight: '800', fontSize: 14 },
  taskTextDone: { color: colours.muted, textDecorationLine: 'line-through' },
  taskHint: { color: colours.muted, fontSize: 10, marginTop: 3 },
  noteHint: { color: colours.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  buttonWrap: { marginTop: spacing.xl },
  confirmHint: { color: colours.rose, fontSize: 12, textAlign: 'center', marginTop: spacing.sm, fontWeight: '700' },
});
