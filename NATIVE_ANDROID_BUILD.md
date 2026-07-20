# HomeBridge native Android build

This project builds a real installable Android APK. It is not a PWA and does not require Expo Go after installation.

## Browser-only build through GitHub Actions

1. Create a GitHub repository and upload the contents of this folder, preserving `.github/workflows/build-android-apk.yml`.
2. A public repository uses GitHub's standard hosted Actions runners without build-minute charges. Do not add personal data to the repository.
3. Open the repository's **Actions** tab.
4. Open **Build HomeBridge Android APK**.
5. Select **Run workflow**.
6. When the run is green, open it and download the `HomeBridge-Android-v0.5.0` artifact.
7. Extract the artifact and install `HomeBridge-v0.5.0.apk` on Android.

The Supabase project URL and publishable key are entered inside HomeBridge after installation. Never enter a secret or service-role key.

## Current signing status

The first test APK is a debug-signed native Android package. It is suitable for private installation and testing on the two parents' phones. A permanent private release key should be added before Play Store publication or long-term distribution.
