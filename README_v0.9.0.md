# HomeBridge v0.9.0 — Shared Inbox and Android Safe Areas

## Included

- Bottom navigation is positioned above Android three-button and gesture navigation using real device safe-area insets.
- Bottom sheets also respect the navigation-bar inset.
- A shared inbox with unread and needs-action counts.
- Realtime household update cards for calendar, care changes, medical changes, item requests and newly joined members.
- Immediate Android alerts for new realtime inbox records when HomeBridge is connected and notification permission is enabled.
- Request a tracked item for the next handover.
- The other parent can add it to the checklist or mark it unavailable.
- Request status and responses are retained in both parents' inboxes and activity history.
- Inbox badge available from every main screen.

## Scope note

The inbox itself is server-backed and reliable. Immediate Android alerts are generated from Supabase Realtime while the HomeBridge process is connected. Fully remote delivery while the app is force-stopped requires an FCM/Expo push credential and a deployed server function; that credential is deliberately not embedded in the APK.

Run `supabase/v0.9.0_patch.sql` before installing this version.
