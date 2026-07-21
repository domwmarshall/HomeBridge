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
import { supabase } from "../lib/supabase";
import { useApp } from "./AppContext";
import {
  HouseholdNotification,
  ItemRequest,
  ItemRequestStatus,
  TabKey,
  Workspace,
} from "../types";

interface CommunicationValue {
  notifications: HouseholdNotification[];
  itemRequests: ItemRequest[];
  unreadCount: number;
  actionCount: number;
  loading: boolean;
  error: string | null;
  available: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
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
  const [notifications, setNotifications] = useState<HouseholdNotification[]>([]);
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([]);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

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
    if (!workspace || !supabase) {
      setNotifications([]);
      setItemRequests([]);
      setLoading(false);
      return;
    }

    try {
      const [notificationsResult, requestsResult] = await Promise.all([
        supabase
          .from("household_notifications")
          .select("*")
          .eq("recipient_id", workspace.userId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("item_requests")
          .select("id, item_id, requested_by, note, status, created_at, responded_by, responded_at, items(name)")
          .eq("household_id", workspace.householdId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (notificationsResult.error) throw notificationsResult.error;
      if (requestsResult.error) throw requestsResult.error;

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
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Could not refresh the shared inbox."));
    } finally {
      loadedRef.current = true;
      setLoading(false);
    }
  }, [workspace, memberNames]);

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
      .channel(`homebridge-communication-${workspace.householdId}-${workspace.userId}`)
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
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [workspace, refresh, presentNotification]);

  const value = useMemo<CommunicationValue>(() => {
    const unreadCount = notifications.filter((item) => !item.readAt).length;
    const actionCount = notifications.filter(
      (item) => item.requiresAction && !item.readAt,
    ).length;

    return {
      notifications,
      itemRequests,
      unreadCount,
      actionCount,
      loading,
      error,
      available: Boolean(workspace && workspace.members.length > 1),
      refresh,
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
      requestItem: async (itemId, note) => {
        if (!workspace || !supabase) {
          throw new Error("Connect the shared household before requesting an item.");
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
        const { error: rpcError } = await supabase.rpc("respond_item_request", {
          p_request_id: id,
          p_status: status,
        });
        if (rpcError) throw new Error(errorMessage(rpcError));
        await refresh();
      },
    };
  }, [
    notifications,
    itemRequests,
    loading,
    error,
    workspace,
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
    throw new Error("useCommunication must be used inside CommunicationProvider");
  }
  return value;
}
