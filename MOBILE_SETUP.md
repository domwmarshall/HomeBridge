# HomeBridge mobile setup checklist

## Supabase

- Create a free project in the Supabase dashboard.
- Wait until the project reports that it is ready.
- Open SQL Editor.
- Paste and run `supabase/schema.sql` once.
- Open the Connect panel.
- Copy the Project URL.
- Copy the Publishable key.
- Do not copy the service-role or secret key.

## First parent: Dominic

- Open HomeBridge.
- Paste the Project URL and Publishable key.
- Create an account using Dominic's own email.
- Confirm the email if Supabase requests it.
- Create the household as Dad with child name Eva.
- Open Eva → Shared household → Invite Hayley.
- Share the generated one-time code with Hayley.

## Second parent: Hayley

- Open HomeBridge on her phone.
- Use the same Project URL and Publishable key.
- Create an account using her own email.
- Confirm the email if requested.
- Choose Join with code.
- Enter her name, choose Mum and paste the invite code.

## Before real use

- Confirm both phones show the same household.
- Add a harmless test event on one phone and verify it appears on the other.
- Move a test item and verify the new location on the other phone.
- Confirm neither account can see anything while signed out.
- Only then begin entering real medical-item information.
