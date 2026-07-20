import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colours, radii, spacing } from '../theme';
import { PickedPhoto } from '../types';

interface PhotoFieldProps {
  photo?: PickedPhoto;
  existingUrl?: string;
  required?: boolean;
  label?: string;
  onChange: (photo: PickedPhoto) => void;
}

export function PhotoField({
  photo,
  existingUrl,
  required = false,
  label = 'Picture',
  onChange,
}: PhotoFieldProps) {
  const currentUri = photo?.uri || existingUrl;

  const chooseLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow HomeBridge to choose a picture from your phone.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });
    if (!result.canceled && result.assets[0]) onChange(result.assets[0]);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow HomeBridge to take a picture.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.75,
    });
    if (!result.canceled && result.assets[0]) onChange(result.assets[0]);
  };

  return (
    <View>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      {currentUri ? (
        <Image source={{ uri: currentUri }} style={styles.preview} resizeMode="cover" />
      ) : (
        <View style={styles.missing}>
          <Text style={styles.camera}>＋</Text>
          <Text style={styles.missingTitle}>Add a real picture</Text>
          <Text style={styles.missingBody}>Photos make it much easier to identify the right item between homes.</Text>
        </View>
      )}
      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={takePhoto}>
          <Text style={styles.actionText}>Take photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={chooseLibrary}>
          <Text style={styles.actionText}>Choose photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ItemPhoto({ uri, size = 58 }: { uri?: string; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 14, backgroundColor: colours.background }} resizeMode="cover" />;
  }
  return (
    <View style={[styles.photoNeeded, { width: size, height: size, borderRadius: 14 }]}>
      <Text style={styles.photoNeededMark}>＋</Text>
      <Text style={styles.photoNeededText}>Photo</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colours.ink,
    fontWeight: '900',
    fontSize: 13,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    backgroundColor: colours.background,
  },
  missing: {
    minHeight: 170,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colours.teal,
    backgroundColor: colours.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  camera: {
    color: colours.tealDark,
    fontSize: 34,
    fontWeight: '400',
  },
  missingTitle: {
    color: colours.ink,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  missingBody: {
    color: colours.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colours.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: colours.tealDark,
    fontWeight: '900',
    fontSize: 13,
  },
  photoNeeded: {
    backgroundColor: colours.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoNeededMark: {
    color: colours.tealDark,
    fontSize: 20,
    lineHeight: 20,
  },
  photoNeededText: {
    color: colours.tealDark,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 2,
  },
});
