import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
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
  DangerButton,
  EmptyState,
  Field,
  Pill,
  PrimaryButton,
  SectionHeader,
  SecondaryButton,
} from "../components/UI";
import { errorMessage } from "../lib/errors";
import { useApp } from "../store/AppContext";
import { colours, radii, spacing } from "../theme";
import {
  CalendarEvent,
  CareOverride,
  EventCategory,
  HomeLocation,
  ParentLabel,
  PickedPhoto,
  ResponsibleParent,
} from "../types";
import {
  addCalendarDays,
  careOverrideForDate,
  carePlanForDate,
  dateFromKey,
  dateKey,
  eventNeedsMoving,
  eventsOnDate,
  householdForDate,
  isHandoverDate,
  monthGrid,
  monthTitle,
  normalisedHandoverAnchor,
  otherHome,
} from "../utils/calendar";
import { formatDay, formatTime } from "../utils/format";

const filters = [
  "All",
  "School",
  "Handover",
  "Party",
  "Trip",
  "Medical",
  "Holiday",
  "Reminder",
] as const;

type Filter = (typeof filters)[number];
type CalendarView = "month" | "agenda";

type PickerTarget =
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "rsvpDate"
  | "overrideStart"
  | "overrideEnd"
  | "scheduleAnchor"
  | null;

const eventCategories = filters.slice(1) as readonly EventCategory[];
const parents: ResponsibleParent[] = ["Dad", "Mum", "Both"];
const homes: HomeLocation[] = ["Dad's house", "Mum's house"];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const emojis: Record<EventCategory, string> = {
  School: "🏫",
  Handover: "🔁",
  Party: "🎈",
  Trip: "🗺️",
  Medical: "🩺",
  Holiday: "☀️",
  Reminder: "🔔",
};

const dotColours: Record<EventCategory, string> = {
  School: colours.blue,
  Handover: colours.teal,
  Party: colours.rose,
  Trip: colours.amber,
  Medical: colours.danger,
  Holiday: colours.green,
  Reminder: colours.muted,
};

interface EventForm {
  title: string;
  location: string;
  notes: string;
  category: EventCategory;
  responsibleParent: ResponsibleParent;
  start: Date;
  allDay: boolean;
  hasEnd: boolean;
  end: Date;
  hasRsvp: boolean;
  rsvpDeadline: Date;
  requiredItemIds: string[];
  photo?: PickedPhoto;
}

interface OverrideForm {
  start: Date;
  end: Date;
  householdLabel: HomeLocation;
  note: string;
}

interface ScheduleForm {
  anchor: Date;
  destination: HomeLocation;
  pickupParent: ParentLabel;
  pickupLocation: string;
}

function atTime(date: Date, hour: number, minute: number): Date {
  const value = new Date(date);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function newForm(date: Date): EventForm {
  const start = atTime(date, 15, 15);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const rsvpDeadline = addCalendarDays(start, -3);
  return {
    title: "",
    location: "",
    notes: "",
    category: "School",
    responsibleParent: "Both",
    start,
    allDay: false,
    hasEnd: false,
    end,
    hasRsvp: false,
    rsvpDeadline,
    requiredItemIds: [],
  };
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
}

function fullDate(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function eventDateLabel(event: CalendarEvent): string {
  if (event.allDay) {
    return event.endsAt
      ? `${formatDay(event.startsAt)} – ${formatDay(event.endsAt)}`
      : formatDay(event.startsAt);
  }
  return `${formatDay(event.startsAt)} · ${formatTime(event.startsAt)}${
    event.endsAt ? `–${formatTime(event.endsAt)}` : ""
  }`;
}

export function CalendarScreen() {
  const {
    state,
    syncState,
    refresh,
    acknowledgeEvent,
    addEvent,
    updateEvent,
    deleteEvent,
    addCareOverride,
    updateCareOverride,
    deleteCareOverride,
    updateCareSchedule,
    addItemsToHandover,
    proposeCareChange,
    respondCareChange,
    cancelCareChange,
    members,
    viewerUserId,
    mode,
  } = useApp();

  const today = new Date();
  const [view, setView] = useState<CalendarView>("month");
  const [filter, setFilter] = useState<Filter>("All");
  const [visibleMonth, setVisibleMonth] = useState(monthStart(today));
  const [selectedKey, setSelectedKey] = useState(dateKey(today));
  const [showEventForm, setShowEventForm] = useState(false);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState<EventForm>(() => newForm(today));
  const [overrideForm, setOverrideForm] = useState<OverrideForm>(() => ({
    start: today,
    end: today,
    householdLabel: otherHome(state.child.currentHousehold),
    note: "",
  }));
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(() => {
    const rule = state.careScheduleRules[0];
    return {
      anchor: rule ? dateFromKey(normalisedHandoverAnchor(rule)) : today,
      destination:
        rule?.householdLabel ?? otherHome(state.child.currentHousehold),
      pickupParent:
        rule?.pickupParentLabel ??
        (rule?.householdLabel === "Dad's house" ? "Dad" : "Mum"),
      pickupLocation: rule?.pickupLocation ?? "school or agreed handover point",
    };
  });
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [busy, setBusy] = useState(false);

  const selectedDate = useMemo(() => dateFromKey(selectedKey), [selectedKey]);
  const cells = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);

  const filteredEvents = useMemo(
    () =>
      state.events.filter(
        (event) => filter === "All" || event.category === filter,
      ),
    [state.events, filter],
  );

  const selectedEvents = useMemo(
    () =>
      eventsOnDate(filteredEvents, selectedDate).sort(
        (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
      ),
    [filteredEvents, selectedDate],
  );

  const selectedHome = householdForDate(
    selectedDate,
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  );
  const selectedOverride = careOverrideForDate(
    selectedDate,
    state.careOverrides,
  );
  const selectedIsHandover = isHandoverDate(
    selectedDate,
    state.careScheduleRules,
  );
  const selectedPlan = carePlanForDate(
    selectedDate,
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  );
  const pendingCareRequests = (state.careChangeRequests ?? []).filter(
    (request) =>
      request.status === "pending" &&
      selectedKey >= request.startsOn &&
      selectedKey <= request.endsOn,
  );
  const requiresApproval = mode === "live" && members.length > 1;

  const agenda = useMemo(
    () =>
      [...filteredEvents]
        .filter(
          (event) =>
            new Date(event.endsAt ?? event.startsAt).getTime() >=
            new Date(
              today.getFullYear(),
              today.getMonth(),
              today.getDate(),
            ).getTime(),
        )
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
        .slice(0, 80),
    [filteredEvents],
  );

  const selectedPlanningItems = useMemo(() => {
    const unique = new Map<string, (typeof state.items)[number]>();
    selectedEvents.forEach((event) => {
      eventNeedsMoving(
        event,
        state.items,
        state.careScheduleRules,
        state.careOverrides,
        state.child.currentHousehold,
      ).forEach((item) => unique.set(item.id, item));
    });
    return [...unique.values()];
  }, [
    selectedEvents,
    state.items,
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  ]);

  const editingEvent = state.events.find(
    (event) => event.id === editingEventId,
  );

  const openAdd = (date = selectedDate) => {
    setEditingEventId(null);
    setForm(newForm(date));
    setShowEventForm(true);
  };

  const openEdit = (event: CalendarEvent) => {
    const start = new Date(event.startsAt);
    const end = event.endsAt
      ? new Date(event.endsAt)
      : new Date(start.getTime() + 60 * 60 * 1000);
    setEditingEventId(event.id);
    setForm({
      title: event.title,
      location: event.location ?? "",
      notes: event.notes ?? "",
      category: event.category,
      responsibleParent: event.responsibleParent,
      start,
      allDay: event.allDay,
      hasEnd: Boolean(event.endsAt),
      end,
      hasRsvp: Boolean(event.rsvpDeadline),
      rsvpDeadline: event.rsvpDeadline
        ? new Date(event.rsvpDeadline)
        : addCalendarDays(start, -3),
      requiredItemIds: event.requiredItemIds,
    });
    setShowEventForm(true);
  };

  const openCareChange = () => {
    if (selectedOverride) {
      setEditingOverrideId(selectedOverride.id);
      setOverrideForm({
        start: dateFromKey(selectedOverride.startsOn),
        end: dateFromKey(selectedOverride.endsOn),
        householdLabel: selectedOverride.householdLabel,
        note: selectedOverride.note ?? "",
      });
    } else {
      setEditingOverrideId(null);
      setOverrideForm({
        start: selectedDate,
        end: selectedDate,
        householdLabel: otherHome(selectedHome),
        note: "",
      });
    }
    setShowOverrideForm(true);
  };

  const openSchedule = () => {
    const rule = state.careScheduleRules[0];
    const destination =
      rule?.householdLabel ?? otherHome(state.child.currentHousehold);
    setScheduleForm({
      anchor: rule ? dateFromKey(normalisedHandoverAnchor(rule)) : selectedDate,
      destination,
      pickupParent:
        rule?.pickupParentLabel ??
        (destination === "Dad's house" ? "Dad" : "Mum"),
      pickupLocation: rule?.pickupLocation ?? "school or agreed handover point",
    });
    setShowScheduleForm(true);
  };

  const closeEventForm = () => {
    if (busy) return;
    setShowEventForm(false);
    setPickerTarget(null);
  };

  const closeOverrideForm = () => {
    if (busy) return;
    setShowOverrideForm(false);
    setPickerTarget(null);
  };

  const closeScheduleForm = () => {
    if (busy) return;
    setShowScheduleForm(false);
    setPickerTarget(null);
  };

  const onPickerChange = (_event: DateTimePickerEvent, selected?: Date) => {
    const target = pickerTarget;
    setPickerTarget(null);
    if (!selected || !target) return;

    if (target === "scheduleAnchor") {
      const value = new Date(selected);
      value.setHours(12, 0, 0, 0);
      setScheduleForm((current) => ({ ...current, anchor: value }));
      return;
    }

    if (target === "overrideStart" || target === "overrideEnd") {
      setOverrideForm((current) => {
        const next = { ...current };
        const value = new Date(selected);
        value.setHours(12, 0, 0, 0);
        if (target === "overrideStart") {
          next.start = value;
          if (next.end < value) next.end = value;
        } else {
          next.end = value;
        }
        return next;
      });
      return;
    }

    setForm((current) => {
      const next = { ...current };
      if (target === "startDate" || target === "startTime") {
        const value = new Date(current.start);
        if (target === "startDate") {
          value.setFullYear(
            selected.getFullYear(),
            selected.getMonth(),
            selected.getDate(),
          );
        } else {
          value.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        }
        next.start = value;
        if (next.hasEnd && next.end <= value) {
          next.end = new Date(value.getTime() + 60 * 60 * 1000);
        }
      } else if (target === "endDate" || target === "endTime") {
        const value = new Date(current.end);
        if (target === "endDate") {
          value.setFullYear(
            selected.getFullYear(),
            selected.getMonth(),
            selected.getDate(),
          );
        } else {
          value.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        }
        next.end = value;
      } else if (target === "rsvpDate") {
        const value = new Date(selected);
        value.setHours(12, 0, 0, 0);
        next.rsvpDeadline = value;
      }
      return next;
    });
  };

  const saveEvent = async () => {
    if (!form.title.trim()) {
      Alert.alert("Event title needed", "Enter what is happening.");
      return;
    }
    if (form.hasEnd && form.end < form.start) {
      Alert.alert("Check the end date", "The end must be after the start.");
      return;
    }
    if (form.hasRsvp && form.rsvpDeadline > form.start) {
      Alert.alert(
        "Check the RSVP date",
        "The RSVP deadline should be before the event.",
      );
      return;
    }

    setBusy(true);
    try {
      const input = {
        title: form.title.trim(),
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        startsAt: form.start.toISOString(),
        endsAt: form.hasEnd ? form.end.toISOString() : undefined,
        category: form.category,
        responsibleParent: form.responsibleParent,
        allDay: form.allDay,
        rsvpDeadline: form.hasRsvp
          ? form.rsvpDeadline.toISOString()
          : undefined,
        requiredItemIds: form.requiredItemIds,
        photo: form.photo,
      };

      if (editingEventId) {
        await updateEvent({
          id: editingEventId,
          photoPath: editingEvent?.photoPath,
          ...input,
        });
      } else {
        await addEvent(input);
      }
      setShowEventForm(false);
    } catch (caught) {
      Alert.alert("Could not save event", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeEvent = () => {
    if (!editingEventId) return;
    Alert.alert(
      "Delete this event?",
      "It will disappear from both parents’ calendars.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            deleteEvent(editingEventId)
              .then(() => setShowEventForm(false))
              .catch((caught) =>
                Alert.alert("Could not delete event", errorMessage(caught)),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  const saveOverride = async () => {
    const start = dateKey(overrideForm.start);
    const end = dateKey(overrideForm.end);
    if (end < start) {
      Alert.alert(
        "Check the dates",
        "The end date must be on or after the start.",
      );
      return;
    }

    const overlaps = state.careOverrides.some(
      (override) =>
        override.id !== editingOverrideId &&
        start <= override.endsOn &&
        end >= override.startsOn,
    );
    if (overlaps) {
      Alert.alert(
        "Care change overlaps another change",
        "Edit or remove the existing care change before adding another over the same dates.",
      );
      return;
    }

    setBusy(true);
    try {
      const input = {
        startsOn: start,
        endsOn: end,
        householdLabel: overrideForm.householdLabel,
        note: overrideForm.note.trim() || undefined,
      };
      if (editingOverrideId) {
        await updateCareOverride(editingOverrideId, input);
      } else if (requiresApproval) {
        await proposeCareChange(input);
        Alert.alert(
          "Care change sent",
          "The other parent can accept or reject it from the shared calendar.",
        );
      } else {
        await addCareOverride(input);
      }
      setShowOverrideForm(false);
    } catch (caught) {
      Alert.alert("Could not save care change", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const removeOverride = () => {
    if (!editingOverrideId) return;
    Alert.alert(
      "Remove this care change?",
      "The normal alternating schedule will apply again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            deleteCareOverride(editingOverrideId)
              .then(() => setShowOverrideForm(false))
              .catch((caught) =>
                Alert.alert(
                  "Could not remove care change",
                  errorMessage(caught),
                ),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

  const saveSchedule = async () => {
    if (!scheduleForm.pickupLocation.trim()) {
      Alert.alert(
        "Collection location needed",
        "Enter the school gate or agreed handover point.",
      );
      return;
    }
    setBusy(true);
    try {
      await updateCareSchedule({
        startsOn: dateKey(scheduleForm.anchor),
        householdLabel: scheduleForm.destination,
        pickupParentLabel: scheduleForm.pickupParent,
        pickupLocation: scheduleForm.pickupLocation.trim(),
      });
      setShowScheduleForm(false);
    } catch (caught) {
      Alert.alert("Could not update normal schedule", errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const addPlanningItems = async (itemIds: string[]) => {
    try {
      const count = await addItemsToHandover(itemIds);
      Alert.alert(
        count ? "Added to handover" : "Already on the checklist",
        count
          ? `${count} item${count === 1 ? "" : "s"} added to the next handover checklist.`
          : "Those items are already on the next handover checklist.",
      );
    } catch (caught) {
      Alert.alert("Could not update handover", errorMessage(caught));
    }
  };

  const jumpToday = () => {
    const now = new Date();
    setVisibleMonth(monthStart(now));
    setSelectedKey(dateKey(now));
  };

  const pickerValue = (() => {
    switch (pickerTarget) {
      case "startDate":
      case "startTime":
        return form.start;
      case "endDate":
      case "endTime":
        return form.end;
      case "rsvpDate":
        return form.rsvpDeadline;
      case "overrideStart":
        return overrideForm.start;
      case "overrideEnd":
        return overrideForm.end;
      case "scheduleAnchor":
        return scheduleForm.anchor;
      default:
        return new Date();
    }
  })();

  const pickerMode =
    pickerTarget === "startTime" || pickerTarget === "endTime"
      ? "time"
      : "date";

  return (
    <>
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
          title="Shared calendar"
          subtitle="Care, school, events and everything that needs to travel"
        />

        <View style={styles.viewToggle}>
          {(["month", "agenda"] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setView(item)}
              style={[
                styles.viewButton,
                view === item && styles.viewButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.viewButtonText,
                  view === item && styles.viewButtonTextActive,
                ]}
              >
                {item === "month" ? "Month" : "Agenda"}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {filters.map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filter, filter === item && styles.filterActive]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.filterTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {view === "month" ? (
          <>
            <Card style={styles.calendarCard}>
              <View style={styles.monthHeader}>
                <Pressable
                  accessibilityLabel="Previous month"
                  onPress={() =>
                    setVisibleMonth(
                      new Date(
                        visibleMonth.getFullYear(),
                        visibleMonth.getMonth() - 1,
                        1,
                        12,
                      ),
                    )
                  }
                  style={styles.monthArrow}
                >
                  <Text style={styles.monthArrowText}>‹</Text>
                </Pressable>
                <View style={styles.monthHeading}>
                  <Text style={styles.monthTitle}>
                    {monthTitle(visibleMonth)}
                  </Text>
                  <Pressable onPress={jumpToday} hitSlop={8}>
                    <Text style={styles.todayLink}>Today</Text>
                  </Pressable>
                </View>
                <Pressable
                  accessibilityLabel="Next month"
                  onPress={() =>
                    setVisibleMonth(
                      new Date(
                        visibleMonth.getFullYear(),
                        visibleMonth.getMonth() + 1,
                        1,
                        12,
                      ),
                    )
                  }
                  style={styles.monthArrow}
                >
                  <Text style={styles.monthArrowText}>›</Text>
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {weekdays.map((weekday) => (
                  <Text key={weekday} style={styles.weekday}>
                    {weekday}
                  </Text>
                ))}
              </View>

              <View style={styles.monthGrid}>
                {cells.map((date) => {
                  const key = dateKey(date);
                  const inMonth = date.getMonth() === visibleMonth.getMonth();
                  const selected = key === selectedKey;
                  const isToday = key === dateKey(today);
                  const home = householdForDate(
                    date,
                    state.careScheduleRules,
                    state.careOverrides,
                    state.child.currentHousehold,
                  );
                  const dayEvents = eventsOnDate(filteredEvents, date);
                  const markers = [
                    ...new Set(dayEvents.map((event) => event.category)),
                  ].slice(0, 3);
                  const override = careOverrideForDate(
                    date,
                    state.careOverrides,
                  );
                  const handover = isHandoverDate(
                    date,
                    state.careScheduleRules,
                  );

                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelectedKey(key)}
                      style={[
                        styles.dayCell,
                        home === "Dad's house" ? styles.dadDay : styles.mumDay,
                        !inMonth && styles.outsideDay,
                        selected && styles.selectedDay,
                      ]}
                    >
                      <View style={styles.dayTop}>
                        <Text
                          style={[
                            styles.dayNumber,
                            !inMonth && styles.outsideText,
                            isToday && styles.todayNumber,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        <Text style={styles.homeInitial}>
                          {home === "Dad's house" ? "Dad" : "Mum"}
                        </Text>
                      </View>
                      <View style={styles.markerRow}>
                        {markers.map((category) => (
                          <View
                            key={category}
                            style={[
                              styles.marker,
                              { backgroundColor: dotColours[category] },
                            ]}
                          />
                        ))}
                      </View>
                      <View style={styles.dayFlags}>
                        {handover ? (
                          <Text style={styles.handoverFlag}>⇄</Text>
                        ) : null}
                        {override ? (
                          <Text style={styles.overrideFlag}>●</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.legend}>
                <LegendSwatch style={styles.dadLegend} label="Dad" />
                <LegendSwatch style={styles.mumLegend} label="Mum" />
                <Text style={styles.legendText}>⇄ handover</Text>
                <Text style={styles.legendText}>● care change</Text>
              </View>
              <Pressable onPress={openSchedule} style={styles.scheduleLink}>
                <Text style={styles.scheduleLinkText}>
                  Edit normal alternating schedule
                </Text>
              </Pressable>
            </Card>

            <SectionHeader
              title={fullDate(selectedDate)}
              action="Add event"
              onAction={() => openAdd(selectedDate)}
            />

            <Card style={styles.daySummary}>
              <View style={styles.daySummaryTop}>
                <View>
                  <Text style={styles.daySummaryLabel}>
                    {state.child.name} is with
                  </Text>
                  <Text style={styles.daySummaryHome}>
                    {selectedHome === "Dad's house" ? "Dad" : "Mum"}
                  </Text>
                </View>
                <Pill
                  label={selectedOverride ? "Care change" : "Normal schedule"}
                  tone={selectedOverride ? "amber" : "teal"}
                />
              </View>
              {selectedIsHandover ? (
                <Text style={styles.handoverText}>
                  ⇄ {selectedPlan.pickupParent ?? "Parent"} collects ·{" "}
                  {selectedPlan.pickupLocation ?? "agreed handover point"}
                </Text>
              ) : null}
              {selectedOverride?.note ? (
                <Text style={styles.overrideNote}>{selectedOverride.note}</Text>
              ) : null}
              <View style={styles.summaryActions}>
                <SecondaryButton
                  label={
                    selectedOverride
                      ? "Edit care change"
                      : "Change care for this date"
                  }
                  onPress={openCareChange}
                />
              </View>
            </Card>

            {pendingCareRequests.length ? (
              <View style={styles.requestSection}>
                <SectionHeader title="Pending care change" />
                {pendingCareRequests.map((request) => {
                  const mine = request.requestedBy === viewerUserId;
                  return (
                    <Card key={request.id} style={styles.requestCard}>
                      <View style={styles.requestTop}>
                        <View style={styles.requestCopy}>
                          <Text style={styles.requestTitle}>
                            {request.householdLabel === "Dad's house"
                              ? "With Dad"
                              : "With Mum"}
                          </Text>
                          <Text style={styles.requestMeta}>
                            {request.startsOn === request.endsOn
                              ? fullDate(dateFromKey(request.startsOn))
                              : `${fullDate(dateFromKey(request.startsOn))} – ${fullDate(dateFromKey(request.endsOn))}`}
                          </Text>
                          <Text style={styles.requestMeta}>
                            Proposed by {request.requestedByName}
                          </Text>
                        </View>
                        <Pill
                          label={mine ? "Awaiting reply" : "Needs your reply"}
                          tone="amber"
                        />
                      </View>
                      {request.note ? (
                        <Text style={styles.requestNote}>{request.note}</Text>
                      ) : null}
                      {mine ? (
                        <SecondaryButton
                          label="Cancel request"
                          onPress={() =>
                            void cancelCareChange(request.id).catch((caught) =>
                              Alert.alert(
                                "Could not cancel request",
                                errorMessage(caught),
                              ),
                            )
                          }
                        />
                      ) : (
                        <View style={styles.requestActions}>
                          <View style={styles.requestAction}>
                            <SecondaryButton
                              label="Decline"
                              onPress={() =>
                                void respondCareChange(
                                  request.id,
                                  "rejected",
                                ).catch((caught) =>
                                  Alert.alert(
                                    "Could not decline change",
                                    errorMessage(caught),
                                  ),
                                )
                              }
                            />
                          </View>
                          <View style={styles.requestAction}>
                            <PrimaryButton
                              label="Accept"
                              onPress={() =>
                                void respondCareChange(
                                  request.id,
                                  "accepted",
                                ).catch((caught) =>
                                  Alert.alert(
                                    "Could not accept change",
                                    errorMessage(caught),
                                  ),
                                )
                              }
                            />
                          </View>
                        </View>
                      )}
                    </Card>
                  );
                })}
              </View>
            ) : null}

            {selectedPlanningItems.length ? (
              <Card style={styles.planningCard}>
                <View style={styles.planningTitleRow}>
                  <Text style={styles.planningEmoji}>🧳</Text>
                  <View style={styles.planningCopy}>
                    <Text style={styles.planningTitle}>Items need moving</Text>
                    <Text style={styles.planningBody}>
                      {selectedPlanningItems
                        .map((item) => `${item.name} (${item.location})`)
                        .join(", ")}
                    </Text>
                  </View>
                </View>
                <PrimaryButton
                  label="Add to next handover"
                  onPress={() =>
                    void addPlanningItems(
                      selectedPlanningItems.map((item) => item.id),
                    )
                  }
                />
              </Card>
            ) : null}

            {!selectedEvents.length ? (
              <EmptyState
                emoji="📅"
                title="Nothing planned"
                body="Tap Add event for school, parties, trips, appointments or reminders."
              />
            ) : (
              selectedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  state={state}
                  onEdit={() => openEdit(event)}
                  onAcknowledge={() =>
                    void acknowledgeEvent(event.id).catch((caught) =>
                      Alert.alert(
                        "Could not acknowledge",
                        errorMessage(caught),
                      ),
                    )
                  }
                  onAddItems={(ids) => void addPlanningItems(ids)}
                />
              ))
            )}
          </>
        ) : (
          <>
            <SectionHeader
              title="Upcoming agenda"
              action="Add event"
              onAction={() => openAdd(new Date())}
            />
            {!agenda.length ? (
              <EmptyState
                emoji="🗓️"
                title="No upcoming events"
                body="Add school dates, parties, trips, appointments and reminders."
              />
            ) : (
              agenda.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  state={state}
                  onEdit={() => openEdit(event)}
                  onAcknowledge={() =>
                    void acknowledgeEvent(event.id).catch((caught) =>
                      Alert.alert(
                        "Could not acknowledge",
                        errorMessage(caught),
                      ),
                    )
                  }
                  onAddItems={(ids) => void addPlanningItems(ids)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <BottomSheet
        visible={showEventForm}
        title={editingEventId ? "Edit event" : "Add shared event"}
        onClose={closeEventForm}
      >
        <PhotoField
          photo={form.photo}
          existingUrl={editingEvent?.photoUrl}
          label="Invitation, letter or event picture"
          onChange={(photo) => setForm((current) => ({ ...current, photo }))}
        />

        <Text style={styles.label}>What is happening? *</Text>
        <Field
          value={form.title}
          onChangeText={(title) =>
            setForm((current) => ({ ...current, title }))
          }
          placeholder="Party, school trip, appointment…"
        />

        <Text style={styles.label}>Type</Text>
        <ChipGrid
          values={eventCategories}
          selected={form.category}
          onSelect={(category) =>
            setForm((current) => ({ ...current, category }))
          }
        />

        <Text style={styles.label}>Responsible parent</Text>
        <ChipGrid
          values={parents}
          selected={form.responsibleParent}
          onSelect={(responsibleParent) =>
            setForm((current) => ({ ...current, responsibleParent }))
          }
        />

        <ToggleRow
          label="All-day event"
          active={form.allDay}
          onPress={() =>
            setForm((current) => ({ ...current, allDay: !current.allDay }))
          }
        />

        <Text style={styles.label}>Starts</Text>
        <View style={styles.dateButtons}>
          <DateButton
            label={formatDay(form.start.toISOString())}
            onPress={() => setPickerTarget("startDate")}
          />
          {!form.allDay ? (
            <DateButton
              label={formatTime(form.start.toISOString())}
              onPress={() => setPickerTarget("startTime")}
            />
          ) : null}
        </View>

        <ToggleRow
          label="Add an end date/time"
          active={form.hasEnd}
          onPress={() =>
            setForm((current) => ({ ...current, hasEnd: !current.hasEnd }))
          }
        />

        {form.hasEnd ? (
          <View style={styles.dateButtons}>
            <DateButton
              label={formatDay(form.end.toISOString())}
              onPress={() => setPickerTarget("endDate")}
            />
            {!form.allDay ? (
              <DateButton
                label={formatTime(form.end.toISOString())}
                onPress={() => setPickerTarget("endTime")}
              />
            ) : null}
          </View>
        ) : null}

        <ToggleRow
          label="RSVP or response deadline"
          active={form.hasRsvp}
          onPress={() =>
            setForm((current) => ({ ...current, hasRsvp: !current.hasRsvp }))
          }
        />

        {form.hasRsvp ? (
          <DateButton
            label={formatDay(form.rsvpDeadline.toISOString())}
            onPress={() => setPickerTarget("rsvpDate")}
          />
        ) : null}

        <Text style={styles.label}>Location</Text>
        <Field
          value={form.location}
          onChangeText={(location) =>
            setForm((current) => ({ ...current, location }))
          }
          placeholder="Optional"
        />

        <Text style={styles.label}>
          What needs to go with {state.child.name}?
        </Text>
        <Text style={styles.helperText}>
          HomeBridge will warn when a selected item is at the wrong house.
        </Text>
        {!state.items.length ? (
          <Text style={styles.helperText}>Add belongings in Things first.</Text>
        ) : (
          <View style={styles.itemPicker}>
            {state.items.map((item) => {
              const selected = form.requiredItemIds.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      requiredItemIds: selected
                        ? current.requiredItemIds.filter((id) => id !== item.id)
                        : [...current.requiredItemIds, item.id],
                    }))
                  }
                  style={[
                    styles.itemChoice,
                    selected && styles.itemChoiceActive,
                  ]}
                >
                  <ItemPhoto uri={item.photoUrl} size={44} />
                  <View style={styles.itemChoiceCopy}>
                    <Text style={styles.itemChoiceTitle}>{item.name}</Text>
                    <Text style={styles.itemChoiceMeta}>{item.location}</Text>
                  </View>
                  <View
                    style={[
                      styles.choiceCheck,
                      selected && styles.choiceCheckActive,
                    ]}
                  >
                    {selected ? <Text style={styles.choiceTick}>✓</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>Notes, consent or packing details</Text>
        <Field
          multiline
          value={form.notes}
          onChangeText={(notes) =>
            setForm((current) => ({ ...current, notes }))
          }
          placeholder="RSVP details, consent deadline, what to bring…"
        />

        <View style={styles.action}>
          <PrimaryButton
            label={editingEventId ? "Save event" : "Add event"}
            onPress={() => void saveEvent()}
            busy={busy}
            disabled={!form.title.trim()}
          />
        </View>
        {editingEventId ? (
          <View style={styles.secondaryAction}>
            <DangerButton
              label="Delete event"
              onPress={removeEvent}
              disabled={busy}
            />
          </View>
        ) : null}
        <View style={styles.secondaryAction}>
          <SecondaryButton
            label="Cancel"
            onPress={closeEventForm}
            disabled={busy}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showOverrideForm}
        title={editingOverrideId ? "Edit care change" : "Change care schedule"}
        onClose={closeOverrideForm}
      >
        <Text style={styles.sheetIntro}>
          This temporarily overrides the normal alternating arrangement without
          changing it.
        </Text>

        <Text style={styles.label}>{state.child.name} will be with</Text>
        <ChipGrid
          values={homes}
          selected={overrideForm.householdLabel}
          onSelect={(householdLabel) =>
            setOverrideForm((current) => ({ ...current, householdLabel }))
          }
        />

        <Text style={styles.label}>From</Text>
        <DateButton
          label={formatDay(overrideForm.start.toISOString())}
          onPress={() => setPickerTarget("overrideStart")}
        />

        <Text style={styles.label}>Until</Text>
        <DateButton
          label={formatDay(overrideForm.end.toISOString())}
          onPress={() => setPickerTarget("overrideEnd")}
        />

        <Text style={styles.label}>Reason or handover note</Text>
        <Field
          multiline
          value={overrideForm.note}
          onChangeText={(note) =>
            setOverrideForm((current) => ({ ...current, note }))
          }
          placeholder="Holiday, swap, family event, collection arrangement…"
        />

        <View style={styles.action}>
          <PrimaryButton
            label={
              editingOverrideId
                ? "Save care change"
                : requiresApproval
                  ? "Send change request"
                  : "Add care change"
            }
            onPress={() => void saveOverride()}
            busy={busy}
          />
        </View>
        {editingOverrideId ? (
          <View style={styles.secondaryAction}>
            <DangerButton
              label="Remove care change"
              onPress={removeOverride}
              disabled={busy}
            />
          </View>
        ) : null}
        <View style={styles.secondaryAction}>
          <SecondaryButton
            label="Cancel"
            onPress={closeOverrideForm}
            disabled={busy}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showScheduleForm}
        title="Normal alternating schedule"
        onClose={closeScheduleForm}
      >
        <Text style={styles.sheetIntro}>
          Choose one handover date and the home Eva goes to on that date.
          HomeBridge alternates homes every seven days from this anchor.
        </Text>

        <Text style={styles.label}>Anchor handover date</Text>
        <DateButton
          label={formatDay(scheduleForm.anchor.toISOString())}
          onPress={() => setPickerTarget("scheduleAnchor")}
        />

        <Text style={styles.label}>
          After that handover, {state.child.name} is with
        </Text>
        <ChipGrid
          values={homes}
          selected={scheduleForm.destination}
          onSelect={(destination) =>
            setScheduleForm((current) => ({
              ...current,
              destination,
              pickupParent: destination === "Dad's house" ? "Dad" : "Mum",
            }))
          }
        />

        <Text style={styles.label}>Who collects?</Text>
        <ChipGrid
          values={["Dad", "Mum"] as const}
          selected={scheduleForm.pickupParent}
          onSelect={(pickupParent) =>
            setScheduleForm((current) => ({ ...current, pickupParent }))
          }
        />

        <Text style={styles.label}>Collection or handover point</Text>
        <Field
          value={scheduleForm.pickupLocation}
          onChangeText={(pickupLocation) =>
            setScheduleForm((current) => ({ ...current, pickupLocation }))
          }
          placeholder="School gate or agreed handover point"
        />

        <View style={styles.action}>
          <PrimaryButton
            label="Save normal schedule"
            onPress={() => void saveSchedule()}
            busy={busy}
            disabled={!scheduleForm.pickupLocation.trim()}
          />
        </View>
        <View style={styles.secondaryAction}>
          <SecondaryButton
            label="Cancel"
            onPress={closeScheduleForm}
            disabled={busy}
          />
        </View>
      </BottomSheet>

      {pickerTarget ? (
        <DateTimePicker
          value={pickerValue}
          mode={pickerMode}
          is24Hour
          onChange={onPickerChange}
        />
      ) : null}
    </>
  );
}

function EventCard({
  event,
  state,
  onEdit,
  onAcknowledge,
  onAddItems,
}: {
  event: CalendarEvent;
  state: ReturnType<typeof useApp>["state"];
  onEdit: () => void;
  onAcknowledge: () => void;
  onAddItems: (ids: string[]) => void;
}) {
  const mismatched = eventNeedsMoving(
    event,
    state.items,
    state.careScheduleRules,
    state.careOverrides,
    state.child.currentHousehold,
  );

  return (
    <Card style={styles.eventCard}>
      <Pressable onPress={onEdit} style={styles.eventPressable}>
        {event.photoUrl ? (
          <Image source={{ uri: event.photoUrl }} style={styles.eventImage} />
        ) : (
          <View style={styles.eventEmojiBox}>
            <Text style={styles.eventEmoji}>{emojis[event.category]}</Text>
          </View>
        )}
        <View style={styles.eventCopy}>
          <View style={styles.eventTitleRow}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            {!event.acknowledged ? <View style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.eventMeta}>{eventDateLabel(event)}</Text>
          {event.location ? (
            <Text style={styles.location}>{event.location}</Text>
          ) : null}
          <View style={styles.tags}>
            <Pill
              label={event.category}
              tone={
                event.category === "Handover"
                  ? "teal"
                  : event.category === "Medical"
                    ? "rose"
                    : "blue"
              }
            />
            <Pill label={`With ${event.responsibleParent}`} />
          </View>
          {event.rsvpDeadline ? (
            <Text style={styles.rsvp}>
              RSVP by {formatDay(event.rsvpDeadline)}
            </Text>
          ) : null}
          {event.notes ? <Text style={styles.notes}>{event.notes}</Text> : null}
        </View>
      </Pressable>

      {mismatched.length ? (
        <View style={styles.eventWarning}>
          <Text style={styles.eventWarningTitle}>Needs moving</Text>
          <Text style={styles.eventWarningBody}>
            {mismatched
              .map((item) => `${item.name} is at ${item.location}`)
              .join(" · ")}
          </Text>
          <SecondaryButton
            label="Add items to handover"
            onPress={() => onAddItems(mismatched.map((item) => item.id))}
          />
        </View>
      ) : null}

      {!event.acknowledged ? (
        <View style={styles.ackAction}>
          <SecondaryButton label="Acknowledge" onPress={onAcknowledge} />
        </View>
      ) : (
        <Text style={styles.acknowledged}>✓ Acknowledged</Text>
      )}
    </Card>
  );
}

function LegendSwatch({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, style]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function ChipGrid<T extends string>({
  values,
  selected,
  onSelect,
}: {
  values: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {values.map((value) => (
        <Pressable
          key={value}
          onPress={() => onSelect(value)}
          style={[styles.chip, value === selected && styles.chipActive]}
        >
          <Text
            style={[
              styles.chipText,
              value === selected && styles.chipTextActive,
            ]}
          >
            {value}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function DateButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.dateButton}>
      <Text style={styles.dateButtonText}>{label}</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.toggleRow}>
      <View style={[styles.checkbox, active && styles.checkboxActive]}>
        {active ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  requestSection: { marginTop: spacing.md },
  requestCard: { marginBottom: spacing.md, borderColor: colours.amber },
  requestTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  requestCopy: { flex: 1 },
  requestTitle: { color: colours.ink, fontSize: 16, fontWeight: "900" },
  requestMeta: {
    color: colours.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  requestNote: {
    color: colours.ink,
    fontSize: 12,
    lineHeight: 18,
    marginVertical: spacing.md,
  },
  requestActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  requestAction: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: 120,
    backgroundColor: colours.background,
  },
  viewToggle: {
    flexDirection: "row",
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: radii.pill,
    padding: 4,
    marginBottom: spacing.md,
  },
  viewButton: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  viewButtonActive: { backgroundColor: colours.tealDark },
  viewButtonText: { color: colours.muted, fontWeight: "800" },
  viewButtonTextActive: { color: colours.white },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  filter: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: radii.pill,
    backgroundColor: colours.surface,
    borderWidth: 1,
    borderColor: colours.line,
  },
  filterActive: {
    backgroundColor: colours.tealDark,
    borderColor: colours.tealDark,
  },
  filterText: { color: colours.muted, fontWeight: "700" },
  filterTextActive: { color: colours.white },
  calendarCard: { paddingHorizontal: spacing.sm, paddingTop: spacing.md },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.md,
  },
  monthArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  monthArrowText: {
    color: colours.tealDark,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: "500",
  },
  monthHeading: { alignItems: "center" },
  monthTitle: { color: colours.ink, fontSize: 20, fontWeight: "900" },
  todayLink: {
    color: colours.tealDark,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 3,
  },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: {
    width: "14.2857%",
    color: colours.muted,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  monthGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.2857%",
    height: 64,
    borderWidth: 2,
    borderColor: colours.surface,
    borderRadius: 10,
    padding: 4,
  },
  dadDay: { backgroundColor: "#E8F1FA" },
  mumDay: { backgroundColor: "#F9EDEF" },
  outsideDay: { opacity: 0.38 },
  selectedDay: { borderColor: colours.tealDark, opacity: 1 },
  dayTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayNumber: { color: colours.ink, fontSize: 12, fontWeight: "900" },
  outsideText: { color: colours.muted },
  todayNumber: {
    color: colours.white,
    backgroundColor: colours.tealDark,
    borderRadius: 9,
    minWidth: 18,
    textAlign: "center",
    overflow: "hidden",
  },
  homeInitial: { color: colours.muted, fontSize: 8, fontWeight: "900" },
  markerRow: {
    flexDirection: "row",
    gap: 2,
    marginTop: 7,
    minHeight: 5,
  },
  marker: { width: 5, height: 5, borderRadius: 3 },
  dayFlags: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: "auto",
  },
  handoverFlag: { color: colours.tealDark, fontSize: 11, fontWeight: "900" },
  overrideFlag: { color: colours.amber, fontSize: 8 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.md,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 13, height: 13, borderRadius: 4 },
  dadLegend: { backgroundColor: "#D8E9F8" },
  mumLegend: { backgroundColor: "#F4DDE2" },
  legendText: { color: colours.muted, fontSize: 10, fontWeight: "700" },
  scheduleLink: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colours.line,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  scheduleLinkText: {
    color: colours.tealDark,
    fontSize: 12,
    fontWeight: "900",
  },
  daySummary: { marginBottom: spacing.md },
  daySummaryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  daySummaryLabel: { color: colours.muted, fontSize: 12, fontWeight: "700" },
  daySummaryHome: {
    color: colours.ink,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 2,
  },
  handoverText: {
    color: colours.tealDark,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  overrideNote: {
    color: colours.muted,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  summaryActions: { marginTop: spacing.lg },
  planningCard: {
    marginBottom: spacing.md,
    backgroundColor: colours.amberSoft,
    borderColor: "#F0D5AE",
  },
  planningTitleRow: { flexDirection: "row", marginBottom: spacing.lg },
  planningEmoji: { fontSize: 28 },
  planningCopy: { flex: 1, marginLeft: spacing.md },
  planningTitle: { color: colours.ink, fontSize: 16, fontWeight: "900" },
  planningBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  eventCard: { marginBottom: spacing.md },
  eventPressable: { flexDirection: "row" },
  eventImage: {
    width: 70,
    height: 70,
    borderRadius: radii.md,
    backgroundColor: colours.background,
  },
  eventEmojiBox: {
    width: 58,
    height: 58,
    borderRadius: radii.md,
    backgroundColor: colours.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  eventEmoji: { fontSize: 26 },
  eventCopy: { flex: 1, marginLeft: spacing.md },
  eventTitleRow: { flexDirection: "row", alignItems: "center" },
  eventTitle: {
    flex: 1,
    color: colours.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colours.amber,
    marginLeft: spacing.sm,
  },
  eventMeta: {
    color: colours.tealDark,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
  },
  location: { color: colours.muted, fontSize: 13, marginTop: 3 },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  rsvp: {
    color: colours.rose,
    fontSize: 12,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  notes: {
    color: colours.muted,
    lineHeight: 19,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  eventWarning: {
    backgroundColor: colours.amberSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  eventWarningTitle: { color: colours.ink, fontWeight: "900" },
  eventWarningBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginVertical: spacing.sm,
  },
  ackAction: { marginTop: spacing.md },
  acknowledged: {
    color: colours.green,
    fontWeight: "800",
    fontSize: 12,
    marginTop: spacing.md,
  },
  label: {
    color: colours.ink,
    fontWeight: "900",
    fontSize: 13,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  helperText: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colours.background,
    borderWidth: 1,
    borderColor: colours.line,
  },
  chipActive: {
    backgroundColor: colours.tealDark,
    borderColor: colours.tealDark,
  },
  chipText: { color: colours.muted, fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: colours.white },
  dateButtons: { flexDirection: "row", gap: spacing.sm },
  dateButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  dateButtonText: {
    color: colours.tealDark,
    fontWeight: "900",
    textAlign: "center",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: { backgroundColor: colours.teal, borderColor: colours.teal },
  tick: { color: colours.white, fontWeight: "900" },
  toggleText: { color: colours.ink, fontWeight: "800" },
  itemPicker: { gap: spacing.sm },
  itemChoice: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colours.line,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  itemChoiceActive: {
    borderColor: colours.teal,
    backgroundColor: colours.tealSoft,
  },
  itemChoiceCopy: { flex: 1, marginLeft: spacing.md },
  itemChoiceTitle: { color: colours.ink, fontWeight: "900" },
  itemChoiceMeta: { color: colours.muted, fontSize: 11, marginTop: 2 },
  choiceCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colours.line,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceCheckActive: {
    backgroundColor: colours.teal,
    borderColor: colours.teal,
  },
  choiceTick: { color: colours.white, fontWeight: "900" },
  sheetIntro: { color: colours.muted, lineHeight: 20 },
  action: { marginTop: spacing.xl },
  secondaryAction: { marginTop: spacing.sm },
});
