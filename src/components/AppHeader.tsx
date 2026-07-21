import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../store/AppContext";
import { useCommunication } from "../store/CommunicationContext";
import { useAppNavigation } from "../store/NavigationContext";
import { colours, radii, spacing } from "../theme";
import { Pill } from "./UI";

export function AppHeader({
  title,
  subtitle,
  showInbox = true,
}: {
  title: string;
  subtitle?: string;
  showInbox?: boolean;
}) {
  const { mode, syncState } = useApp();
  const { unreadCount, actionCount } = useCommunication();
  const { navigate } = useAppNavigation();
  const status =
    mode === "demo"
      ? { label: "Local demo", tone: "amber" as const }
      : syncState === "synced"
        ? { label: "Live", tone: "green" as const }
        : syncState === "connecting"
          ? { label: "Syncing", tone: "blue" as const }
          : { label: "Offline", tone: "rose" as const };

  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>HomeBridge</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        <Pill label={status.label} tone={status.tone} />
        {showInbox ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unreadCount} unread HomeBridge updates`}
            onPress={() => navigate("inbox")}
            style={styles.inboxButton}
          >
            <Text style={styles.inboxIcon}>✉</Text>
            {unreadCount ? (
              <View style={[styles.badge, actionCount ? styles.actionBadge : undefined]}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.lg },
  copy: { flex: 1, paddingRight: spacing.md },
  actions: { alignItems: "flex-end", gap: spacing.sm },
  eyebrow: { color: colours.tealDark, fontSize: 11, fontWeight: "900", letterSpacing: 1.8, marginBottom: spacing.xs },
  title: { color: colours.ink, fontSize: 28, lineHeight: 34, fontWeight: "900" },
  subtitle: { color: colours.muted, fontSize: 14, marginTop: spacing.xs },
  inboxButton: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line, alignItems: "center", justifyContent: "center" },
  inboxIcon: { color: colours.tealDark, fontSize: 20, fontWeight: "900" },
  badge: { position: "absolute", top: -5, right: -5, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colours.amber, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colours.background },
  actionBadge: { backgroundColor: colours.rose },
  badgeText: { color: colours.white, fontSize: 10, fontWeight: "900" },
});
