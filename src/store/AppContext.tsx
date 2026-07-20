import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { demoState } from '../data/demoData';
import { supabase } from '../lib/supabase';
import { AppState, CalendarEvent, HouseholdLocation, SyncState, TrackedItem, Workspace } from '../types';

const DEMO_STORAGE_KEY = '@homebridge/demo-state-v2';
const liveStorageKey = (householdId: string) => `@homebridge/live-cache/${householdId}`;

type NewEvent = Omit<CalendarEvent, 'id' | 'acknowledged'>;
type NewItem = Omit<TrackedItem, 'id'>;

interface AppContextValue {
  state: AppState;
  hydrated: boolean;
  mode: 'demo' | 'live';
  syncState: SyncState;
  syncError: string | null;
  viewerName: string;
  members: Workspace['members'];
  toggleHandoverTask: (id: string) => void;
  updateHandoverNote: (value: string) => void;
  completeHandover: () => Promise<void>;
  moveItem: (id: string, location: HouseholdLocation) => void;
  addEvent: (event: NewEvent) => void;
  addItem: (item: NewItem) => void;
  acknowledgeEvent: (id: string) => void;
  createInvite: (parentLabel: string) => Promise<string>;
  refresh: () => Promise<void>;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const categoryEmoji: Record<string, string> = {
  Uniform: '👕', Clothing: '🧥', Toy: '🧸', School: '🎒', Medical: '🩺', Other: '📦',
};

function parentFromHousehold(value: string | null | undefined): 'Dad' | 'Mum' {
  return value?.toLowerCase().includes('mum') ? 'Mum' : 'Dad';
}

async function loadLiveState(workspace: Workspace): Promise<AppState> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const [childResult, eventsResult, itemsResult, medicalResult, handoverResult] = await Promise.all([
    supabase.from('children').select('*').eq('id', workspace.childId).single(),
    supabase.from('calendar_events').select('*').eq('household_id', workspace.householdId).order('starts_at'),
    supabase.from('items').select('*').eq('household_id', workspace.householdId).order('updated_at', { ascending: false }),
    supabase.from('medical_items').select('*').eq('household_id', workspace.householdId).order('expiry_date'),
    supabase.from('handovers').select('*').eq('household_id', workspace.householdId).is('completed_at', null).order('starts_at').limit(1).maybeSingle(),
  ]);

  for (const result of [childResult, eventsResult, itemsResult, medicalResult, handoverResult]) {
    if (result.error) throw result.error;
  }

  const childRow: any = childResult.data;
  const eventRows: any[] = eventsResult.data ?? [];
  const itemRows: any[] = itemsResult.data ?? [];
  const medicalRows: any[] = medicalResult.data ?? [];
  const handoverRow: any = handoverResult.data;

  const [ackResult, tasksResult] = await Promise.all([
    eventRows.length
      ? supabase.from('event_acknowledgements').select('event_id').eq('user_id', workspace.userId).in('event_id', eventRows.map((row) => row.id))
      : Promise.resolve({ data: [], error: null } as any),
    handoverRow
      ? supabase.from('handover_items').select('*').eq('handover_id', handoverRow.id).order('sort_order')
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (ackResult.error) throw ackResult.error;
  if (tasksResult.error) throw tasksResult.error;
  const acknowledged = new Set((ackResult.data ?? []).map((row: any) => row.event_id));

  const fallbackHandover = new Date();
  fallbackHandover.setDate(fallbackHandover.getDate() + 7);
  fallbackHandover.setHours(15, 15, 0, 0);
  const currentHousehold = childRow.current_household_label === "Mum's house" ? "Mum's house" : "Dad's house";
  const nextTo = parentFromHousehold(handoverRow?.to_household_label ?? (currentHousehold === "Dad's house" ? "Mum's house" : "Dad's house"));
  const nextAt = handoverRow?.starts_at ?? fallbackHandover.toISOString();
  const pickupParent = handoverRow?.pickup_parent_label ?? nextTo;
  const pickupLocation = handoverRow?.pickup_location ?? 'the agreed handover point';

  return {
    child: {
      id: childRow.id,
      name: childRow.first_name,
      initials: String(childRow.first_name || '?').slice(0, 1).toUpperCase(),
      school: childRow.school_name || 'School not added',
      className: childRow.class_name || 'Class not added',
      currentHousehold,
      nextHandoverAt: nextAt,
      nextHandoverTo: nextTo,
      collectionPlan: `${pickupParent} collects from ${pickupLocation}`,
      allergies: childRow.allergies ?? [],
      clothingSize: childRow.clothing_size || 'Size not added',
      shoeSize: childRow.shoe_size || 'Not added',
    },
    events: eventRows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at ?? undefined,
      category: row.category,
      responsibleParent: row.responsible_parent_label,
      location: row.location ?? undefined,
      notes: row.notes ?? undefined,
      acknowledged: acknowledged.has(row.id),
    })),
    items: itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      quantity: row.quantity,
      location: row.current_location,
      neededAt: row.needed_at ?? undefined,
      imageEmoji: categoryEmoji[row.category] ?? '📦',
      minimumAtDad: row.minimum_at_dad ?? undefined,
      minimumAtMum: row.minimum_at_mum ?? undefined,
      notes: row.notes ?? undefined,
    })),
    handoverTasks: (tasksResult.data ?? []).map((row: any) => ({
      id: row.id,
      label: row.label,
      itemId: row.item_id ?? undefined,
      done: row.is_done,
      essential: row.is_essential,
    })),
    medicalItems: medicalRows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      expiryDate: row.expiry_date ? new Date(`${row.expiry_date}T12:00:00`).toISOString() : new Date('2099-01-01T12:00:00').toISOString(),
      quantity: row.quantity,
      lastCheckedAt: row.last_checked_at ?? row.updated_at,
      replacementStatus: row.replacement_status,
    })),
    handoverNote: handoverRow?.note ?? '',
    activeHandoverId: handoverRow?.id ?? undefined,
  };
}

export function AppProvider({ children, workspace }: PropsWithChildren<{ workspace?: Workspace }>) {
  const mode = workspace ? 'live' : 'demo';
  const [state, setState] = useState<AppState>(demoState);
  const [hydrated, setHydrated] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>(workspace ? 'connecting' : 'local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!workspace) return;
    setSyncState('connecting');
    try {
      const fresh = await loadLiveState(workspace);
      setState(fresh);
      await AsyncStorage.setItem(liveStorageKey(workspace.householdId), JSON.stringify(fresh));
      setSyncError(null);
      setSyncState('synced');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not sync HomeBridge.';
      setSyncError(message);
      setSyncState('offline');
    } finally {
      setHydrated(true);
    }
  }, [workspace]);

  useEffect(() => {
    setHydrated(false);
    if (!workspace) {
      AsyncStorage.getItem(DEMO_STORAGE_KEY)
        .then((saved) => { if (saved) setState(JSON.parse(saved) as AppState); else setState(demoState); })
        .finally(() => { setSyncState('local'); setHydrated(true); });
      return;
    }
    AsyncStorage.getItem(liveStorageKey(workspace.householdId))
      .then((saved) => { if (saved) setState(JSON.parse(saved) as AppState); })
      .finally(() => refresh());
  }, [workspace, refresh]);

  useEffect(() => {
    if (!hydrated) return;
    const key = workspace ? liveStorageKey(workspace.householdId) : DEMO_STORAGE_KEY;
    AsyncStorage.setItem(key, JSON.stringify(state)).catch(() => undefined);
  }, [state, hydrated, workspace]);

  useEffect(() => {
    if (!workspace || !supabase) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refresh(), 350);
    };
    const filter = `household_id=eq.${workspace.householdId}`;
    const channel = supabase.channel(`homebridge-${workspace.householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'children', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handovers', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_items', filter }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handover_items' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_acknowledgements' }, scheduleRefresh)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setSyncState('synced');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setSyncState('offline');
      });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase?.removeChannel(channel);
    };
  }, [workspace, refresh]);

  useEffect(() => {
    if (!workspace || !state.activeHandoverId || !hydrated || !supabase) return;
    const client = supabase;
    const timer = setTimeout(async () => {
      const { error } = await client.from('handovers').update({ note: state.handoverNote, updated_at: new Date().toISOString() }).eq('id', state.activeHandoverId);
      if (error) { setSyncError(error.message); setSyncState('offline'); }
    }, 700);
    return () => clearTimeout(timer);
  }, [state.handoverNote, state.activeHandoverId, hydrated, workspace]);

  const reportMutationError = (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : 'The change could not be synced.';
    setSyncError(message);
    setSyncState('offline');
    Alert.alert('Saved on this phone only', `${message}\n\nReconnect and try the change again before relying on it on the other phone.`);
  };

  const value = useMemo<AppContextValue>(() => ({
    state,
    hydrated,
    mode,
    syncState,
    syncError,
    viewerName: workspace?.displayName ?? 'Dominic',
    members: workspace?.members ?? [
      { userId: 'demo-dominic', displayName: 'Dominic', parentLabel: 'Dad', role: 'owner' },
      { userId: 'demo-hayley', displayName: 'Hayley', parentLabel: 'Mum', role: 'parent' },
    ],
    toggleHandoverTask: (id) => {
      const task = state.handoverTasks.find((entry) => entry.id === id);
      if (!task) return;
      const nextDone = !task.done;
      setState((current) => ({ ...current, handoverTasks: current.handoverTasks.map((entry) => entry.id === id ? { ...entry, done: nextDone } : entry) }));
      if (workspace && supabase) {
        setSyncState('connecting');
        void (async () => {
          try {
            const { error } = await supabase.from('handover_items').update({ is_done: nextDone, checked_by: nextDone ? workspace.userId : null, checked_at: nextDone ? new Date().toISOString() : null }).eq('id', id);
            if (error) throw error;
            setSyncState('synced');
          } catch (caught) { reportMutationError(caught); }
        })();
      }
    },
    updateHandoverNote: (handoverNote) => setState((current) => ({ ...current, handoverNote })),
    completeHandover: async () => {
      if (!workspace || !supabase || !state.activeHandoverId) {
        setState((current) => {
          const destination = current.child.nextHandoverTo === 'Mum' ? "Mum's house" : "Dad's house";
          const transferredIds = new Set(current.handoverTasks.filter((task) => task.done && task.itemId).map((task) => task.itemId as string));
          return {
            ...current,
            child: { ...current.child, currentHousehold: destination, nextHandoverTo: current.child.nextHandoverTo === 'Mum' ? 'Dad' : 'Mum', collectionPlan: `${current.child.nextHandoverTo === 'Mum' ? 'Dad' : 'Mum'} collects at the next agreed handover` },
            items: current.items.map((item) => transferredIds.has(item.id) ? { ...item, location: destination, neededAt: undefined } : item),
            handoverTasks: current.handoverTasks.map((task) => ({ ...task, done: false })),
            handoverNote: '',
          };
        });
        return;
      }
      setSyncState('connecting');
      try {
        const { error } = await supabase.rpc('complete_handover', { p_handover_id: state.activeHandoverId });
        if (error) throw error;
        await refresh();
      } catch (caught) {
        reportMutationError(caught);
        throw caught;
      }
    },
    moveItem: (id, location) => {
      setState((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, location } : item) }));
      if (workspace && supabase) {
        setSyncState('connecting');
        void (async () => {
          try {
            const { error } = await supabase.from('items').update({ current_location: location, updated_by: workspace.userId, updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            setSyncState('synced');
          } catch (caught) { reportMutationError(caught); }
        })();
      }
    },
    addEvent: (event) => {
      const temporaryId = `event-${Date.now()}`;
      setState((current) => ({ ...current, events: [...current.events, { ...event, id: temporaryId, acknowledged: false }] }));
      if (workspace && supabase) {
        setSyncState('connecting');
        void (async () => {
          try {
            const { error } = await supabase.from('calendar_events').insert({
          household_id: workspace.householdId,
          child_id: workspace.childId,
          title: event.title,
          category: event.category,
          starts_at: event.startsAt,
          ends_at: event.endsAt ?? null,
          location: event.location ?? null,
          responsible_parent_label: event.responsibleParent,
          notes: event.notes ?? null,
          created_by: workspace.userId,
          updated_by: workspace.userId,
            }).select('id').single();
            if (error) throw error;
            await refresh();
          } catch (caught) { reportMutationError(caught); }
        })();
      }
    },
    addItem: (item) => {
      const temporaryId = `item-${Date.now()}`;
      setState((current) => ({ ...current, items: [...current.items, { ...item, id: temporaryId }] }));
      if (workspace && supabase) {
        setSyncState('connecting');
        void (async () => {
          try {
            const { error } = await supabase.from('items').insert({
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
            }).select('id').single();
            if (error) throw error;
            await refresh();
          } catch (caught) { reportMutationError(caught); }
        })();
      }
    },
    acknowledgeEvent: (id) => {
      setState((current) => ({ ...current, events: current.events.map((event) => event.id === id ? { ...event, acknowledged: true } : event) }));
      if (workspace && supabase && !id.startsWith('event-')) {
        setSyncState('connecting');
        void (async () => {
          try {
            const { error } = await supabase.from('event_acknowledgements').upsert({ event_id: id, user_id: workspace.userId });
            if (error) throw error;
            setSyncState('synced');
          } catch (caught) { reportMutationError(caught); }
        })();
      }
    },
    createInvite: async (parentLabel) => {
      if (!workspace) throw new Error('Connect Supabase before creating a real invite.');
      return workspace.createInvite(parentLabel);
    },
    refresh,
    resetDemo: () => { if (!workspace) setState(demoState); },
  }), [state, hydrated, mode, syncState, syncError, workspace, refresh]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
