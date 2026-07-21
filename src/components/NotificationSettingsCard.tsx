import React from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { useApp } from "../store/AppContext";
import { colours, spacing } from "../theme";
import { NotificationSettings } from "../types";
import { Card, Pill } from "./UI";

export function NotificationSettingsCard() {
  const {
    notificationSettings,
    notificationPermission,
    updateNotificationSettings,
    requestNotifications,
  } = useApp();

  const setSetting = async <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K],
  ) => {
    try {
      if (
        key === "enabled" &&
        value === true &&
        notificationPermission !== "granted"
      ) {
        const result = await requestNotifications();
        if (result !== "granted") {
          Alert.alert(
            "Notifications are off",
            "Allow notifications for HomeBridge in Android Settings to receive reminders.",
          );
          return;
        }
        return;
      }
      await updateNotificationSettings({
        ...notificationSettings,
        [key]: value,
      });
    } catch {
      Alert.alert("Could not update reminders", "Please try again.");
    }
  };

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Reminders on this phone</Text>
          <Text style={styles.body}>
            HomeBridge schedules private Android reminders from the shared
            calendar.
          </Text>
        </View>
        <Pill
          label={
            notificationSettings.enabled && notificationPermission === "granted"
              ? "On"
              : "Off"
          }
          tone={
            notificationSettings.enabled && notificationPermission === "granted"
              ? "green"
              : "amber"
          }
        />
      </View>
      <ToggleRow
        label="Enable reminders"
        value={
          notificationSettings.enabled && notificationPermission === "granted"
        }
        onValueChange={(value) => void setSetting("enabled", value)}
      />
      <ToggleRow
        label="Handover and collection"
        value={notificationSettings.handovers}
        disabled={!notificationSettings.enabled}
        onValueChange={(value) => void setSetting("handovers", value)}
      />
      <ToggleRow
        label="Events and school plans"
        value={notificationSettings.events}
        disabled={!notificationSettings.enabled}
        onValueChange={(value) => void setSetting("events", value)}
      />
      <ToggleRow
        label="RSVP deadlines"
        value={notificationSettings.rsvp}
        disabled={!notificationSettings.enabled}
        onValueChange={(value) => void setSetting("rsvp", value)}
      />
      <ToggleRow
        label="Medical expiry warnings"
        value={notificationSettings.medical}
        disabled={!notificationSettings.enabled}
        onValueChange={(value) => void setSetting("medical", value)}
        last
      />
    </Card>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled = false,
  last = false,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        !last && styles.rowBorder,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colours.line, true: colours.teal }}
        thumbColor={colours.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerCopy: { flex: 1 },
  title: { color: colours.ink, fontSize: 16, fontWeight: "900" },
  body: { color: colours.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colours.line },
  rowLabel: {
    color: colours.ink,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    paddingRight: spacing.md,
  },
  disabled: { opacity: 0.45 },
});
