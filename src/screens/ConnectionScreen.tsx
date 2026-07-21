import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Card, Field, PrimaryButton, SecondaryButton } from "../components/UI";
import { configureSupabase } from "../lib/supabase";
import { colours, spacing } from "../theme";

export function ConnectionScreen({
  onUseDemo,
  onConnected,
}: {
  onUseDemo: () => void;
  onConnected: () => void;
}) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      await configureSupabase(url, key);
      onConnected();
    } catch (caught) {
      Alert.alert(
        "Could not connect",
        caught instanceof Error
          ? caught.message
          : "Please check the details and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logo}>
          <Text style={styles.logoMark}>↔</Text>
        </View>
        <Text style={styles.brand}>HomeBridge</Text>
        <Text style={styles.title}>Connect your free Supabase project</Text>
        <Text style={styles.body}>
          Create the project and run the included SQL in your phone browser,
          then paste the two client connection values here.
        </Text>
        <Card>
          <Step
            number="1"
            title="Create a free Supabase project"
            body="Open Supabase in your phone browser and create a new project."
          />
          <Step
            number="2"
            title="Run the HomeBridge migration"
            body="Open SQL Editor, paste supabase/schema.sql from the project ZIP, and run it once."
          />
          <Step
            number="3"
            title="Open the Connect panel"
            body="Copy the Project URL and Publishable key. Do not use the service-role or secret key."
          />
          <Text style={styles.label}>Project URL</Text>
          <Field
            value={url}
            onChangeText={setUrl}
            placeholder="https://your-project.supabase.co"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.label}>Publishable key</Text>
          <Field
            value={key}
            onChangeText={setKey}
            placeholder="sb_publishable_…"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <View style={styles.button}>
            <PrimaryButton
              label={busy ? "Testing connection…" : "Connect HomeBridge"}
              onPress={connect}
              disabled={busy || !url.trim() || !key.trim()}
            />
          </View>
        </Card>
        <View style={styles.demo}>
          <SecondaryButton label="Open local demo" onPress={onUseDemo} />
        </View>
        <Text style={styles.note}>
          The Project URL and publishable key identify the public app client.
          HomeBridge never asks for your Supabase database password or
          service-role key.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.number}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colours.background },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: colours.background,
    paddingBottom: 48,
  },
  logo: {
    width: 62,
    height: 62,
    borderRadius: 22,
    backgroundColor: colours.tealDark,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  logoMark: { color: colours.white, fontSize: 31, fontWeight: "900" },
  brand: {
    color: colours.tealDark,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2.2,
    textAlign: "center",
    marginTop: spacing.md,
  },
  title: {
    color: colours.ink,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: "900",
    textAlign: "center",
    marginTop: spacing.md,
  },
  body: {
    color: colours.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  step: { flexDirection: "row", marginBottom: spacing.lg },
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: colours.tealDark, fontWeight: "900" },
  stepCopy: { flex: 1, marginLeft: spacing.md },
  stepTitle: { color: colours.ink, fontWeight: "900" },
  stepBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  label: {
    color: colours.ink,
    fontWeight: "900",
    fontSize: 13,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  button: { marginTop: spacing.lg },
  demo: { marginTop: spacing.md },
  note: {
    color: colours.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
