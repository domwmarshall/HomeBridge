import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colours, radii, spacing } from "../theme";
import { PickedPhoto } from "../types";

interface PhotoFieldProps {
  photo?: PickedPhoto;
  existingUrl?: string;
  required?: boolean;
  label?: string;
  onChange: (photo: PickedPhoto) => void;
}

async function optimisePhoto(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PickedPhoto> {
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? 0) > 1600) {
    context.resize({ width: 1600, height: null });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: 0.78,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return {
    uri: result.uri,
    fileName: `homebridge-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    width: result.width,
    height: result.height,
  };
}

export function PhotoField({
  photo,
  existingUrl,
  required = false,
  label = "Picture",
  onChange,
}: PhotoFieldProps) {
  const currentUri = photo?.uri || existingUrl;
  const [processing, setProcessing] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  const handleAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setProcessing(true);
    try {
      onChange(await optimisePhoto(asset));
    } catch {
      Alert.alert(
        "Could not prepare picture",
        "Try taking or choosing the picture again.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const chooseLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo permission needed",
        "Allow HomeBridge to choose a picture from your phone.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets[0])
      await handleAsset(result.assets[0]);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera permission needed",
        "Allow HomeBridge to take a picture.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });
    if (!result.canceled && result.assets[0])
      await handleAsset(result.assets[0]);
  };

  return (
    <View>
      <Text style={styles.label}>
        {label}
        {required ? " *" : ""}
      </Text>
      {currentUri ? (
        <Pressable onPress={() => setFullScreen(true)}>
          <Image
            source={{ uri: currentUri }}
            style={styles.preview}
            resizeMode="cover"
          />
          <Text style={styles.previewHint}>Tap to view full size</Text>
        </Pressable>
      ) : (
        <View style={styles.missing}>
          <Text style={styles.camera}>＋</Text>
          <Text style={styles.missingTitle}>Add a real picture</Text>
          <Text style={styles.missingBody}>
            Photos make it much easier to identify the right item between homes.
          </Text>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={() => void takePhoto()}
          disabled={processing}
        >
          <Text style={styles.actionText}>
            {processing ? "Preparing…" : "Take photo"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.action}
          onPress={() => void chooseLibrary()}
          disabled={processing}
        >
          <Text style={styles.actionText}>
            {currentUri ? "Replace photo" : "Choose photo"}
          </Text>
        </Pressable>
      </View>
      <Modal
        visible={fullScreen}
        animationType="fade"
        transparent
        onRequestClose={() => setFullScreen(false)}
      >
        <SafeAreaView style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalClose}
            onPress={() => setFullScreen(false)}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>
          {currentUri ? (
            <Image
              source={{ uri: currentUri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function ItemPhoto({ uri, size = 58 }: { uri?: string; size?: number }) {
  const [fullScreen, setFullScreen] = useState(false);
  if (uri) {
    return (
      <>
        <Pressable onPress={() => setFullScreen(true)}>
          <Image
            source={{ uri }}
            style={{
              width: size,
              height: size,
              borderRadius: 14,
              backgroundColor: colours.background,
            }}
            resizeMode="cover"
          />
        </Pressable>
        <Modal
          visible={fullScreen}
          animationType="fade"
          transparent
          onRequestClose={() => setFullScreen(false)}
        >
          <SafeAreaView style={styles.modalBackdrop}>
            <Pressable
              style={styles.modalClose}
              onPress={() => setFullScreen(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
            <Image
              source={{ uri }}
              style={styles.fullImage}
              resizeMode="contain"
            />
          </SafeAreaView>
        </Modal>
      </>
    );
  }
  return (
    <View
      style={[
        styles.photoNeeded,
        { width: size, height: size, borderRadius: 14 },
      ]}
    >
      <Text style={styles.photoNeededMark}>＋</Text>
      <Text style={styles.photoNeededText}>Photo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colours.ink,
    fontWeight: "900",
    fontSize: 13,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colours.background,
  },
  previewHint: {
    color: colours.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 5,
  },
  missing: {
    minHeight: 170,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colours.teal,
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  camera: { color: colours.tealDark, fontSize: 34, fontWeight: "400" },
  missingTitle: {
    color: colours.ink,
    fontWeight: "900",
    marginTop: spacing.sm,
  },
  missingBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 4,
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { color: colours.tealDark, fontWeight: "900", fontSize: 13 },
  photoNeeded: {
    backgroundColor: colours.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  photoNeededMark: { color: colours.tealDark, fontSize: 20, lineHeight: 20 },
  photoNeededText: {
    color: colours.tealDark,
    fontSize: 8,
    fontWeight: "900",
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
    padding: spacing.lg,
  },
  modalClose: {
    alignSelf: "flex-end",
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  modalCloseText: { color: colours.white, fontWeight: "900", fontSize: 15 },
  fullImage: { flex: 1, width: "100%" },
});
