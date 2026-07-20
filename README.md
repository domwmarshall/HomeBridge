# HomeBridge v0.5

HomeBridge is a native React Native / Expo Android co-parenting app backed by Supabase.

## Current features

- Separate secure accounts for parents
- One shared household and child workspace
- Alternating handovers and collection details
- Shared calendar and Norfolk model school holidays
- Belonging and uniform location tracking
- Handover checklists and item transfer
- EpiPen and medical-item tracking
- One-time household invite codes
- Supabase Row Level Security and realtime refresh
- Local cached access during temporary connection loss

## Native Android build

Read `NATIVE_ANDROID_BUILD.md`. The included GitHub Actions workflow creates an installable APK without requiring Node.js, Android Studio, Expo Go, Replit, or EAS Build on the user's device.

## Supabase

The live database schema has already been installed in the user's Supabase project. On first launch, enter only the Supabase project URL and publishable key. Never use the secret or service-role key in the app.
