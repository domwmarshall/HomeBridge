# HomeBridge v0.8.0

## Reliable UK care calendar

- One date-only engine is shared by Today, Calendar, Handover and reminders.
- Tuesday handovers are normalised to Tuesday even when an older database rule was saved on Monday.
- Date calculations avoid UTC conversion for date-only values, preventing BST/GMT one-day shifts.
- Calendar cells show **Dad** or **Mum**, with the selected date using the same care plan as the Today screen.
- A build-time calendar regression test covers Monday-versus-Tuesday and the October clock change.
- Existing care rules are corrected to a weekly Tuesday handover, with the household alternating each week.

## Two-parent care changes

- A parent can propose a temporary care arrangement for a date range.
- The other parent must accept or reject it.
- The requester can cancel a pending proposal.
- Accepted requests become calendar care overrides.
- Overlapping pending or accepted changes are rejected by the database.
- Requests update in realtime and are written to the household activity log.

## Android reminders

- Optional local reminders for handovers, events, RSVP deadlines and medical expiry warnings.
- Each parent controls reminder categories independently on their own phone.
- Tapping a reminder opens the relevant HomeBridge tab.

## Reliability and photographs

- Network-aware Live, Syncing and Offline states.
- Automatic refresh when connectivity returns, realtime refresh and pull-to-refresh.
- Last successful sync and the latest sync error are shown in the child/privacy screen.
- New photographs are resized and compressed before private upload.
- Item and medical photographs can be opened full-screen.

## Required migration

Run `supabase/v0.8.0_patch.sql` in Supabase SQL Editor before opening v0.8.0.
