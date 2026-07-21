# HomeBridge v1.0.0

HomeBridge is a private native Android co-parenting app using Expo React Native and Supabase.

This release adds a household message thread, persistent one-time invitation codes, navigation-safe realtime refreshes, private photo attachments, read receipts and structured links to events, items and handovers.

## Required migration

Run `supabase/v1.0.0_patch.sql` after the earlier HomeBridge migrations and before installing the v1.0 APK.

## Security

All household records and attachments remain protected by Supabase Row Level Security. The Android app uses only the project URL and publishable client key. Never put a service-role key in the app.
