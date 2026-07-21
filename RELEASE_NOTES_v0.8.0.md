# HomeBridge v0.8.0 release notes

## Fixed

- Monday handover arrows when the actual handover was Tuesday.
- Date-only values drifting across BST/GMT because of UTC conversion.
- Different care results between Today and Calendar.
- Ambiguous D/M calendar labels.
- Two-week recurrence text conflicting with weekly handovers.

## Added

- Shared date-only care engine and regression tests.
- Two-parent propose, accept, reject and cancel care-change workflow.
- Realtime care-change updates and audit entries.
- Local Android handover, event, RSVP and medical reminders.
- Per-device reminder settings.
- Network-aware refresh and last-sync information.
- Photograph compression and full-screen previews.

## Scope note

The reminders in this release are scheduled locally on each Android phone from synced HomeBridge data. Server-originated push notifications for changes made while the receiving phone has not recently synced remain a later production pass.
