# HomeBridge v0.6.0

This release turns the prototype into an editable shared household app.

Key fixes:
- Android keyboard resizing and keyboard-safe bottom sheets.
- Required real item and medical-item pictures using camera or gallery.
- Add, edit, move and remove belongings.
- Add, edit and remove calendar events with actual date/time and parent responsibility.
- Add, edit and remove EpiPens and other medical items, including expiry and label photo.
- Edit the child profile and school details.
- Create and share one-time co-parent invite codes; household owner can remove a member.
- Add and remove handover checklist entries and link them to tracked items.
- Detailed Supabase error messages rather than generic failures.
- Empty states, safe zero-item progress, dynamic child tab label and future-only dashboard events.

Run `supabase/v0.6.0_patch.sql` before testing invites and medical notes.
