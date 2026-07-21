import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { BottomSheet } from "../components/BottomSheet";
import {
  Card,
  Field,
  Pill,
  PrimaryButton,
  SectionHeader,
  SecondaryButton,
} from "../components/UI";
import { errorMessage } from "../lib/errors";
import { useApp } from "../store/AppContext";
import { useCommunication } from "../store/CommunicationContext";
import { colours, radii, spacing } from "../theme";
import { formatDay, formatTime } from "../utils/format";

export function HandoverScreen() {
  const {
    state,
    toggleHandoverTask,
    updateHandoverNote,
    completeHandover,
    addHandoverTask,
    deleteHandoverTask,
    viewerUserId,
  } = useApp();
  const { itemRequests, respondItemRequest } = useCommunication();
  const [confirmed, setConfirmed] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [linkedItemId, setLinkedItemId] = useState<string | undefined>();
  const [essential, setEssential] = useState(false);
  const [busy, setBusy] = useState(false);

  const done = state.handoverTasks.filter((task) => task.done).length;
  const essentialsReady = state.handoverTasks
    .filter((task) => task.essential)
    .every((task) => task.done);
  const requestsForMe = itemRequests.filter(
    (request) => request.status === "pending" &&
      request.requestedBy !== viewerUserId &&
      !state.handoverTasks.some((task) => task.itemId === request.itemId),
  );
  const progress = state.handoverTasks.length
    ? done / state.handoverTasks.length
    : 0;

  const finish = async () => {
    if (!essentialsReady) {
      Alert.alert(
        "Check the essential items",
        "Every essential item needs to be ticked before completing the handover.",
      );
      return;
    }
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setBusy(true);
    try {
      await completeHandover();
      setConfirmed(false);
      Alert.alert(
        "Handover completed",
        "Checked items have moved to the receiving household and the next handover has been created.",
      );
    } catch (caught) {
      Alert.alert("Could not complete handover", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const addTask = async () => {
    const linkedItem = state.items.find((item) => item.id === linkedItemId);
    const label = newLabel.trim() || linkedItem?.name || "";
    if (!label) {
      Alert.alert(
        "Checklist item needed",
        "Enter a label or choose a tracked item.",
      );
      return;
    }
    setBusy(true);
    try {
      await addHandoverTask({ label, itemId: linkedItemId, essential });
      setNewLabel("");
      setLinkedItemId(undefined);
      setEssential(false);
      setShowAdd(false);
    } catch (caught) {
      Alert.alert("Could not add checklist item", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeTask = (id: string, label: string) => {
    Alert.alert("Remove from checklist?", label, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          deleteHandoverTask(id).catch((caught) =>
            Alert.alert(
              "Could not remove checklist item",
              errorMessage(caught),
            ),
          ),
      },
    ]);
  };

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <AppHeader
            title="Handover"
            subtitle="Everything needed for a calm transfer"
          />
          <Card style={styles.summary}>
            <View style={styles.routeRow}>
              <View>
                <Text style={styles.routeLabel}>FROM</Text>
                <Text style={styles.routeValue}>
                  {state.child.currentHousehold === "Dad's house"
                    ? "Dad"
                    : "Mum"}
                </Text>
              </View>
              <View style={styles.arrow}>
                <Text style={styles.arrowText}>→</Text>
              </View>
              <View style={styles.routeRight}>
                <Text style={styles.routeLabel}>TO</Text>
                <Text style={styles.routeValue}>
                  {state.child.nextHandoverTo}
                </Text>
              </View>
            </View>
            <View style={styles.rule} />
            <Text style={styles.time}>
              {formatDay(state.child.nextHandoverAt)} at{" "}
              {formatTime(state.child.nextHandoverAt)}
            </Text>
            <Text style={styles.plan}>{state.child.collectionPlan}</Text>
          </Card>

          {requestsForMe.length ? (
            <>
              <SectionHeader title="Requests waiting" />
              {requestsForMe.map((request) => (
                <Card key={request.id} style={styles.requestCard}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestCopy}>
                      <Text style={styles.requestTitle}>{request.itemName}</Text>
                      <Text style={styles.requestBody}>
                        {request.note ?? `${request.requestedByName} asked for this item.`}
                      </Text>
                    </View>
                    <Pill label="Requested" tone="rose" />
                  </View>
                  <View style={styles.requestButtons}>
                    <View style={styles.requestButton}>
                      <PrimaryButton
                        label="Add to checklist"
                        onPress={() =>
                          void respondItemRequest(request.id, "packed").catch((caught) =>
                            Alert.alert("Could not add request", errorMessage(caught)),
                          )
                        }
                      />
                    </View>
                    <View style={styles.requestButton}>
                      <SecondaryButton
                        label="Not available"
                        onPress={() =>
                          void respondItemRequest(request.id, "declined").catch((caught) =>
                            Alert.alert("Could not respond", errorMessage(caught)),
                          )
                        }
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          <SectionHeader
            title="Transfer bag"
            action="Add checklist item"
            onAction={() => setShowAdd(true)}
          />
          <Card>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>
                {done} of {state.handoverTasks.length} ready
              </Text>
              <Pill
                label={
                  essentialsReady ? "Essentials ready" : "Check essentials"
                }
                tone={essentialsReady ? "green" : "rose"}
              />
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progress * 100}%` }]}
              />
            </View>
            {!state.handoverTasks.length ? (
              <Text style={styles.emptyText}>
                No checklist items yet. Add the belongings or messages needed
                for this handover.
              </Text>
            ) : (
              state.handoverTasks.map((task) => (
                <View key={task.id} style={styles.taskRow}>
                  <Pressable
                    onPress={() =>
                      void toggleHandoverTask(task.id).catch((caught) =>
                        Alert.alert(
                          "Could not update checklist",
                          errorMessage(caught),
                        ),
                      )
                    }
                    style={styles.taskMain}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        task.done && styles.checkboxDone,
                      ]}
                    >
                      {task.done ? <Text style={styles.tick}>✓</Text> : null}
                    </View>
                    <View style={styles.taskCopy}>
                      <Text
                        style={[
                          styles.taskText,
                          task.done && styles.taskTextDone,
                        ]}
                      >
                        {task.label}
                      </Text>
                      {task.itemId ? (
                        <Text style={styles.taskHint}>
                          The tracked item’s location changes when the handover
                          completes
                        </Text>
                      ) : null}
                    </View>
                    {task.essential ? (
                      <Pill label="Essential" tone="rose" />
                    ) : null}
                  </Pressable>
                  <Pressable
                    onPress={() => removeTask(task.id, task.label)}
                    hitSlop={10}
                    style={styles.removeTask}
                  >
                    <Text style={styles.removeTaskText}>×</Text>
                  </Pressable>
                </View>
              ))
            )}
          </Card>

          <SectionHeader title="Pass-on note" />
          <Field
            multiline
            value={state.handoverNote}
            onChangeText={updateHandoverNote}
            placeholder={`School messages, homework, or something ${state.child.name} is excited about…`}
          />
          <Text style={styles.noteHint}>
            Keep this practical and child-focused. It is shared with the other
            parent.
          </Text>

          <View style={styles.buttonWrap}>
            <PrimaryButton
              label={
                confirmed
                  ? "Tap again to confirm handover"
                  : "Complete handover"
              }
              onPress={() => void finish()}
              busy={busy}
            />
            {confirmed ? (
              <Text style={styles.confirmHint}>
                This moves checked items and switches {state.child.name}’s
                current household.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={showAdd}
        title="Add checklist item"
        onClose={() => setShowAdd(false)}
      >
        <Text style={styles.label}>Choose a tracked item</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.itemChoices}
        >
          <Pressable
            onPress={() => setLinkedItemId(undefined)}
            style={[styles.choice, !linkedItemId && styles.choiceActive]}
          >
            <Text
              style={[
                styles.choiceText,
                !linkedItemId && styles.choiceTextActive,
              ]}
            >
              No linked item
            </Text>
          </Pressable>
          {state.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => {
                setLinkedItemId(item.id);
                if (!newLabel.trim()) setNewLabel(item.name);
              }}
              style={[
                styles.choice,
                linkedItemId === item.id && styles.choiceActive,
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  linkedItemId === item.id && styles.choiceTextActive,
                ]}
              >
                {item.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.label}>Checklist label *</Text>
        <Field
          value={newLabel}
          onChangeText={setNewLabel}
          placeholder="e.g. PE kit or pass on school letter"
        />
        <Pressable
          onPress={() => setEssential((value) => !value)}
          style={styles.essentialRow}
        >
          <View style={[styles.checkbox, essential && styles.checkboxDone]}>
            {essential ? <Text style={styles.tick}>✓</Text> : null}
          </View>
          <View style={styles.essentialCopy}>
            <Text style={styles.essentialTitle}>Essential</Text>
            <Text style={styles.essentialBody}>
              The handover cannot be completed until this is checked.
            </Text>
          </View>
        </Pressable>
        <PrimaryButton
          label="Add to checklist"
          onPress={() => void addTask()}
          busy={busy}
          disabled={!newLabel.trim() && !linkedItemId}
        />
        <View style={styles.cancel}>
          <SecondaryButton
            label="Cancel"
            onPress={() => setShowAdd(false)}
            disabled={busy}
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  requestCard: { marginBottom: spacing.md, backgroundColor: colours.amberSoft, borderColor: "#E7D6B8" },
  requestHeader: { flexDirection: "row", alignItems: "flex-start" },
  requestCopy: { flex: 1, marginRight: spacing.md },
  requestTitle: { color: colours.ink, fontSize: 16, fontWeight: "900" },
  requestBody: { color: colours.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  requestButtons: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  requestButton: { flex: 1 },
  flex: { flex: 1, backgroundColor: colours.background },
  content: {
    padding: spacing.lg,
    paddingBottom: 140,
    backgroundColor: colours.background,
  },
  summary: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  routeRow: { flexDirection: "row", alignItems: "center" },
  routeLabel: {
    color: "#BFE1DB",
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: "900",
  },
  routeValue: {
    color: colours.white,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 4,
  },
  routeRight: { flex: 1, alignItems: "flex-end" },
  arrow: { flex: 1, alignItems: "center" },
  arrowText: { color: "#BFE1DB", fontSize: 30 },
  rule: { height: 1, backgroundColor: "#397873", marginVertical: spacing.lg },
  time: { color: colours.white, fontSize: 17, fontWeight: "900" },
  plan: { color: "#DCEDEA", fontSize: 13, marginTop: 4 },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  progressTitle: { color: colours.ink, fontWeight: "900", fontSize: 17 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colours.line,
    overflow: "hidden",
    marginVertical: spacing.lg,
  },
  progressFill: { height: 8, backgroundColor: colours.teal, borderRadius: 4 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 66,
    borderTopWidth: 1,
    borderTopColor: colours.line,
  },
  taskMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#C7CECF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: colours.teal, borderColor: colours.teal },
  tick: { color: colours.white, fontWeight: "900" },
  taskCopy: { flex: 1 },
  taskText: { color: colours.ink, fontWeight: "800", fontSize: 14 },
  taskTextDone: { color: colours.muted, textDecorationLine: "line-through" },
  taskHint: { color: colours.muted, fontSize: 10, marginTop: 3 },
  removeTask: {
    width: 34,
    height: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  removeTaskText: { color: colours.rose, fontSize: 23, fontWeight: "700" },
  emptyText: {
    color: colours.muted,
    lineHeight: 20,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  noteHint: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  buttonWrap: { marginTop: spacing.xl },
  confirmHint: {
    color: colours.rose,
    fontSize: 12,
    textAlign: "center",
    marginTop: spacing.sm,
    fontWeight: "700",
  },
  label: {
    color: colours.ink,
    fontWeight: "900",
    fontSize: 13,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  itemChoices: { gap: spacing.sm, paddingBottom: spacing.sm },
  choice: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: colours.background,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colours.line,
  },
  choiceActive: {
    backgroundColor: colours.tealDark,
    borderColor: colours.tealDark,
  },
  choiceText: { color: colours.muted, fontSize: 12, fontWeight: "800" },
  choiceTextActive: { color: colours.white },
  essentialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.xl,
  },
  essentialCopy: { flex: 1 },
  essentialTitle: { color: colours.ink, fontWeight: "900" },
  essentialBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  cancel: { marginTop: spacing.sm },
});
