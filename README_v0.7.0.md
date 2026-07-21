# HomeBridge v0.7.0 — Calendar and Shared Planning

HomeBridge v0.7 turns the original event list into a shared co-parenting calendar.

## Included

- Month calendar with Monday-first layout.
- Dad/Mum overnight care shown on every date.
- Automatic weekly handover markers from the alternating schedule.
- Temporary care changes and holiday overrides without destroying the normal pattern.
- Month and agenda views.
- Add, edit, acknowledge and delete shared events.
- All-day events, end dates, RSVP deadlines and responsible parent.
- Optional invitation or school-letter photograph stored privately in Supabase.
- Link tracked belongings to an event.
- Warn when required belongings are at the wrong house.
- Add those belongings to the next handover checklist in one action.
- Pull-to-refresh and realtime calendar/care updates.
- Fixed invitation hashing for Supabase's extensions schema.
- Pending invitation status and revocation.
- Automatic refresh when the other parent joins.
- Further Android keyboard and bottom-sheet improvements.

## Required order

1. Run `supabase/v0.7.0_patch.sql` in the existing Supabase project.
2. Build and install HomeBridge v0.7.0.
3. Open the Calendar tab and verify the alternating care pattern.
4. Generate a fresh invitation code for the other parent.

The v0.7 app expects the v0.7 database patch. Running the app first will cause missing-column or missing-table sync errors.
