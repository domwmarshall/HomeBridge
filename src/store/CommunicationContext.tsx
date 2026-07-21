import * as Notifications from "expo-notifications";
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { errorMessage } from "../lib/errors";
import { notificationPermission } from "../lib/notifications";
import {
  deletePrivatePhoto,
  signedPhotoUrl,
  uploadPrivatePhoto,
} from "../lib/photos";
import { supabase } from "../lib/supabase";
import { useApp } from "./AppContext";
import {
  HouseholdMessage,
  HouseholdNotification,
  ItemRequest,
  ItemRequestStatus,
  NewHouseholdMessage,
  TabKey,
  Workspace,
} from "../types";

interface CommunicationValue {
  notifications: HouseholdNotification[];
  itemRequests: ItemRequest[];
  messages: HouseholdMessage[];
  unreadCount: number;
  messageUnreadCount: number;
  actionCount: number;
  loading: boolean;
  messagesLoading: boolean;
  error: string | null;
  available: boolean;
  hasOlderMessages: boolean;
  refresh: () => Promise<void>;
  loadOlderMessages: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markMessagesRead: (ids: string[]) => Promise<void>;
  sendMessage: (input: NewHouseholdMessage) => Promise<void>;
  editMessage: (id: string, body: string) => Promise<void>;
  removeMessage: (id: string) => Promise<void>;
  requestItem: (itemId: string, note?: string) => Promise<void>;
  respondItemRequest: (
    id: string,
    status: Exclude<ItemRequestStatus, "pending">,
  ) => Promise<void>;
}

const CommunicationContext = createContext<CommunicationValue | null>(null);

function targetTab(value: unknown): TabKey {
  return value === "calendar" ||
    value === "things" ||
    value === "handover" ||
    value === "child" ||
    value === "inbox"
    ? value
    : "today";
}

export function CommunicationProvider({
  workspace,
  children,
}: PropsWithChildren<{ workspace?: Workspace }>) {
  const { notificationSettings } = useApp();
  const [notifications, setNotifications] = useState<HouseholdNotification[]>(
    [],
  );
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([]);
  const [messages, setMessages] = useState<HouseholdMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(60);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [messagesLoading, setMessagesLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const refreshInFlight = useRef(false);

  const memberNames = useMemo(
    () =>
      new Map(
        (workspace?.members ?? []).map((member) => [
          member.userId,
          member.displayName,
        ]),
      ),
    [workspace?.members],
  );

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;

    if (!workspace || !supabase) {
      setNotifications([]);
      setItemRequests([]);
      setMessages([]);
      setLoading(false);
      setMessagesLoading(false);
      refreshInFlight.current = false;
      return;
    }

    setMessagesLoading(true);

    try {
      const [notificationsResult, requestsResult, messagesResult] =
        await Promise.all([
          supabase
            .from("household_notifications")
            .select("*")
            .eq("recipient_id", workspace.userId)
            .order("created_at", { ascending: false })
            .limit(150),
          supabase
            .from("item_requests")
            .select(
              "id, item_id, requested_by, note, status, created_at, responded_by, responded_at, items(name)",
            )
            .eq("household_id", workspace.householdId)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("household_messages")
            .select("*")
            .eq("household_id", workspace.householdId)
            .order("created_at", { ascending: false })
            .limit(messageLimit + 1),
        ]);

      if (notificationsResult.error) throw notificationsResult.error;
      if (requestsResult.error) throw requestsResult.error;
      if (messagesResult.error) throw messagesResult.error;

      const allMessageRows = (messagesResult.data ?? []) as Array<
        Record<string, any>
      >;
      const rawMessages = allMessageRows.slice(0, messageLimit);
      setHasOlderMessages(allMessageRows.length > messageLimit);

      const messageIds = rawMessages.map((row) => String(row.id));
      let readRows: Array<{
        message_id: string;
        user_id: string;
        read_at: string;
      }> = [];
      if (messageIds.length) {
        const readsResult = await supabase
          .from("household_message_reads")
          .select("message_id, user_id, read_at")
          .in("message_id", messageIds);
        if (readsResult.error) throw readsResult.error;
        readRows = (readsResult.data ?? []) as typeof readRows;
      }

      const readsByMessage = new Map<string, Set<string>>();
      for (const row of readRows) {
        const users = readsByMessage.get(row.message_id) ?? new Set<string>();
        users.add(row.user_id);
        readsByMessage.set(row.message_id, users);
      }

      const rawById = new Map<string, Record<string, any>>(
        rawMessages.map((row) => [String(row.id), row]),
      );

      const mappedMessages = await Promise.all(
        rawMessages.map(async (row: Record<string, any>) => {
          const readers = readsByMessage.get(row.id) ?? new Set<string>();
          const reply = row.reply_to_id
            ? rawById.get(row.reply_to_id)
            : undefined;
          return {
            id: row.id,
            senderId: row.sender_id,
            senderName:
              memberNames.get(row.sender_id) ??
              (row.sender_id === workspace.userId ? "You" : "Other parent"),
            body: row.body ?? undefined,
            replyToId: row.reply_to_id ?? undefined,
            replyPreview:
              reply?.deleted_at != null
                ? "Message removed"
                : reply?.body?.slice(0, 120) ?? undefined,
            attachmentPath: row.attachment_path ?? undefined,
            attachmentUrl: await signedPhotoUrl(
              row.attachment_path ?? undefined,
            ),
            attachmentName: row.attachment_name ?? undefined,
            attachmentMimeType: row.attachment_mime_type ?? undefined,
            contextType: row.context_type ?? undefined,
            contextId: row.context_id ?? undefined,
            contextLabel: row.context_label ?? undefined,
            createdAt: row.created_at,
            editedAt: row.edited_at ?? undefined,
            deletedAt: row.deleted_at ?? undefined,
            readByOther: [...readers].some(
              (readerId) => readerId !== row.sender_id,
            ),
            readByMe: readers.has(workspace.userId),
          } satisfies HouseholdMessage;
        }),
      );

      setNotifications(
        (notificationsResult.data ?? []).map((row: Record<string, any>) => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          targetTab: targetTab(row.target_tab),
          entityType: row.entity_type ?? undefined,
          entityId: row.entity_id ?? undefined,
          actorId: row.actor_id ?? undefined,
          actorName: row.actor_id
            ? memberNames.get(row.actor_id) ?? "Other parent"
            : "HomeBridge",
          createdAt: row.created_at,
          readAt: row.read_at ?? undefined,
          requiresAction: Boolean(row.requires_action),
        })),
      );

      setItemRequests(
        (requestsResult.data ?? []).map((row: Record<string, any>) => ({
          id: row.id,
          itemId: row.item_id,
          itemName: row.items?.name ?? "Tracked item",
          requestedBy: row.requested_by,
          requestedByName:
            memberNames.get(row.requested_by) ?? "Other parent",
          note: row.note ?? undefined,
          status: row.status,
          createdAt: row.created_at,
          respondedBy: row.responded_by ?? undefined,
          respondedAt: row.responded_at ?? undefined,
        })),
      );
      setMessages(mappedMessages);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not refresh the shared inbox."));
    } finally {
      loadedRef.current = true;
      setLoading(false);
      setMessagesLoading(false);
      refreshInFlight.current = false;
    }
  }, [workspace, memberNames, messageLimit]);

  const presentNotification = useCallback(
    async (row: Record<string, any>) => {
      if (!notificationSettings.enabled) return;
      if ((await notificationPermission()) !== "granted") return;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: row.title ?? "HomeBridge update",
          body: row.body ?? "Open HomeBridge to review the change.",
          data: {
            screen: targetTab(row.target_tab),
            notificationId: String(row.id ?? ""),
            entityType: row.entity_type ?? "",
            entityId: row.entity_id ?? "",
          },
        },
        trigger: null,
      });
    },
    [notificationSettings.enabled],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!workspace || !supabase) return;
    const channel = supabase
      .channel(
        `homebridge-communication-${workspace.householdId}-${workspace.userId}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "household_notifications",
          filter: `recipient_id=eq.${workspace.userId}`,
        },
        (payload) => {
          if (loadedRef.current) {
            void presentNotification(payload.new as Record<string, any>);
          }
          void refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "item_requests",
          filter: `household_id=eq.${workspace.householdId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_messages",
          filter: `household_id=eq.${workspace.householdId}`,
        },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "household_message_reads",
        },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [workspace, refresh, presentNotification]);

  const value = useMemo<CommunicationValue>(() => {
    const updateUnread = notifications.filter((item) => !item.readAt).length;
    const messageUnreadCount = messages.filter(
      (item) =>
        item.senderId !== workspace?.userId &&
        !item.readByMe &&
        !item.deletedAt,
    ).length;
    const actionCount = notifications.filter(
      (item) => item.requiresAction && !item.readAt,
    ).length;

    return {
      notifications,
      itemRequests,
      messages,
      unreadCount: updateUnread + messageUnreadCount,
      messageUnreadCount,
      actionCount,
      loading,
      messagesLoading,
      error,
      available: Boolean(workspace && workspace.members.length > 1),
      hasOlderMessages,
      refresh,
      loadOlderMessages: () => setMessageLimit((current) => current + 50),
      markRead: async (id) => {
        if (!workspace || !supabase) return;
        const { error: updateError } = await supabase
          .from("household_notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("id", id)
          .eq("recipient_id", workspace.userId);
        if (updateError) throw new Error(errorMessage(updateError));
        setNotifications((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, readAt: new Date().toISOString() }
              : item,
          ),
        );
      },
      markAllRead: async () => {
        if (!workspace || !supabase) return;
        const readAt = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("household_notifications")
          .update({ read_at: readAt })
          .eq("recipient_id", workspace.userId)
          .is("read_at", null);
        if (updateError) throw new Error(errorMessage(updateError));
        setNotifications((current) =>
          current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
        );
      },
      markMessagesRead: async (ids) => {
        if (!workspace || !supabase || !ids.length) return;
        const { error: rpcError } = await supabase.rpc(
          "mark_household_messages_read",
          {
            p_household_id: workspace.householdId,
            p_message_ids: ids,
          },
        );
        if (rpcError) throw new Error(errorMessage(rpcError));
        setMessages((current) =>
          current.map((message) =>
            ids.includes(message.id) ? { ...message, readByMe: true } : message,
          ),
        );
      },
      sendMessage: async (input) => {
        if (!workspace || !supabase) {
          throw new Error("Connect the shared household before messaging.");
        }
        if (workspace.members.length < 2) {
          throw new Error("Invite the other parent before sending a message.");
        }

        let attachmentPath: string | undefined;
        try {
          if (input.attachment) {
            attachmentPath = await uploadPrivatePhoto(
              workspace.householdId,
              "messages",
              input.attachment,
            );
          }
          const { error: rpcError } = await supabase.rpc(
            "send_household_message",
            {
              p_household_id: workspace.householdId,
              p_body: input.body?.trim() || null,
              p_reply_to_id: input.replyToId ?? null,
              p_attachment_path: attachmentPath ?? null,
              p_attachment_name: input.attachment?.fileName ?? null,
              p_attachment_mime_type: input.attachment?.mimeType ?? null,
              p_context_type: input.contextType ?? null,
              p_context_id: input.contextId ?? null,
              p_context_label: input.contextLabel ?? null,
              p_client_id: input.clientId,
            },
          );
          if (rpcError) throw rpcError;
          await refresh();
        } catch (caught) {
          if (attachmentPath) {
            await deletePrivatePhoto(attachmentPath).catch(() => undefined);
          }
          throw new Error(errorMessage(caught, "The message could not be sent."));
        }
      },
      editMessage: async (id, body) => {
        if (!workspace || !supabase) return;
        const { error: rpcError } = await supabase.rpc(
          "edit_household_message",
          { p_message_id: id, p_body: body.trim() },
        );
        if (rpcError) throw new Error(errorMessage(rpcError));
        await refresh();
      },
      removeMessage: async (id) => {
        if (!workspace || !supabase) return;
        const message = messages.find((item) => item.id === id);
        const { error: rpcError } = await supabase.rpc(
          "remove_household_message",
          { p_message_id: id },
        );
        if (rpcError) throw new Error(errorMessage(rpcError));
        if (message?.attachmentPath) {
          await deletePrivatePhoto(message.attachmentPath).catch(() => undefined);
        }
        await refresh();
      },
      requestItem: async (itemId, note) => {
        if (!workspace || !supabase) {
          throw new Error(
            "Connect the shared household before requesting an item.",
          );
        }
        const { error: rpcError } = await supabase.rpc("create_item_request", {
          p_item_id: itemId,
          p_note: note?.trim() || null,
        });
        if (rpcError) throw new Error(errorMessage(rpcError));
        await refresh();
      },
      respondItemRequest: async (id, status) => {
        if (!workspace || !supabase) {
          throw new Error("Connect the shared household before responding.");
        }
        const { error: rpcError } = await supabase.rpc(
          "respond_item_request",
          { p_request_id: id, p_status: status },
        );
        if (rpcError) throw new Error(errorMessage(rpcError));
        await refresh();
      },
    };
  }, [
    notifications,
    itemRequests,
    messages,
    loading,
    messagesLoading,
    error,
    workspace,
    hasOlderMessages,
    refresh,
  ]);

  return (
    <CommunicationContext.Provider value={value}>
      {children}
    </CommunicationContext.Provider>
  );
}

export function useCommunication(): CommunicationValue {
  const value = useContext(CommunicationContext);
  if (!value) {
    throw new Error(
      "useCommunication must be used inside CommunicationProvider",
    );
  }
  return value;
}
