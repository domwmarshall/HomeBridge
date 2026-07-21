import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  AppState,
  NotificationPermission,
  NotificationSettings,
} from "../types";
import {
  addCalendarDays,
  nextHandoverDate,
  parentForHome,
} from "../utils/calendar";

const SETTINGS_KEY = "@homebridge/notification-settings-v1";
const CHANNEL_ID = "homebridge-reminders";
const PREFIX = "homebridge-";

export const defaultNotificationSettings: NotificationSettings = {
  enabled: false,
  handovers: true,
  events: true,
  rsvp: true,
  medical: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "HomeBridge reminders",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: "#176B65",
  });
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const saved = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!saved) return defaultNotificationSettings;
  try {
    return {
      ...defaultNotificationSettings,
      ...(JSON.parse(saved) as Partial<NotificationSettings>),
    };
  } catch {
    return defaultNotificationSettings;
  }
}

export async function saveNotificationSettings(
  settings: NotificationSettings,
): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function notificationPermission(): Promise<NotificationPermission> {
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return "granted";
  if (!permissions.canAskAgain) return "denied";
  return "undetermined";
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  await ensureChannel();
  const permissions = await Notifications.requestPermissionsAsync();
  if (permissions.granted) return "granted";
  return permissions.canAskAgain ? "undetermined" : "denied";
}

async function clearHomeBridgeNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((request) => request.identifier.startsWith(PREFIX))
      .map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier),
      ),
  );
}

function previousEvening(value: Date): Date {
  const reminder = addCalendarDays(value, -1);
  reminder.setHours(19, 0, 0, 0);
  return reminder;
}

function dateAt(value: string, hour: number): Date {
  const date = new Date(value);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function schedule(
  identifier: string,
  title: string,
  body: string,
  date: Date,
  data: Record<string, string>,
): Promise<void> {
  if (date.getTime() <= Date.now() + 60_000) return;
  await Notifications.scheduleNotificationAsync({
    identifier: `${PREFIX}${identifier}`,
    content: {
      title,
      body,
      data: { ...data, homebridge: "true" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: CHANNEL_ID,
    },
  });
}

export async function syncLocalNotifications(
  state: AppState,
  settings: NotificationSettings,
): Promise<void> {
  await ensureChannel();
  await clearHomeBridgeNotifications();
  if (!settings.enabled) return;

  const permission = await notificationPermission();
  if (permission !== "granted") return;

  const jobs: Array<() => Promise<void>> = [];

  if (settings.handovers) {
    const handover = nextHandoverDate(
      new Date(),
      state.careScheduleRules,
      true,
    );
    const rule = state.careScheduleRules[0];
    if (handover && rule) {
      const destination = state.careOverrides.length
        ? undefined
        : rule.householdLabel;
      const parent =
        rule.pickupParentLabel ??
        (destination ? parentForHome(destination) : state.child.nextHandoverTo);
      jobs.push(() =>
        schedule(
          `handover-${handover.toISOString().slice(0, 10)}`,
          "Handover tomorrow",
          `${parent} collects ${state.child.name} from ${rule.pickupLocation ?? "the agreed handover point"}.`,
          previousEvening(handover),
          { screen: "handover" },
        ),
      );
    }
  }

  if (settings.events) {
    const upcoming = [...state.events]
      .filter(
        (event) =>
          new Date(event.endsAt ?? event.startsAt).getTime() > Date.now(),
      )
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt))
      .slice(0, 24);
    upcoming.forEach((event) => {
      const start = new Date(event.startsAt);
      const reminder = previousEvening(start);
      jobs.push(() =>
        schedule(
          `event-${event.id}`,
          event.title,
          `${event.responsibleParent} responsible${event.location ? ` · ${event.location}` : ""}.`,
          reminder,
          { screen: "calendar", eventId: event.id },
        ),
      );
    });
  }

  if (settings.rsvp) {
    state.events
      .filter((event) => Boolean(event.rsvpDeadline))
      .slice(0, 24)
      .forEach((event) => {
        const deadline = dateAt(event.rsvpDeadline!, 9);
        const reminder = addCalendarDays(deadline, -2);
        reminder.setHours(9, 0, 0, 0);
        jobs.push(() =>
          schedule(
            `rsvp-${event.id}`,
            "RSVP deadline approaching",
            `${event.title} needs a response soon.`,
            reminder,
            { screen: "calendar", eventId: event.id },
          ),
        );
      });
  }

  if (settings.medical) {
    const warningDays = [90, 60, 30, 7];
    state.medicalItems.forEach((item) => {
      warningDays.forEach((days) => {
        const expiry = dateAt(item.expiryDate, 9);
        const reminder = addCalendarDays(expiry, -days);
        reminder.setHours(9, 0, 0, 0);
        jobs.push(() =>
          schedule(
            `medical-${item.id}-${days}`,
            `${item.name} expires in ${days} days`,
            `Check the item at ${item.location} and arrange a replacement if needed.`,
            reminder,
            { screen: "child", medicalId: item.id },
          ),
        );
      });
    });
  }

  for (const job of jobs.slice(0, 60)) {
    await job();
  }
}
