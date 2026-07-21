import React, { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppHeader } from "../components/AppHeader";
import { Card, EmptyState, Pill, PrimaryButton, SecondaryButton } from "../components/UI";
import { errorMessage } from "../lib/errors";
import { useApp } from "../store/AppContext";
import { useCommunication } from "../store/CommunicationContext";
import { colours, radii, spacing } from "../theme";
import { TabKey } from "../types";
import { formatDay, formatTime } from "../utils/format";

type InboxFilter = "all" | "unread" | "action";

export function InboxScreen({ navigate }: { navigate: (tab: TabKey) => void }) {
  const { viewerUserId, state } = useApp();
  const {
    notifications,
    itemRequests,
    unreadCount,
    actionCount,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
    respondItemRequest,
  } = useCommunication();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => notifications.filter((item) => {
    if (filter === "unread") return !item.readAt;
    if (filter === "action") return item.requiresAction && !item.readAt;
    return true;
  }), [notifications, filter]);

  const requestsForMe = itemRequests.filter(
    (request) => request.status === "pending" && request.requestedBy !== viewerUserId,
  );
  const myRequests = itemRequests.filter(
    (request) => request.requestedBy === viewerUserId && request.status === "pending",
  );

  const openNotification = async (id: string, target: TabKey) => {
    try {
      await markRead(id);
    } catch (caught) {
      Alert.alert("Could not mark as read", errorMessage(caught));
    }
    navigate(target === "inbox" ? "today" : target);
  };

  const respond = async (id: string, status: "packed" | "declined") => {
    setBusyId(id);
    try {
      await respondItemRequest(id, status);
      Alert.alert(
        status === "packed" ? "Added to handover" : "Request updated",
        status === "packed"
          ? "The item is now on the next handover checklist."
          : "The other parent will see that the item is not available.",
      );
    } catch (caught) {
      Alert.alert("Could not respond", errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
      }
    >
      <AppHeader
        title="Shared inbox"
        subtitle="Changes, requests and anything needing a reply"
        showInbox={false}
      />

      <View style={styles.summaryRow}>
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{unreadCount}</Text>
          <Text style={styles.summaryLabel}>Unread</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <Text style={[styles.summaryNumber, actionCount ? styles.actionNumber : undefined]}>
            {actionCount + requestsForMe.length}
          </Text>
          <Text style={styles.summaryLabel}>Need action</Text>
        </Card>
      </View>

      <View style={styles.filterRow}>
        {(["all", "unread", "action"] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[styles.filter, filter === value && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
              {value === "all" ? "All" : value === "unread" ? "Unread" : "Needs action"}
            </Text>
          </Pressable>
        ))}
      </View>

      {requestsForMe.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Requests from the other parent</Text>
          {requestsForMe.map((request) => (
            <Card key={request.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <View style={styles.requestIcon}><Text style={styles.requestIconText}>↔</Text></View>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestTitle}>{request.itemName}</Text>
                  <Text style={styles.requestMeta}>Requested by {request.requestedByName}</Text>
                  {request.note ? <Text style={styles.requestNote}>{request.note}</Text> : null}
                </View>
              </View>
              <View style={styles.requestActions}>
                <View style={styles.actionButton}>
                  <PrimaryButton
                    label="Add to handover"
                    busy={busyId === request.id}
                    onPress={() => void respond(request.id, "packed")}
                  />
                </View>
                <View style={styles.actionButton}>
                  <SecondaryButton
                    label="Not available"
                    disabled={busyId === request.id}
                    onPress={() => void respond(request.id, "declined")}
                  />
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {myRequests.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Waiting for the other parent</Text>
          {myRequests.map((request) => (
            <Card key={request.id} style={styles.waitingCard}>
              <Text style={styles.waitingTitle}>{request.itemName}</Text>
              <Pill label="Waiting" tone="amber" />
            </Card>
          ))}
        </View>
      ) : null}

      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>Updates</Text>
        {unreadCount ? (
          <Pressable onPress={() => void markAllRead().catch((caught) => Alert.alert("Could not update inbox", errorMessage(caught)))}>
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Inbox sync problem</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <SecondaryButton label="Try again" onPress={() => void refresh()} />
        </Card>
      ) : null}

      {!visible.length ? (
        <EmptyState
          emoji="✓"
          title="Nothing waiting"
          body={`There are no ${filter === "all" ? "shared updates" : filter === "unread" ? "unread updates" : "updates needing action"} right now.`}
        />
      ) : (
        visible.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => void openNotification(item.id, item.targetTab)}
          >
            <Card style={[styles.notificationCard, !item.readAt && styles.unreadCard]}>
              <View style={styles.notificationTop}>
                <View style={[styles.kindIcon, item.requiresAction && styles.kindIconAction]}>
                  <Text style={styles.kindIconText}>{item.requiresAction ? "!" : "•"}</Text>
                </View>
                <View style={styles.notificationCopy}>
                  <Text style={styles.notificationTitle}>{item.title}</Text>
                  <Text style={styles.notificationBody}>{item.body}</Text>
                  <Text style={styles.notificationMeta}>
                    {item.actorName} · {formatDay(item.createdAt)} at {formatTime(item.createdAt)}
                  </Text>
                </View>
                {!item.readAt ? <View style={styles.unreadDot} /> : null}
              </View>
              {item.requiresAction ? <Pill label="Needs action" tone="rose" /> : null}
            </Card>
          </Pressable>
        ))
      )}

      <SecondaryButton label={`Back to ${state.child.name}'s today page`} onPress={() => navigate("today")} />
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: 150, backgroundColor: colours.background },
  summaryRow: { flexDirection: "row", gap: spacing.md },
  summaryCard: { flex: 1, alignItems: "center", paddingVertical: spacing.lg },
  summaryNumber: { color: colours.tealDark, fontSize: 28, fontWeight: "900" },
  actionNumber: { color: colours.rose },
  summaryLabel: { color: colours.muted, fontSize: 12, fontWeight: "800", marginTop: 3 },
  filterRow: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.lg },
  filter: { flex: 1, minHeight: 42, borderRadius: radii.pill, borderWidth: 1, borderColor: colours.line, alignItems: "center", justifyContent: "center", backgroundColor: colours.surface },
  filterActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  filterText: { color: colours.muted, fontSize: 12, fontWeight: "800" },
  filterTextActive: { color: colours.white },
  section: { marginBottom: spacing.lg },
  sectionTitle: { color: colours.ink, fontSize: 19, fontWeight: "900", marginBottom: spacing.md },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  markAll: { color: colours.tealDark, fontWeight: "900", fontSize: 13, marginBottom: spacing.md },
  requestCard: { marginBottom: spacing.md, borderColor: "#E7D6B8", backgroundColor: colours.amberSoft },
  requestTop: { flexDirection: "row" },
  requestIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colours.tealDark, alignItems: "center", justifyContent: "center" },
  requestIconText: { color: colours.white, fontSize: 20, fontWeight: "900" },
  requestCopy: { flex: 1, marginLeft: spacing.md },
  requestTitle: { color: colours.ink, fontSize: 16, fontWeight: "900" },
  requestMeta: { color: colours.tealDark, fontSize: 12, fontWeight: "700", marginTop: 3 },
  requestNote: { color: colours.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  requestActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  actionButton: { flex: 1 },
  waitingCard: { marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  waitingTitle: { color: colours.ink, fontSize: 14, fontWeight: "800", flex: 1, marginRight: spacing.md },
  notificationCard: { marginBottom: spacing.md },
  unreadCard: { borderColor: "#B6D9D4", backgroundColor: "#FCFFFE" },
  notificationTop: { flexDirection: "row", alignItems: "flex-start" },
  kindIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colours.blueSoft, alignItems: "center", justifyContent: "center" },
  kindIconAction: { backgroundColor: colours.roseSoft },
  kindIconText: { color: colours.tealDark, fontSize: 17, fontWeight: "900" },
  notificationCopy: { flex: 1, marginHorizontal: spacing.md },
  notificationTitle: { color: colours.ink, fontSize: 15, fontWeight: "900" },
  notificationBody: { color: colours.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  notificationMeta: { color: colours.tealDark, fontSize: 11, fontWeight: "700", marginTop: 7 },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colours.amber, marginTop: 4 },
  errorCard: { backgroundColor: colours.dangerSoft, borderColor: "#EBC5C5", marginBottom: spacing.md },
  errorTitle: { color: colours.danger, fontWeight: "900", fontSize: 15 },
  errorBody: { color: colours.muted, fontSize: 13, lineHeight: 19, marginVertical: spacing.md },
  bottomSpace: { height: 24 },
});
