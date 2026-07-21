# HomeBridge v1.0.0 — Messaging and Reliable Invitations

## Added

- Parent-to-parent message thread inside the shared inbox.
- Replies, read receipts, search, copy, edit and remove actions.
- Private message photographs stored in the household storage bucket.
- Links from messages to items, calendar events and the next handover.
- Separate Messages, Needs action and Updates sections.
- Visible, copyable and shareable active invitation codes.
- Revoke and replace invitation controls.
- Duplicate-parent-role protection.
- Idempotent message sending to prevent duplicates after retries.
- Selected tab persistence across refreshes and app backgrounding.

## Fixed

- Creating an invite no longer unmounts the application or sends the user back to Today.
- Realtime membership and invitation refreshes no longer replace the whole navigator with a loading screen.
- Conditional card styles use the supported React Native StyleProp type.

## Notes

Realtime Android alerts work while HomeBridge is connected. Fully terminated-app remote push still requires an Expo/FCM project credential and a deployed server sender; no private push credential is embedded in the APK.
