# Build verification — HomeBridge v0.2

## Completed

- TypeScript strict type-check passes
- Expo SDK 55 dependency tree installed
- Android production JavaScript/Hermes bundle exports successfully
- Local demo persistence works through AsyncStorage
- Runtime Supabase connection screen added
- Supabase email/password authentication added
- Household creation and one-time invite-code joining added
- Live repository reads/writes added for events, items, handovers and acknowledgements
- Realtime table subscriptions added
- Cached live-state reads added
- Transactional handover completion RPC added
- Row Level Security and private Storage policies added
- Norfolk model holidays for 2026-27 and 2027-28 added as editable starter events

## Verification limitation

Expo Doctor passed 17 of 19 checks. Its two network-backed metadata checks could not reach the Expo API; no code or dependency defect was reported by those checks. A local APK could not be produced in this environment because the Android SDK download host was unreachable.

## Requires a real Supabase project to verify

- SQL migration execution in Supabase
- Two-account RLS isolation test
- Realtime delivery between two physical devices
- Email confirmation behaviour
- Private Storage upload and signed-download flow

## Not yet production-ready

Push notifications, camera uploads, biometric lock, full profile/medical editing, account deletion, export, recovery procedures, Android release signing and final privacy documentation remain for later passes.
