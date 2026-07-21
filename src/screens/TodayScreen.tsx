import React from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Card, Pill, PrimaryButton, SectionHeader } from "../components/UI";
import { errorMessage } from "../lib/errors";
import { useApp } from "../store/AppContext";
import { useCommunication } from "../store/CommunicationContext";
import { colours, radii, spacing } from "../theme";
import { CalendarEvent, TabKey } from "../types";
import {
  householdForDate,
  isHandoverDate,
  nextHandoverDate,
  nextPlanningIssue,
  parentForHome,
} from "../utils/calendar";
import { formatDay, formatLongDate, formatTime } from "../utils/format";

const categoryEmoji: Record<CalendarEvent["category"], string> = {
  School: "🏫",
  Handover: "🔁",
  Party: "🎈",
  Trip: "🗺️",
  Medical: "🩺",
  Holiday: "☀️",
  Reminder: "🔔",
};

export function TodayScreen({ navigate }: { navigate: (tab: TabKey) => void }) {
  const {
    state,
    syncState,
    refresh,
    toggleHandoverTask,
    addItemsToHandover,
    viewerName,
  } = useApp();
  const { unreadCount, actionCount } = useCommunication();
  const now = Date.now();
  const upcoming = [...state.events]
    .filter((event) => +new Date(event.endsAt ?? event.startsAt) >= now)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
    .slice(0, 3);
  const done = state.handoverTasks.filter((task) => task.done).length;
  const total = state.handoverTasks.length;
  const urgent = state.medicalItems.filter(
    (item) => item.replacementStatus !== "OK",
  );
  const progress = total ? done / total : 0;
  const currentHome = householdForDate(
    new Date(),
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  );
  const nowDate = new Date();
  const handoverStillToday =
    isHandoverDate(nowDate, state.careScheduleRules) &&
    nowDate.getHours() * 60 + nowDate.getMinutes() < 15 * 60 + 15;
  const nextHandover =
    nextHandoverDate(nowDate, state.careScheduleRules, handoverStillToday) ??
    new Date(state.child.nextHandoverAt);
  nextHandover.setHours(15, 15, 0, 0);
  const rule = state.careScheduleRules[0];
  const handoverDestination = householdForDate(
    nextHandover,
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  );
  const collectionParent =
    rule?.pickupParentLabel ?? parentForHome(handoverDestination);
  const collectionPlan = `${collectionParent} collects from ${
    rule?.pickupLocation ?? "the agreed handover point"
  }`;
  const planningIssue = nextPlanningIssue(
    state.events,
    state.items,
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  );

  const addPlanningItems = async () => {
    if (!planningIssue) return;
    try {
      const count = await addItemsToHandover(
        planningIssue.items.map((item) => item.id),
      );
      Alert.alert(
        count ? "Added to handover" : "Already on the checklist",
        count
          ? `${count} item${count === 1 ? "" : "s"} added to the next handover.`
          : "The required items are already on the next handover checklist.",
      );
    } catch (caught) {
      Alert.alert("Could not update handover", errorMessage(caught));
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={syncState === "connecting"}
          onRefresh={() => void refresh()}
          tintColor={colours.tealDark}
        />
      }
    >
      <AppHeader
        title={`Hello, ${viewerName}`}
        subtitle={formatLongDate(new Date().toISOString())}
      />

      {unreadCount ? (
        <Pressable onPress={() => navigate("inbox")}>
          <Card style={styles.inboxCard}>
            <View style={styles.inboxIconWrap}>
              <Text style={styles.inboxIconText}>✉</Text>
            </View>
            <View style={styles.inboxCopy}>
              <Text style={styles.inboxTitle}>Shared inbox</Text>
              <Text style={styles.inboxBody}>
                {actionCount
                  ? `${actionCount} update${actionCount === 1 ? "" : "s"} need your reply.`
                  : `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}.`}
              </Text>
            </View>
            <Pill label={String(unreadCount)} tone={actionCount ? "rose" : "amber"} />
          </Card>
        </Pressable>
      ) : null}

      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{state.child.initials}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroLabel}>
              {state.child.name} is currently with
            </Text>
            <Text style={styles.heroTitle}>
              {currentHome === "Dad's house" ? "Dad" : "Mum"}
            </Text>
          </View>
          <Pill label="Today" tone="teal" />
        </View>
        <View style={styles.rule} />
        <Text style={styles.nextLabel}>NEXT COLLECTION</Text>
        <Text style={styles.collection}>{collectionPlan}</Text>
        <Text style={styles.when}>
          {formatDay(nextHandover.toISOString())} ·{" "}
          {formatTime(nextHandover.toISOString())}
        </Text>
      </Card>

      {urgent.length ? (
        <Pressable onPress={() => navigate("child")}>
          <Card style={styles.alertCard}>
            <View style={styles.alertIcon}>
              <Text style={styles.alertEmoji}>!</Text>
            </View>
            <View style={styles.alertCopy}>
              <Text style={styles.alertTitle}>
                Medical item needs attention
              </Text>
              <Text style={styles.alertBody}>
                {urgent[0].name} is marked “{urgent[0].replacementStatus}”.
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>
      ) : null}

      {planningIssue ? (
        <Card style={styles.planningCard}>
          <View style={styles.planningHeader}>
            <Text style={styles.planningEmoji}>🧳</Text>
            <View style={styles.planningCopy}>
              <Text style={styles.planningTitle}>Plan the next handover</Text>
              <Text style={styles.planningBody}>
                {planningIssue.event.title} needs{" "}
                {planningIssue.items.map((item) => item.name).join(", ")}.
              </Text>
            </View>
          </View>
          <PrimaryButton
            label="Add required items to handover"
            onPress={() => void addPlanningItems()}
          />
        </Card>
      ) : null}

      <SectionHeader
        title="Next handover"
        action="Open checklist"
        onAction={() => navigate("handover")}
      />
      <Card>
        <View style={styles.progressHeader}>
          <View>
            <Text style={styles.cardTitle}>Transfer bag</Text>
            <Text style={styles.cardSubtitle}>
              {done} of {total} ready
            </Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>
              {Math.round(progress * 100)}%
            </Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>
        <View style={styles.quickTasks}>
          {state.handoverTasks.slice(0, 3).map((task) => (
            <Pressable
              key={task.id}
              onPress={() => void toggleHandoverTask(task.id)}
              style={styles.taskRow}
            >
              <View style={[styles.checkbox, task.done && styles.checkboxDone]}>
                {task.done ? <Text style={styles.tick}>✓</Text> : null}
              </View>
              <Text style={[styles.taskText, task.done && styles.taskTextDone]}>
                {task.label}
              </Text>
              {task.essential ? <Pill label="Essential" tone="rose" /> : null}
            </Pressable>
          ))}
        </View>
        <PrimaryButton
          label="View full handover"
          onPress={() => navigate("handover")}
        />
      </Card>

      <SectionHeader
        title="Coming up"
        action="View calendar"
        onAction={() => navigate("calendar")}
      />
      {upcoming.map((event) => (
        <Pressable key={event.id} onPress={() => navigate("calendar")}>
          <Card style={styles.eventCard}>
            <View style={styles.eventEmoji}>
              <Text style={styles.eventEmojiText}>
                {categoryEmoji[event.category]}
              </Text>
            </View>
            <View style={styles.eventCopy}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.eventMeta}>
                {event.allDay
                  ? formatDay(event.startsAt)
                  : `${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}`}
              </Text>
              {event.location ? (
                <Text style={styles.eventLocation}>{event.location}</Text>
              ) : null}
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
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
    backgroundColor: colours.background,
  },
  inboxCard: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md, borderColor: "#B6D9D4" },
  inboxIconWrap: { width: 42, height: 42, borderRadius: 21, backgroundColor: colours.tealSoft, alignItems: "center", justifyContent: "center" },
  inboxIconText: { color: colours.tealDark, fontSize: 20, fontWeight: "900" },
  inboxCopy: { flex: 1, marginHorizontal: spacing.md },
  inboxTitle: { color: colours.ink, fontSize: 15, fontWeight: "900" },
  inboxBody: { color: colours.muted, fontSize: 12, marginTop: 3 },
  hero: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  heroTop: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colours.white,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colours.tealDark, fontWeight: "900", fontSize: 24 },
  heroCopy: { flex: 1, marginLeft: spacing.md },
  heroLabel: { color: "#BFE1DB", fontSize: 13, fontWeight: "600" },
  heroTitle: {
    color: colours.white,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 2,
  },
  rule: { height: 1, backgroundColor: "#397873", marginVertical: spacing.lg },
  nextLabel: {
    color: "#BFE1DB",
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "900",
  },
  collection: {
    color: colours.white,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    marginTop: 6,
  },
  when: { color: "#DCEDEA", fontSize: 13, marginTop: 5 },
  alertCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    backgroundColor: colours.roseSoft,
    borderColor: "#EBCFD3",
  },
  alertIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colours.rose,
    alignItems: "center",
    justifyContent: "center",
  },
  alertEmoji: { color: colours.white, fontWeight: "900", fontSize: 20 },
  alertCopy: { flex: 1, marginHorizontal: spacing.md },
  alertTitle: { color: colours.ink, fontWeight: "800", fontSize: 15 },
  alertBody: { color: colours.muted, fontSize: 13, marginTop: 2 },
  chevron: { color: colours.rose, fontSize: 28 },
  planningCard: {
    marginTop: spacing.md,
    backgroundColor: colours.amberSoft,
    borderColor: "#F0D5AE",
  },
  planningHeader: { flexDirection: "row", marginBottom: spacing.lg },
  planningEmoji: { fontSize: 28 },
  planningCopy: { flex: 1, marginLeft: spacing.md },
  planningTitle: { color: colours.ink, fontSize: 15, fontWeight: "900" },
  planningBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { color: colours.ink, fontWeight: "900", fontSize: 18 },
  cardSubtitle: { color: colours.muted, fontSize: 13, marginTop: 3 },
  progressBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  progressText: { color: colours.tealDark, fontWeight: "900", fontSize: 13 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colours.line,
    overflow: "hidden",
    marginVertical: spacing.lg,
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colours.teal },
  quickTasks: { marginBottom: spacing.lg },
  taskRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#C8CFD1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: colours.teal, borderColor: colours.teal },
  tick: { color: colours.white, fontWeight: "900" },
  taskText: { flex: 1, color: colours.ink, fontSize: 14, fontWeight: "600" },
  taskTextDone: { color: colours.muted, textDecorationLine: "line-through" },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  eventEmoji: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: colours.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  eventEmojiText: { fontSize: 22 },
  eventCopy: { flex: 1, marginLeft: spacing.md },
  eventTitle: { color: colours.ink, fontSize: 15, fontWeight: "800" },
  eventMeta: {
    color: colours.tealDark,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  eventLocation: { color: colours.muted, fontSize: 12, marginTop: 2 },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colours.amber,
  },
  bottomSpace: { height: 20 },
});
