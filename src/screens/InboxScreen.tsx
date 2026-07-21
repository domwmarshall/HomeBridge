import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useState } from "react";
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
import { BottomSheet } from "../components/BottomSheet";
import { ItemPhoto, PhotoField } from "../components/PhotoField";
import {
  Card,
  EmptyState,
  Field,
  Pill,
  PrimaryButton,
  SecondaryButton,
} from "../components/UI";
import { errorMessage } from "../lib/errors";
import { useApp } from "../store/AppContext";
import { useCommunication } from "../store/CommunicationContext";
import { colours, radii, spacing } from "../theme";
import {
  HouseholdMessage,
  MessageContextType,
  PickedPhoto,
  TabKey,
} from "../types";
import { formatDay, formatTime } from "../utils/format";

type InboxSection = "messages" | "action" | "updates";

interface ComposerState {
  body: string;
  replyTo?: HouseholdMessage;
  editing?: HouseholdMessage;
  photo?: PickedPhoto;
  contextType?: MessageContextType;
  contextId?: string;
  contextLabel?: string;
}

const emptyComposer = (): ComposerState => ({ body: "" });

export function InboxScreen({ navigate }: { navigate: (tab: TabKey) => void }) {
  const { viewerUserId, state } = useApp();
  const {
    notifications,
    itemRequests,
    messages,
    unreadCount,
    messageUnreadCount,
    actionCount,
    loading,
    messagesLoading,
    error,
    available,
    hasOlderMessages,
    refresh,
    loadOlderMessages,
    markRead,
    markAllRead,
    markMessagesRead,
    sendMessage,
    editMessage,
    removeMessage,
    respondItemRequest,
  } = useCommunication();

  const [section, setSection] = useState<InboxSection>("messages");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState<ComposerState>(emptyComposer());
  const [composerOpen, setComposerOpen] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);

  const requestsForMe = itemRequests.filter(
    (request) =>
      request.status === "pending" && request.requestedBy !== viewerUserId,
  );
  const myRequests = itemRequests.filter(
    (request) =>
      request.requestedBy === viewerUserId && request.status === "pending",
  );

  const actionNotifications = notifications.filter(
    (item) => item.requiresAction && item.kind !== "message",
  );
  const updateNotifications = notifications.filter(
    (item) => item.kind !== "message" && !item.requiresAction,
  );

  const visibleMessages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...messages]
      .reverse()
      .filter((message) => {
        if (!query) return true;
        return (
          message.body?.toLowerCase().includes(query) ||
          message.senderName.toLowerCase().includes(query) ||
          message.contextLabel?.toLowerCase().includes(query)
        );
      });
  }, [messages, search]);

  useEffect(() => {
    if (section !== "messages") return;
    const unreadIds = messages
      .filter(
        (message) =>
          message.senderId !== viewerUserId &&
          !message.readByMe &&
          !message.deletedAt,
      )
      .map((message) => message.id);
    if (unreadIds.length) {
      void markMessagesRead(unreadIds).catch(() => undefined);
    }
  }, [section, messages, viewerUserId, markMessagesRead]);

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

  const openNewMessage = (replyTo?: HouseholdMessage) => {
    setComposer({ body: "", replyTo });
    setShowPhoto(false);
    setComposerOpen(true);
  };

  const openEditMessage = (message: HouseholdMessage) => {
    setComposer({ body: message.body ?? "", editing: message });
    setShowPhoto(false);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    if (sending) return;
    setComposerOpen(false);
    setComposer(emptyComposer());
    setShowPhoto(false);
  };

  const submitMessage = async () => {
    const hasContent =
      Boolean(composer.body.trim()) ||
      Boolean(composer.photo) ||
      Boolean(composer.contextId);
    if (!hasContent) {
      Alert.alert("Message is empty", "Write something or attach a picture.");
      return;
    }

    setSending(true);
    try {
      if (composer.editing) {
        await editMessage(composer.editing.id, composer.body);
      } else {
        await sendMessage({
          body: composer.body,
          replyToId: composer.replyTo?.id,
          attachment: composer.photo,
          contextType: composer.contextType,
          contextId: composer.contextId,
          contextLabel: composer.contextLabel,
          clientId: `${viewerUserId}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 9)}`,
        });
      }
      closeComposer();
    } catch (caught) {
      Alert.alert("Could not send message", errorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  const messageMenu = (message: HouseholdMessage) => {
    if (message.deletedAt) return;
    const own = message.senderId === viewerUserId;
    const options = [
      {
        text: "Reply",
        onPress: () => openNewMessage(message),
      },
      ...(message.body
        ? [
            {
              text: "Copy text",
              onPress: () => void Clipboard.setStringAsync(message.body ?? ""),
            },
          ]
        : []),
      ...(own
        ? [
            {
              text: "Edit",
              onPress: () => openEditMessage(message),
            },
            {
              text: "Remove",
              style: "destructive" as const,
              onPress: () =>
                Alert.alert(
                  "Remove message?",
                  "The conversation will show that the message was removed.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () =>
                        void removeMessage(message.id).catch((caught) =>
                          Alert.alert(
                            "Could not remove message",
                            errorMessage(caught),
                          ),
                        ),
                    },
                  ],
                ),
            },
          ]
        : []),
      { text: "Cancel", style: "cancel" as const },
    ];
    Alert.alert("Message options", undefined, options);
  };

  const contextOptions = [
    ...state.items.slice(0, 8).map((item) => ({
      type: "item" as const,
      id: item.id,
      label: item.name,
    })),
    ...state.events
      .filter((event) => new Date(event.startsAt).getTime() >= Date.now())
      .slice(0, 6)
      .map((event) => ({
        type: "calendar_event" as const,
        id: event.id,
        label: event.title,
      })),
    ...(state.activeHandoverId
      ? [
          {
            type: "handover" as const,
            id: state.activeHandoverId,
            label: "Next handover",
          },
        ]
      : []),
  ];

  return (
    <>
      <View style={styles.root}>
        <View style={styles.headerWrap}>
          <AppHeader
            title="Shared inbox"
            subtitle="Messages, requests and household updates"
            showInbox={false}
          />
          <View style={styles.summaryRow}>
            <Summary value={messageUnreadCount} label="Messages" />
            <Summary
              value={actionCount + requestsForMe.length}
              label="Need action"
              action
            />
            <Summary value={unreadCount} label="All unread" />
          </View>
          <View style={styles.segmentRow}>
            {(
              [
                ["messages", "Messages"],
                ["action", "Needs action"],
                ["updates", "Updates"],
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setSection(key)}
                style={[
                  styles.segment,
                  section === key && styles.segmentActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    section === key && styles.segmentTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {section === "messages" ? (
          <ScrollView
            contentContainerStyle={styles.messageContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={messagesLoading}
                onRefresh={() => void refresh()}
              />
            }
          >
            {!available ? (
              <EmptyState
                emoji="✉"
                title="Connect the other parent"
                body="Create a household invitation first. Messages become available as soon as the other parent joins."
              />
            ) : (
              <>
                <Field
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search messages"
                />
                {hasOlderMessages ? (
                  <View style={styles.olderButton}>
                    <SecondaryButton
                      label="Load older messages"
                      onPress={loadOlderMessages}
                    />
                  </View>
                ) : null}
                {!visibleMessages.length ? (
                  <EmptyState
                    emoji="💬"
                    title={search ? "No matching messages" : "Start the conversation"}
                    body={
                      search
                        ? "Try a different name or word."
                        : "Use HomeBridge for practical notes about school, belongings, handovers and plans."
                    }
                  />
                ) : (
                  visibleMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      own={message.senderId === viewerUserId}
                      onPress={() => messageMenu(message)}
                      onContext={() => {
                        if (message.contextType === "item") navigate("things");
                        else if (message.contextType === "calendar_event")
                          navigate("calendar");
                        else if (message.contextType === "handover")
                          navigate("handover");
                        else if (message.contextType === "medical_item")
                          navigate("child");
                      }}
                    />
                  ))
                )}
              </>
            )}
            <View style={styles.bottomSpace} />
          </ScrollView>
        ) : section === "action" ? (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
            }
          >
            {requestsForMe.map((request) => (
              <Card key={request.id} style={styles.requestCard}>
                <Text style={styles.requestTitle}>{request.itemName}</Text>
                <Text style={styles.requestMeta}>
                  Requested by {request.requestedByName}
                </Text>
                {request.note ? (
                  <Text style={styles.requestNote}>{request.note}</Text>
                ) : null}
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
            {myRequests.map((request) => (
              <Card key={request.id} style={styles.waitingCard}>
                <Text style={styles.requestTitle}>{request.itemName}</Text>
                <Pill label="Waiting for reply" tone="amber" />
              </Card>
            ))}
            {actionNotifications.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                onPress={() => void openNotification(item.id, item.targetTab)}
              />
            ))}
            {!requestsForMe.length &&
            !myRequests.length &&
            !actionNotifications.length ? (
              <EmptyState
                emoji="✓"
                title="Nothing needs action"
                body="Care changes, item requests and deadlines needing a reply will appear here."
              />
            ) : null}
            <View style={styles.bottomSpace} />
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={() => void refresh()} />
            }
          >
            <View style={styles.markRow}>
              <Text style={styles.sectionTitle}>Household updates</Text>
              {notifications.some((item) => !item.readAt) ? (
                <Pressable
                  onPress={() =>
                    void markAllRead().catch((caught) =>
                      Alert.alert("Could not update inbox", errorMessage(caught)),
                    )
                  }
                >
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
            {!updateNotifications.length ? (
              <EmptyState
                emoji="✓"
                title="No new updates"
                body="Calendar, medical and household changes will appear here."
              />
            ) : (
              updateNotifications.map((item) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  onPress={() => void openNotification(item.id, item.targetTab)}
                />
              ))
            )}
            <View style={styles.bottomSpace} />
          </ScrollView>
        )}

        {section === "messages" && available ? (
          <View style={styles.composeBar}>
            <Pressable
              style={styles.composePrompt}
              onPress={() => openNewMessage()}
            >
              <Text style={styles.composePromptText}>Write a message…</Text>
            </Pressable>
            <Pressable style={styles.sendCircle} onPress={() => openNewMessage()}>
              <Text style={styles.sendCircleText}>＋</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <BottomSheet
        visible={composerOpen}
        title={composer.editing ? "Edit message" : "New message"}
        onClose={closeComposer}
      >
        {composer.replyTo ? (
          <View style={styles.replyBox}>
            <Text style={styles.replyLabel}>
              Replying to {composer.replyTo.senderName}
            </Text>
            <Text numberOfLines={2} style={styles.replyText}>
              {composer.replyTo.deletedAt
                ? "Message removed"
                : composer.replyTo.body ?? "Attachment"}
            </Text>
          </View>
        ) : null}
        <Field
          multiline
          autoFocus
          value={composer.body}
          onChangeText={(body) =>
            setComposer((current) => ({ ...current, body }))
          }
          placeholder="Write a practical note to the other parent"
        />

        {!composer.editing ? (
          <>
            <View style={styles.composeOptions}>
              <Pressable
                style={styles.optionButton}
                onPress={() => setShowPhoto((value) => !value)}
              >
                <Text style={styles.optionText}>
                  {composer.photo ? "Photo attached" : "Add photo"}
                </Text>
              </Pressable>
              {composer.contextId ? (
                <Pressable
                  style={styles.optionButton}
                  onPress={() =>
                    setComposer((current) => ({
                      ...current,
                      contextType: undefined,
                      contextId: undefined,
                      contextLabel: undefined,
                    }))
                  }
                >
                  <Text style={styles.optionText}>Remove link</Text>
                </Pressable>
              ) : null}
            </View>
            {showPhoto ? (
              <PhotoField
                label="Message picture"
                photo={composer.photo}
                onChange={(photo) =>
                  setComposer((current) => ({ ...current, photo }))
                }
              />
            ) : null}

            <Text style={styles.contextTitle}>Link to HomeBridge</Text>
            <Text style={styles.contextHelp}>
              Optional: link this message to an item, event or handover.
            </Text>
            <View style={styles.contextGrid}>
              {contextOptions.map((option) => {
                const active = composer.contextId === option.id;
                return (
                  <Pressable
                    key={`${option.type}-${option.id}`}
                    onPress={() =>
                      setComposer((current) => ({
                        ...current,
                        contextType: option.type,
                        contextId: option.id,
                        contextLabel: option.label,
                      }))
                    }
                    style={[
                      styles.contextChip,
                      active && styles.contextChipActive,
                    ]}
                  >
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.contextChipText,
                        active && styles.contextChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <View style={styles.sheetAction}>
          <PrimaryButton
            label={composer.editing ? "Save edit" : "Send message"}
            busy={sending}
            onPress={() => void submitMessage()}
          />
        </View>
      </BottomSheet>
    </>
  );
}

function Summary({
  value,
  label,
  action = false,
}: {
  value: number;
  label: string;
  action?: boolean;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryNumber, action && value ? styles.actionNumber : undefined]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MessageBubble({
  message,
  own,
  onPress,
  onContext,
}: {
  message: HouseholdMessage;
  own: boolean;
  onPress: () => void;
  onContext: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onPress}
      style={[styles.messageRow, own && styles.messageRowOwn]}
    >
      <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
        {!own ? <Text style={styles.senderName}>{message.senderName}</Text> : null}
        {message.replyPreview ? (
          <View style={styles.replyPreview}>
            <Text numberOfLines={2} style={styles.replyPreviewText}>
              {message.replyPreview}
            </Text>
          </View>
        ) : null}
        {message.deletedAt ? (
          <Text style={styles.removedText}>Message removed</Text>
        ) : (
          <>
            {message.attachmentUrl ? (
              <View style={styles.attachmentWrap}>
                <ItemPhoto uri={message.attachmentUrl} size={180} />
              </View>
            ) : null}
            {message.body ? (
              <Text style={[styles.messageBody, own && styles.messageBodyOwn]}>
                {message.body}
              </Text>
            ) : null}
            {message.contextLabel ? (
              <Pressable style={styles.contextCard} onPress={onContext}>
                <Text style={styles.contextCardLabel}>Linked in HomeBridge</Text>
                <Text style={styles.contextCardTitle}>{message.contextLabel}</Text>
              </Pressable>
            ) : null}
          </>
        )}
        <Text style={[styles.messageMeta, own && styles.messageMetaOwn]}>
          {formatTime(message.createdAt)}
          {message.editedAt ? " · edited" : ""}
          {own && !message.deletedAt ? (message.readByOther ? " · Read" : " · Sent") : ""}
        </Text>
      </View>
    </Pressable>
  );
}

function NotificationCard({
  item,
  onPress,
}: {
  item: ReturnType<typeof useCommunication>["notifications"][number];
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <Card
        style={
          !item.readAt
            ? [styles.notificationCard, styles.unreadCard]
            : styles.notificationCard
        }
      >
        <View style={styles.notificationTop}>
          <View
            style={[
              styles.kindIcon,
              item.requiresAction && styles.kindIconAction,
            ]}
          >
            <Text style={styles.kindIconText}>
              {item.requiresAction ? "!" : "•"}
            </Text>
          </View>
          <View style={styles.notificationCopy}>
            <Text style={styles.notificationTitle}>{item.title}</Text>
            <Text style={styles.notificationBody}>{item.body}</Text>
            <Text style={styles.notificationMeta}>
              {item.actorName} · {formatDay(item.createdAt)} at{" "}
              {formatTime(item.createdAt)}
            </Text>
          </View>
          {!item.readAt ? <View style={styles.unreadDot} /> : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.background },
  headerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: 130 },
  messageContent: { padding: spacing.lg, paddingBottom: 115 },
  summaryRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  summaryCard: {
    flex: 1,
    minHeight: 64,
    borderRadius: radii.md,
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryNumber: { color: colours.tealDark, fontSize: 22, fontWeight: "900" },
  actionNumber: { color: colours.rose },
  summaryLabel: { color: colours.muted, fontSize: 10, fontWeight: "800" },
  segmentRow: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radii.pill,
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
    marginBottom: spacing.sm,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: colours.tealDark },
  segmentText: { color: colours.muted, fontSize: 12, fontWeight: "900" },
  segmentTextActive: { color: colours.white },
  olderButton: { marginTop: spacing.md },
  messageRow: { alignItems: "flex-start", marginTop: spacing.md },
  messageRowOwn: { alignItems: "flex-end" },
  bubble: { maxWidth: "86%", borderRadius: 20, padding: spacing.md },
  bubbleOwn: { backgroundColor: colours.tealDark, borderBottomRightRadius: 6 },
  bubbleOther: {
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
    borderBottomLeftRadius: 6,
  },
  senderName: { color: colours.tealDark, fontSize: 11, fontWeight: "900", marginBottom: 4 },
  messageBody: { color: colours.ink, fontSize: 15, lineHeight: 21 },
  messageBodyOwn: { color: colours.white },
  messageMeta: { color: colours.muted, fontSize: 9, marginTop: 7, textAlign: "right" },
  messageMetaOwn: { color: "#D7EFEC" },
  removedText: { color: colours.muted, fontStyle: "italic", fontSize: 14 },
  replyPreview: {
    borderLeftWidth: 3,
    borderLeftColor: colours.amber,
    paddingLeft: spacing.sm,
    marginBottom: spacing.sm,
  },
  replyPreviewText: { color: colours.muted, fontSize: 11, lineHeight: 16 },
  attachmentWrap: { marginBottom: spacing.sm, alignItems: "center" },
  contextCard: {
    marginTop: spacing.sm,
    backgroundColor: colours.tealSoft,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  contextCardLabel: { color: colours.tealDark, fontSize: 9, fontWeight: "900" },
  contextCardTitle: { color: colours.ink, fontSize: 12, fontWeight: "900", marginTop: 2 },
  composeBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.md,
    minHeight: 62,
    borderRadius: 24,
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    elevation: 8,
    shadowColor: colours.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  composePrompt: { flex: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  composePromptText: { color: colours.muted, fontSize: 14 },
  sendCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colours.tealDark, alignItems: "center", justifyContent: "center" },
  sendCircleText: { color: colours.white, fontSize: 24, fontWeight: "600" },
  requestCard: { marginBottom: spacing.md, backgroundColor: colours.amberSoft, borderColor: "#E7D6B8" },
  waitingCard: { marginBottom: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  requestTitle: { color: colours.ink, fontSize: 16, fontWeight: "900" },
  requestMeta: { color: colours.tealDark, fontSize: 12, fontWeight: "700", marginTop: 3 },
  requestNote: { color: colours.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  requestActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1 },
  markRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colours.ink, fontSize: 19, fontWeight: "900", marginBottom: spacing.md },
  markAll: { color: colours.tealDark, fontSize: 12, fontWeight: "900", marginBottom: spacing.md },
  notificationCard: { marginBottom: spacing.md },
  unreadCard: { borderColor: colours.teal, backgroundColor: "#F5FBFA" },
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
  replyBox: { backgroundColor: colours.background, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.md },
  replyLabel: { color: colours.tealDark, fontSize: 11, fontWeight: "900" },
  replyText: { color: colours.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  composeOptions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  optionButton: { flex: 1, minHeight: 40, borderRadius: radii.md, backgroundColor: colours.tealSoft, alignItems: "center", justifyContent: "center" },
  optionText: { color: colours.tealDark, fontSize: 12, fontWeight: "900" },
  contextTitle: { color: colours.ink, fontSize: 14, fontWeight: "900", marginTop: spacing.lg },
  contextHelp: { color: colours.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  contextGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  contextChip: { width: "48%", minHeight: 48, borderRadius: radii.md, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface, padding: spacing.sm, justifyContent: "center" },
  contextChipActive: { backgroundColor: colours.tealDark, borderColor: colours.tealDark },
  contextChipText: { color: colours.ink, fontSize: 11, fontWeight: "800" },
  contextChipTextActive: { color: colours.white },
  sheetAction: { marginTop: spacing.xl },
  bottomSpace: { height: 28 },
});
