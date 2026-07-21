import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";
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
import { demoState } from "../data/demoData";
import { errorMessage } from "../lib/errors";
import {
  defaultNotificationSettings,
  loadNotificationSettings,
  notificationPermission,
  requestNotificationPermission,
  saveNotificationSettings,
  syncLocalNotifications,
} from "../lib/notifications";
import {
  deletePrivatePhoto,
  signedPhotoUrl,
  uploadPrivatePhoto,
} from "../lib/photos";
import { supabase } from "../lib/supabase";
import {
  householdForDate,
  nextHandoverDate,
  normalisedHandoverAnchor,
  parentForHome,
} from "../utils/calendar";
import {
  AppState,
  CalendarEvent,
  CareChangeRequest,
  CareChangeStatus,
  CareOverride,
  CareOverrideInput,
  CareScheduleInput,
  CareScheduleRule,
  ChildProfileInput,
  EditableCalendarEvent,
  HandoverTask,
  HouseholdLocation,
  ItemInput,
  MedicalItemInput,
  NewCalendarEvent,
  NotificationPermission,
  NotificationSettings,
  ParentLabel,
  PendingInvite,
  SyncState,
  Workspace,
} from "../types";

const DEMO_STORAGE_KEY = "@homebridge/demo-state-v5";
const liveStorageKey = (householdId: string) =>
  `@homebridge/live-cache-v5/${householdId}`;

interface AppContextValue {
  state: AppState;
  hydrated: boolean;
  mode: "demo" | "live";
  syncState: SyncState;
  syncError: string | null;
  lastSyncedAt: string | null;
  viewerName: string;
  viewerUserId: string;
  workspaceRole: Workspace["role"];
  members: Workspace["members"];
  pendingInvites: PendingInvite[];
  notificationSettings: NotificationSettings;
  notificationPermission: NotificationPermission;
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>;
  requestNotifications: () => Promise<NotificationPermission>;
  toggleHandoverTask: (id: string) => Promise<void>;
  updateHandoverNote: (value: string) => void;
  completeHandover: () => Promise<void>;
  addHandoverTask: (input: {
    label: string;
    itemId?: string;
    essential: boolean;
  }) => Promise<void>;
  addItemsToHandover: (itemIds: string[]) => Promise<number>;
  deleteHandoverTask: (id: string) => Promise<void>;
  moveItem: (id: string, location: HouseholdLocation) => Promise<void>;
  addItem: (item: ItemInput) => Promise<void>;
  updateItem: (id: string, item: ItemInput) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  addEvent: (event: NewCalendarEvent) => Promise<void>;
  updateEvent: (event: EditableCalendarEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  acknowledgeEvent: (id: string) => Promise<void>;
  addCareOverride: (input: CareOverrideInput) => Promise<void>;
  updateCareOverride: (id: string, input: CareOverrideInput) => Promise<void>;
  deleteCareOverride: (id: string) => Promise<void>;
  proposeCareChange: (input: CareOverrideInput) => Promise<void>;
  respondCareChange: (
    id: string,
    status: Extract<CareChangeStatus, "accepted" | "rejected">,
  ) => Promise<void>;
  cancelCareChange: (id: string) => Promise<void>;
  updateCareSchedule: (input: CareScheduleInput) => Promise<void>;
  updateChild: (input: ChildProfileInput) => Promise<void>;
  addMedicalItem: (input: MedicalItemInput) => Promise<void>;
  updateMedicalItem: (id: string, input: MedicalItemInput) => Promise<void>;
  deleteMedicalItem: (id: string) => Promise<void>;
  createInvite: (parentLabel: ParentLabel) => Promise<PendingInvite>;
  revokeInvite: (inviteId: string) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function cachedState(value: string): AppState {
  const parsed = JSON.parse(value) as Partial<AppState>;
  return {
    ...demoState,
    ...parsed,
    child: { ...demoState.child, ...(parsed.child ?? {}) },
    events: parsed.events ?? [],
    items: parsed.items ?? [],
    handoverTasks: parsed.handoverTasks ?? [],
    medicalItems: parsed.medicalItems ?? [],
    careScheduleRules: parsed.careScheduleRules ?? [],
    careOverrides: parsed.careOverrides ?? [],
    careChangeRequests: parsed.careChangeRequests ?? [],
    handoverNote: parsed.handoverNote ?? "",
  };
}

function parentFromHousehold(value: string | null | undefined): ParentLabel {
  return value?.toLowerCase().includes("mum") ? "Mum" : "Dad";
}

async function photoUrls<T extends { photoPath?: string }>(
  rows: T[],
): Promise<Array<T & { photoUrl?: string }>> {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      photoUrl: await signedPhotoUrl(row.photoPath),
    })),
  );
}

async function loadLiveState(workspace: Workspace): Promise<AppState> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const [
    childResult,
    eventsResult,
    itemsResult,
    medicalResult,
    handoverResult,
    scheduleResult,
    overridesResult,
    changeRequestsResult,
  ] = await Promise.all([
    supabase.from("children").select("*").eq("id", workspace.childId).single(),
    supabase
      .from("calendar_events")
      .select("*")
      .eq("household_id", workspace.householdId)
      .order("starts_at"),
    supabase
      .from("items")
      .select("*")
      .eq("household_id", workspace.householdId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("medical_items")
      .select("*")
      .eq("household_id", workspace.householdId)
      .order("expiry_date"),
    supabase
      .from("handovers")
      .select("*")
      .eq("household_id", workspace.householdId)
      .is("completed_at", null)
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("care_schedule_rules")
      .select("*")
      .eq("household_id", workspace.householdId)
      .order("starts_on"),
    supabase
      .from("care_overrides")
      .select("*")
      .eq("household_id", workspace.householdId)
      .order("starts_on"),
    supabase
      .from("care_change_requests")
      .select("*")
      .eq("household_id", workspace.householdId)
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [
    childResult,
    eventsResult,
    itemsResult,
    medicalResult,
    handoverResult,
    scheduleResult,
    overridesResult,
    changeRequestsResult,
  ]) {
    if (result.error) throw result.error;
  }

  const childRow = childResult.data as Record<string, any>;
  const eventRows = (eventsResult.data ?? []) as Array<Record<string, any>>;
  const itemRows = (itemsResult.data ?? []) as Array<Record<string, any>>;
  const medicalRows = (medicalResult.data ?? []) as Array<Record<string, any>>;
  const scheduleRows = (scheduleResult.data ?? []) as Array<
    Record<string, any>
  >;
  const overrideRows = (overridesResult.data ?? []) as Array<
    Record<string, any>
  >;
  const changeRequestRows = (changeRequestsResult.data ?? []) as Array<
    Record<string, any>
  >;
  const handoverRow = handoverResult.data as Record<string, any> | null;

  const [ackResult, tasksResult] = await Promise.all([
    eventRows.length
      ? supabase
          .from("event_acknowledgements")
          .select("event_id")
          .eq("user_id", workspace.userId)
          .in(
            "event_id",
            eventRows.map((row) => row.id),
          )
      : Promise.resolve({ data: [], error: null } as any),
    handoverRow
      ? supabase
          .from("handover_items")
          .select("*")
          .eq("handover_id", handoverRow.id)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (ackResult.error) throw ackResult.error;
  if (tasksResult.error) throw tasksResult.error;

  const acknowledged = new Set(
    (ackResult.data ?? []).map((row: any) => row.event_id),
  );

  const fallbackHandover = new Date();
  fallbackHandover.setDate(fallbackHandover.getDate() + 7);
  fallbackHandover.setHours(15, 15, 0, 0);

  const currentHousehold =
    childRow.current_household_label === "Mum's house"
      ? "Mum's house"
      : "Dad's house";

  const careScheduleRules: CareScheduleRule[] = scheduleRows.map((row) => ({
    id: row.id,
    title: row.title,
    startsOn: row.starts_on,
    householdLabel:
      row.household_label === "Mum's house" ? "Mum's house" : "Dad's house",
    pickupParentLabel: row.pickup_parent_label ?? undefined,
    pickupLocation: row.pickup_location ?? undefined,
    recurrenceRule: row.recurrence_rule,
  }));
  const careOverrides: CareOverride[] = overrideRows.map((row) => ({
    id: row.id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    householdLabel:
      row.household_label === "Mum's house" ? "Mum's house" : "Dad's house",
    note: row.note ?? undefined,
  }));
  const scheduleHandover = nextHandoverDate(
    new Date(),
    careScheduleRules,
    true,
  );
  if (scheduleHandover) scheduleHandover.setHours(15, 15, 0, 0);
  const nextAt =
    scheduleHandover?.toISOString() ??
    handoverRow?.starts_at ??
    fallbackHandover.toISOString();
  const scheduledDestination = scheduleHandover
    ? householdForDate(
        scheduleHandover,
        careScheduleRules,
        careOverrides,
        currentHousehold,
      )
    : undefined;
  const nextTo = scheduledDestination
    ? parentForHome(scheduledDestination)
    : parentFromHousehold(
        handoverRow?.to_household_label ??
          (currentHousehold === "Dad's house" ? "Mum's house" : "Dad's house"),
      );
  const pickupParent =
    careScheduleRules[0]?.pickupParentLabel ??
    handoverRow?.pickup_parent_label ??
    nextTo;
  const pickupLocation =
    careScheduleRules[0]?.pickupLocation ??
    handoverRow?.pickup_location ??
    "the agreed handover point";

  const items = await photoUrls(
    itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: row.quantity,
      location: row.current_location,
      neededAt: row.needed_at ?? undefined,
      photoPath: row.photo_path ?? undefined,
      minimumAtDad: row.minimum_at_dad ?? undefined,
      minimumAtMum: row.minimum_at_mum ?? undefined,
      notes: row.notes ?? undefined,
    })),
  );

  const medicalItems = await photoUrls(
    medicalRows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      expiryDate: row.expiry_date
        ? new Date(`${row.expiry_date}T12:00:00`).toISOString()
        : new Date("2099-01-01T12:00:00").toISOString(),
      quantity: row.quantity,
      lastCheckedAt: row.last_checked_at ?? row.updated_at,
      replacementStatus: row.replacement_status,
      photoPath: row.label_photo_path ?? undefined,
      notes: row.notes ?? undefined,
    })),
  );

  const events = await photoUrls(
    eventRows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at ?? undefined,
      category: row.category,
      responsibleParent: row.responsible_parent_label,
      location: row.location ?? undefined,
      notes: row.notes ?? undefined,
      acknowledged: acknowledged.has(row.id),
      allDay: Boolean(row.all_day),
      rsvpDeadline: row.rsvp_deadline
        ? new Date(`${row.rsvp_deadline}T12:00:00`).toISOString()
        : undefined,
      requiredItemIds: Array.isArray(row.required_item_ids)
        ? row.required_item_ids
        : [],
      photoPath: row.attachment_path ?? undefined,
    })),
  );

  return {
    child: {
      id: childRow.id,
      name: childRow.first_name,
      initials: String(childRow.first_name || "?")
        .slice(0, 1)
        .toUpperCase(),
      school: childRow.school_name || "School not added",
      className: childRow.class_name || "Class not added",
      currentHousehold,
      nextHandoverAt: nextAt,
      nextHandoverTo: nextTo,
      collectionPlan: `${pickupParent} collects from ${pickupLocation}`,
      allergies: childRow.allergies ?? [],
      clothingSize: childRow.clothing_size || "Size not added",
      shoeSize: childRow.shoe_size || "Not added",
    },
    events,
    items,
    handoverTasks: (tasksResult.data ?? []).map((row: any) => ({
      id: row.id,
      label: row.label,
      itemId: row.item_id ?? undefined,
      done: row.is_done,
      essential: row.is_essential,
    })),
    medicalItems,
    careScheduleRules,
    careOverrides,
    careChangeRequests: changeRequestRows.map((row): CareChangeRequest => ({
      id: row.id,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      householdLabel:
        row.household_label === "Mum's house" ? "Mum's house" : "Dad's house",
      note: row.note ?? undefined,
      status: row.status,
      requestedBy: row.requested_by,
      requestedByName: row.requested_by_name ?? "Other parent",
      requestedAt: row.created_at,
      respondedBy: row.responded_by ?? undefined,
      respondedAt: row.responded_at ?? undefined,
    })),
    handoverNote: handoverRow?.note ?? "",
    activeHandoverId: handoverRow?.id ?? undefined,
  };
}

export function AppProvider({
  children,
  workspace,
}: PropsWithChildren<{ workspace?: Workspace }>) {
  const mode = workspace ? "live" : "demo";
  const [state, setState] = useState<AppState>(demoState);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(
    workspace ? "connecting" : "local",
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(defaultNotificationSettings);
  const [notificationPermissionState, setNotificationPermissionState] =
    useState<NotificationPermission>("undetermined");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!workspace) return;
    setSyncState("connecting");
    try {
      const fresh = await loadLiveState(workspace);
      setState(fresh);
      await AsyncStorage.setItem(
        liveStorageKey(workspace.householdId),
        JSON.stringify(fresh),
      );
      setSyncError(null);
      setLastSyncedAt(new Date().toISOString());
      setSyncState("synced");
    } catch (caught) {
      setSyncError(errorMessage(caught, "Could not sync HomeBridge."));
      setSyncState("offline");
    } finally {
      setHydrated(true);
    }
  }, [workspace]);

  useEffect(() => {
    setHydrated(false);
    if (!workspace) {
      AsyncStorage.getItem(DEMO_STORAGE_KEY)
        .then((saved) => {
          if (saved) setState(cachedState(saved));
          else setState(demoState);
        })
        .finally(() => {
          setSyncState("local");
          setHydrated(true);
        });
      return;
    }

    AsyncStorage.getItem(liveStorageKey(workspace.householdId))
      .then((saved) => {
        if (saved) setState(cachedState(saved));
      })
      .finally(() => {
        void refresh();
      });
  }, [workspace, refresh]);

  useEffect(() => {
    if (!hydrated) return;
    const key = workspace
      ? liveStorageKey(workspace.householdId)
      : DEMO_STORAGE_KEY;
    AsyncStorage.setItem(key, JSON.stringify(state)).catch(() => undefined);
  }, [state, hydrated, workspace]);

  useEffect(() => {
    loadNotificationSettings()
      .then(setNotificationSettings)
      .catch(() => setNotificationSettings(defaultNotificationSettings));
    notificationPermission()
      .then(setNotificationPermissionState)
      .catch(() => setNotificationPermissionState("undetermined"));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void syncLocalNotifications(state, notificationSettings).catch(
        () => undefined,
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [state, notificationSettings, hydrated]);

  useEffect(() => {
    if (!workspace) return;
    const subscription = Network.addNetworkStateListener((networkState) => {
      if (
        networkState.isConnected === false ||
        networkState.isInternetReachable === false
      ) {
        setSyncState("offline");
        return;
      }
      void refresh();
    });
    return () => subscription.remove();
  }, [workspace, refresh]);

  useEffect(() => {
    if (!workspace || !supabase) return;

    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refresh();
      }, 350);
    };

    const filter = `household_id=eq.${workspace.householdId}`;
    const channel = supabase
      .channel(`homebridge-${workspace.householdId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "children", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calendar_events", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "care_schedule_rules", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "care_overrides", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "care_change_requests", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "handovers", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medical_items", filter },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "handover_items" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_acknowledgements" },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setSyncState("synced");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncState("offline");
        }
      });

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase?.removeChannel(channel);
    };
  }, [workspace, refresh]);

  useEffect(() => {
    if (!workspace || !state.activeHandoverId || !hydrated || !supabase) {
      return;
    }

    const client = supabase;
    const timer = setTimeout(async () => {
      const { error } = await client
        .from("handovers")
        .update({
          note: state.handoverNote,
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.activeHandoverId);

      if (error) {
        setSyncError(errorMessage(error));
        setSyncState("offline");
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [state.handoverNote, state.activeHandoverId, hydrated, workspace]);

  const liveMutation = useCallback(
    async (operation: () => Promise<void>) => {
      setSyncState("connecting");
      try {
        await operation();
        await refresh();
      } catch (caught) {
        const message = errorMessage(caught, "The change could not be saved.");
        setSyncError(message);
        setSyncState("offline");
        throw new Error(message);
      }
    },
    [refresh],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      hydrated,
      mode,
      syncState,
      syncError,
      lastSyncedAt,
      viewerName: workspace?.displayName ?? "Parent 1",
      viewerUserId: workspace?.userId ?? "demo-parent-1",
      workspaceRole: workspace?.role ?? "owner",
      members: workspace?.members ?? [
        {
          userId: "demo-parent-1",
          displayName: "Parent 1",
          parentLabel: "Dad",
          role: "owner",
        },
        {
          userId: "demo-parent-2",
          displayName: "Parent 2",
          parentLabel: "Mum",
          role: "parent",
        },
      ],
      pendingInvites: workspace?.pendingInvites ?? [],
      notificationSettings,
      notificationPermission: notificationPermissionState,
      updateNotificationSettings: async (settings) => {
        setNotificationSettings(settings);
        await saveNotificationSettings(settings);
        await syncLocalNotifications(state, settings);
      },
      requestNotifications: async () => {
        const permission = await requestNotificationPermission();
        setNotificationPermissionState(permission);
        if (permission === "granted") {
          const settings = { ...notificationSettings, enabled: true };
          setNotificationSettings(settings);
          await saveNotificationSettings(settings);
          await syncLocalNotifications(state, settings);
        }
        return permission;
      },

      toggleHandoverTask: async (id) => {
        const task = state.handoverTasks.find((entry) => entry.id === id);
        if (!task) return;
        const nextDone = !task.done;

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            handoverTasks: current.handoverTasks.map((entry) =>
              entry.id === id ? { ...entry, done: nextDone } : entry,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("handover_items")
            .update({
              is_done: nextDone,
              checked_by: nextDone ? workspace.userId : null,
              checked_at: nextDone ? new Date().toISOString() : null,
            })
            .eq("id", id);
          if (error) throw error;
        });
      },

      updateHandoverNote: (handoverNote) =>
        setState((current) => ({ ...current, handoverNote })),

      completeHandover: async () => {
        if (!workspace || !supabase || !state.activeHandoverId) {
          setState((current) => {
            const destination =
              current.child.nextHandoverTo === "Mum"
                ? "Mum's house"
                : "Dad's house";
            const transferredIds = new Set(
              current.handoverTasks
                .filter((task) => task.done && task.itemId)
                .map((task) => task.itemId as string),
            );
            const nextParent =
              current.child.nextHandoverTo === "Mum" ? "Dad" : "Mum";
            return {
              ...current,
              child: {
                ...current.child,
                currentHousehold: destination,
                nextHandoverTo: nextParent,
                collectionPlan: `${nextParent} collects at the next agreed handover`,
              },
              items: current.items.map((item) =>
                transferredIds.has(item.id)
                  ? { ...item, location: destination, neededAt: undefined }
                  : item,
              ),
              handoverTasks: current.handoverTasks.map((task) => ({
                ...task,
                done: false,
              })),
              handoverNote: "",
            };
          });
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!.rpc("complete_handover", {
            p_handover_id: state.activeHandoverId,
          });
          if (error) throw error;
        });
      },

      addHandoverTask: async ({ label, itemId, essential }) => {
        if (!workspace || !supabase || !state.activeHandoverId) {
          const task: HandoverTask = {
            id: `task-${Date.now()}`,
            label,
            itemId,
            essential,
            done: false,
          };
          setState((current) => ({
            ...current,
            handoverTasks: [...current.handoverTasks, task],
          }));
          return;
        }

        await liveMutation(async () => {
          const nextOrder = state.handoverTasks.length * 10 + 10;
          const { error } = await supabase!.from("handover_items").insert({
            handover_id: state.activeHandoverId,
            item_id: itemId ?? null,
            label,
            sort_order: nextOrder,
            is_essential: essential,
          });
          if (error) throw error;
        });
      },

      addItemsToHandover: async (itemIds) => {
        const existing = new Set(
          state.handoverTasks
            .map((task) => task.itemId)
            .filter((value): value is string => Boolean(value)),
        );
        const itemsToAdd = state.items.filter(
          (item) => itemIds.includes(item.id) && !existing.has(item.id),
        );
        if (!itemsToAdd.length) return 0;

        if (!workspace || !supabase || !state.activeHandoverId) {
          setState((current) => ({
            ...current,
            handoverTasks: [
              ...current.handoverTasks,
              ...itemsToAdd.map((item, index) => ({
                id: `task-calendar-${Date.now()}-${index}`,
                label: item.name,
                itemId: item.id,
                done: false,
                essential: item.category === "Medical",
              })),
            ],
          }));
          return itemsToAdd.length;
        }

        await liveMutation(async () => {
          const baseOrder = state.handoverTasks.length * 10 + 10;
          const { error } = await supabase!.from("handover_items").insert(
            itemsToAdd.map((item, index) => ({
              handover_id: state.activeHandoverId,
              item_id: item.id,
              label: item.name,
              sort_order: baseOrder + index * 10,
              is_essential: item.category === "Medical",
            })),
          );
          if (error) throw error;
        });
        return itemsToAdd.length;
      },

      deleteHandoverTask: async (id) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            handoverTasks: current.handoverTasks.filter(
              (task) => task.id !== id,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("handover_items")
            .delete()
            .eq("id", id);
          if (error) throw error;
        });
      },

      moveItem: async (id, location) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            items: current.items.map((item) =>
              item.id === id ? { ...item, location } : item,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("items")
            .update({
              current_location: location,
              updated_by: workspace.userId,
            })
            .eq("id", id);
          if (error) throw error;
        });
      },

      addItem: async (item) => {
        if (!item.photo) {
          throw new Error("Choose or take a picture before adding the item.");
        }

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            items: [
              ...current.items,
              {
                ...item,
                id: `item-${Date.now()}`,
                photoUrl: item.photo?.uri,
              },
            ],
          }));
          return;
        }

        await liveMutation(async () => {
          const { data, error } = await supabase!
            .from("items")
            .insert({
              household_id: workspace.householdId,
              child_id: workspace.childId,
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              current_location: item.location,
              needed_at: item.neededAt ?? null,
              minimum_at_dad: item.minimumAtDad ?? null,
              minimum_at_mum: item.minimumAtMum ?? null,
              notes: item.notes ?? null,
              updated_by: workspace.userId,
            })
            .select("id")
            .single();

          if (error) throw error;

          try {
            const photoPath = await uploadPrivatePhoto(
              workspace.householdId,
              "items",
              item.photo!,
            );
            const update = await supabase!
              .from("items")
              .update({
                photo_path: photoPath,
                updated_by: workspace.userId,
              })
              .eq("id", data.id);
            if (update.error) throw update.error;
          } catch (caught) {
            await supabase!.from("items").delete().eq("id", data.id);
            throw caught;
          }
        });
      },

      updateItem: async (id, item) => {
        const existing = state.items.find((value) => value.id === id);
        if (!existing) throw new Error("Item not found.");
        if (!item.photo && !existing.photoPath && !existing.photoUrl) {
          throw new Error("Add a picture before saving this item.");
        }

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            items: current.items.map((value) =>
              value.id === id
                ? {
                    ...value,
                    ...item,
                    photoUrl: item.photo?.uri ?? value.photoUrl,
                  }
                : value,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          let photoPath = existing.photoPath;
          if (item.photo) {
            photoPath = await uploadPrivatePhoto(
              workspace.householdId,
              "items",
              item.photo,
            );
          }

          const { error } = await supabase!
            .from("items")
            .update({
              name: item.name,
              category: item.category,
              quantity: item.quantity,
              current_location: item.location,
              needed_at: item.neededAt ?? null,
              minimum_at_dad: item.minimumAtDad ?? null,
              minimum_at_mum: item.minimumAtMum ?? null,
              notes: item.notes ?? null,
              photo_path: photoPath ?? null,
              updated_by: workspace.userId,
            })
            .eq("id", id);

          if (error) {
            if (item.photo && photoPath) {
              await deletePrivatePhoto(photoPath).catch(() => undefined);
            }
            throw error;
          }

          if (
            item.photo &&
            existing.photoPath &&
            existing.photoPath !== photoPath
          ) {
            await deletePrivatePhoto(existing.photoPath).catch(() => undefined);
          }
        });
      },

      deleteItem: async (id) => {
        const existing = state.items.find((value) => value.id === id);
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            items: current.items.filter((item) => item.id !== id),
            handoverTasks: current.handoverTasks.filter(
              (task) => task.itemId !== id,
            ),
            events: current.events.map((event) => ({
              ...event,
              requiredItemIds: event.requiredItemIds.filter(
                (itemId) => itemId !== id,
              ),
            })),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!.from("items").delete().eq("id", id);
          if (error) throw error;
          await deletePrivatePhoto(existing?.photoPath).catch(() => undefined);
        });
      },

      addEvent: async (event) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            events: [
              ...current.events,
              {
                ...event,
                id: `event-${Date.now()}`,
                acknowledged: false,
                photoUrl: event.photo?.uri,
              },
            ],
          }));
          return;
        }

        await liveMutation(async () => {
          const { data, error } = await supabase!
            .from("calendar_events")
            .insert({
              household_id: workspace.householdId,
              child_id: workspace.childId,
              title: event.title,
              category: event.category,
              starts_at: event.startsAt,
              ends_at: event.endsAt ?? null,
              location: event.location ?? null,
              responsible_parent_label: event.responsibleParent,
              notes: event.notes ?? null,
              all_day: event.allDay,
              rsvp_deadline: event.rsvpDeadline?.slice(0, 10) ?? null,
              required_item_ids: event.requiredItemIds,
              created_by: workspace.userId,
              updated_by: workspace.userId,
            })
            .select("id")
            .single();

          if (error) throw error;

          if (event.photo) {
            try {
              const photoPath = await uploadPrivatePhoto(
                workspace.householdId,
                "calendar",
                event.photo,
              );
              const update = await supabase!
                .from("calendar_events")
                .update({
                  attachment_path: photoPath,
                  updated_by: workspace.userId,
                })
                .eq("id", data.id);
              if (update.error) throw update.error;
            } catch (caught) {
              await supabase!
                .from("calendar_events")
                .delete()
                .eq("id", data.id);
              throw caught;
            }
          }
        });
      },

      updateEvent: async (event) => {
        const existing = state.events.find((value) => value.id === event.id);
        if (!existing) throw new Error("Event not found.");

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            events: current.events.map((value) =>
              value.id === event.id
                ? {
                    ...value,
                    ...event,
                    photoUrl: event.photo?.uri ?? value.photoUrl,
                  }
                : value,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          let photoPath = existing.photoPath;
          if (event.photo) {
            photoPath = await uploadPrivatePhoto(
              workspace.householdId,
              "calendar",
              event.photo,
            );
          }

          const { error } = await supabase!
            .from("calendar_events")
            .update({
              title: event.title,
              category: event.category,
              starts_at: event.startsAt,
              ends_at: event.endsAt ?? null,
              location: event.location ?? null,
              responsible_parent_label: event.responsibleParent,
              notes: event.notes ?? null,
              all_day: event.allDay,
              rsvp_deadline: event.rsvpDeadline?.slice(0, 10) ?? null,
              required_item_ids: event.requiredItemIds,
              attachment_path: photoPath ?? null,
              updated_by: workspace.userId,
            })
            .eq("id", event.id);

          if (error) {
            if (event.photo && photoPath) {
              await deletePrivatePhoto(photoPath).catch(() => undefined);
            }
            throw error;
          }

          if (
            event.photo &&
            existing.photoPath &&
            existing.photoPath !== photoPath
          ) {
            await deletePrivatePhoto(existing.photoPath).catch(() => undefined);
          }
        });
      },

      deleteEvent: async (id) => {
        const existing = state.events.find((event) => event.id === id);
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            events: current.events.filter((event) => event.id !== id),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("calendar_events")
            .delete()
            .eq("id", id);
          if (error) throw error;
          await deletePrivatePhoto(existing?.photoPath).catch(() => undefined);
        });
      },

      acknowledgeEvent: async (id) => {
        if (!workspace || !supabase || id.startsWith("event-")) {
          setState((current) => ({
            ...current,
            events: current.events.map((event) =>
              event.id === id ? { ...event, acknowledged: true } : event,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("event_acknowledgements")
            .upsert({ event_id: id, user_id: workspace.userId });
          if (error) throw error;
        });
      },

      addCareOverride: async (input) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careOverrides: [
              ...current.careOverrides,
              { ...input, id: `override-${Date.now()}` },
            ],
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!.from("care_overrides").insert({
            household_id: workspace.householdId,
            child_id: workspace.childId,
            starts_on: input.startsOn,
            ends_on: input.endsOn,
            household_label: input.householdLabel,
            note: input.note ?? null,
            created_by: workspace.userId,
            updated_by: workspace.userId,
          });
          if (error) throw error;
        });
      },

      updateCareOverride: async (id, input) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careOverrides: current.careOverrides.map((override) =>
              override.id === id ? { ...override, ...input } : override,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("care_overrides")
            .update({
              starts_on: input.startsOn,
              ends_on: input.endsOn,
              household_label: input.householdLabel,
              note: input.note ?? null,
              updated_by: workspace.userId,
            })
            .eq("id", id);
          if (error) throw error;
        });
      },

      deleteCareOverride: async (id) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careOverrides: current.careOverrides.filter(
              (override) => override.id !== id,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("care_overrides")
            .delete()
            .eq("id", id);
          if (error) throw error;
        });
      },

      proposeCareChange: async (input) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careChangeRequests: [
              {
                ...input,
                id: `request-${Date.now()}`,
                status: "pending",
                requestedBy: "demo-parent-1",
                requestedByName: "Parent 1",
                requestedAt: new Date().toISOString(),
              },
              ...current.careChangeRequests,
            ],
          }));
          return;
        }
        await liveMutation(async () => {
          const { error } = await supabase!.rpc("propose_care_change", {
            p_household_id: workspace.householdId,
            p_child_id: workspace.childId,
            p_starts_on: input.startsOn,
            p_ends_on: input.endsOn,
            p_household_label: input.householdLabel,
            p_note: input.note ?? null,
          });
          if (error) throw error;
        });
      },

      respondCareChange: async (id, status) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careChangeRequests: current.careChangeRequests.map((request) =>
              request.id === id
                ? { ...request, status, respondedAt: new Date().toISOString() }
                : request,
            ),
          }));
          return;
        }
        await liveMutation(async () => {
          const { error } = await supabase!.rpc("respond_care_change", {
            p_request_id: id,
            p_decision: status,
          });
          if (error) throw error;
        });
      },

      cancelCareChange: async (id) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careChangeRequests: current.careChangeRequests.map((request) =>
              request.id === id ? { ...request, status: "cancelled" } : request,
            ),
          }));
          return;
        }
        await liveMutation(async () => {
          const { error } = await supabase!.rpc("cancel_care_change", {
            p_request_id: id,
          });
          if (error) throw error;
        });
      },

      updateCareSchedule: async (input) => {
        const existing = state.careScheduleRules[0];
        const normalisedStartsOn = normalisedHandoverAnchor({
          id: existing?.id ?? "new-rule",
          title: "Alternating weekly handover",
          startsOn: input.startsOn,
          householdLabel: input.householdLabel,
          pickupParentLabel: input.pickupParentLabel,
          pickupLocation: input.pickupLocation,
          recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
        });
        const nextRule = {
          id: existing?.id ?? `rule-${Date.now()}`,
          title: "Alternating weekly handover",
          startsOn: normalisedStartsOn,
          householdLabel: input.householdLabel,
          pickupParentLabel: input.pickupParentLabel,
          pickupLocation: input.pickupLocation,
          recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
        };

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            careScheduleRules: [nextRule],
          }));
          return;
        }

        await liveMutation(async () => {
          if (existing) {
            const { error } = await supabase!
              .from("care_schedule_rules")
              .update({
                starts_on: normalisedStartsOn,
                household_label: input.householdLabel,
                pickup_parent_label: input.pickupParentLabel,
                pickup_location: input.pickupLocation,
                title: "Alternating weekly handover",
                recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
              })
              .eq("id", existing.id);
            if (error) throw error;
          } else {
            const { error } = await supabase!
              .from("care_schedule_rules")
              .insert({
                household_id: workspace.householdId,
                child_id: workspace.childId,
                starts_on: normalisedStartsOn,
                household_label: input.householdLabel,
                pickup_parent_label: input.pickupParentLabel,
                pickup_location: input.pickupLocation,
                title: "Alternating weekly handover",
                recurrence_rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU",
              });
            if (error) throw error;
          }
        });
      },

      updateChild: async (input) => {
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            child: {
              ...current.child,
              ...input,
              initials: input.name.slice(0, 1).toUpperCase(),
            },
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("children")
            .update({
              first_name: input.name,
              school_name: input.school || null,
              class_name: input.className || null,
              allergies: input.allergies,
              clothing_size: input.clothingSize || null,
              shoe_size: input.shoeSize || null,
            })
            .eq("id", workspace.childId);
          if (error) throw error;
        });
      },

      addMedicalItem: async (input) => {
        if (!input.photo) {
          throw new Error(
            "Choose or take a picture of the medical item or label.",
          );
        }

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            medicalItems: [
              ...current.medicalItems,
              {
                ...input,
                id: `medical-${Date.now()}`,
                lastCheckedAt: new Date().toISOString(),
                photoUrl: input.photo?.uri,
              },
            ],
          }));
          return;
        }

        await liveMutation(async () => {
          const { data, error } = await supabase!
            .from("medical_items")
            .insert({
              household_id: workspace.householdId,
              child_id: workspace.childId,
              name: input.name,
              location: input.location,
              quantity: input.quantity,
              expiry_date: input.expiryDate.slice(0, 10),
              last_checked_at: new Date().toISOString(),
              replacement_status: input.replacementStatus,
              notes: input.notes ?? null,
              updated_by: workspace.userId,
            })
            .select("id")
            .single();

          if (error) throw error;

          try {
            const photoPath = await uploadPrivatePhoto(
              workspace.householdId,
              "medical",
              input.photo!,
            );
            const update = await supabase!
              .from("medical_items")
              .update({
                label_photo_path: photoPath,
                updated_by: workspace.userId,
              })
              .eq("id", data.id);
            if (update.error) throw update.error;
          } catch (caught) {
            await supabase!.from("medical_items").delete().eq("id", data.id);
            throw caught;
          }
        });
      },

      updateMedicalItem: async (id, input) => {
        const existing = state.medicalItems.find((value) => value.id === id);
        if (!existing) throw new Error("Medical item not found.");
        if (!input.photo && !existing.photoPath && !existing.photoUrl) {
          throw new Error("Add a picture before saving this medical item.");
        }

        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            medicalItems: current.medicalItems.map((value) =>
              value.id === id
                ? {
                    ...value,
                    ...input,
                    photoUrl: input.photo?.uri ?? value.photoUrl,
                  }
                : value,
            ),
          }));
          return;
        }

        await liveMutation(async () => {
          let photoPath = existing.photoPath;
          if (input.photo) {
            photoPath = await uploadPrivatePhoto(
              workspace.householdId,
              "medical",
              input.photo,
            );
          }

          const { error } = await supabase!
            .from("medical_items")
            .update({
              name: input.name,
              location: input.location,
              quantity: input.quantity,
              expiry_date: input.expiryDate.slice(0, 10),
              last_checked_at: new Date().toISOString(),
              replacement_status: input.replacementStatus,
              notes: input.notes ?? null,
              label_photo_path: photoPath ?? null,
              updated_by: workspace.userId,
            })
            .eq("id", id);

          if (error) {
            if (input.photo && photoPath) {
              await deletePrivatePhoto(photoPath).catch(() => undefined);
            }
            throw error;
          }

          if (
            input.photo &&
            existing.photoPath &&
            existing.photoPath !== photoPath
          ) {
            await deletePrivatePhoto(existing.photoPath).catch(() => undefined);
          }
        });
      },

      deleteMedicalItem: async (id) => {
        const existing = state.medicalItems.find((value) => value.id === id);
        if (!workspace || !supabase) {
          setState((current) => ({
            ...current,
            medicalItems: current.medicalItems.filter((item) => item.id !== id),
          }));
          return;
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("medical_items")
            .delete()
            .eq("id", id);
          if (error) throw error;
          await deletePrivatePhoto(existing?.photoPath).catch(() => undefined);
        });
      },

      createInvite: async (parentLabel) => {
        if (!workspace) {
          throw new Error("Connect Supabase before creating a real invite.");
        }
        return workspace.createInvite(parentLabel);
      },

      revokeInvite: async (inviteId) => {
        if (!workspace) throw new Error("A live household is required.");
        await workspace.revokeInvite(inviteId);
      },

      removeMember: async (userId) => {
        if (!workspace || !supabase) {
          throw new Error("A live household is required.");
        }
        if (workspace.role !== "owner") {
          throw new Error(
            "Only the household owner can remove another member.",
          );
        }
        if (userId === workspace.userId) {
          throw new Error(
            "The household owner cannot remove their own account.",
          );
        }

        await liveMutation(async () => {
          const { error } = await supabase!
            .from("household_members")
            .delete()
            .eq("household_id", workspace.householdId)
            .eq("user_id", userId);
          if (error) throw error;
          await workspace.refreshWorkspace();
        });
      },

      refresh,
      resetDemo: () => {
        if (!workspace) setState(demoState);
      },
    }),
    [
      state,
      hydrated,
      mode,
      syncState,
      syncError,
      lastSyncedAt,
      notificationSettings,
      notificationPermissionState,
      workspace,
      refresh,
      liveMutation,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
