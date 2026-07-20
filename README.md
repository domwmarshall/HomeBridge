# HomeBridge v0.2

**Everything Eva needs, between two homes.**

HomeBridge is a free-first Expo React Native co-parenting app with a Supabase backend. It is designed around practical handovers, school collections, belongings, invitations, school holidays and medical-item locations.

## What works in this build

- Secure email/password accounts through Supabase Auth
- Create a shared household or join one with a one-time invite code
- Separate Dominic/Dad and Hayley/Mum identities without sharing passwords
- Supabase Postgres storage with household-level Row Level Security
- Realtime refresh between both parents' phones
- Cached read access when the connection temporarily drops
- Five main tabs: Today, Calendar, Things, Handover and Eva
- Alternating Tuesday handover starter rule
- School pickup and handover checklist
- Belonging locations and automatic transfer on completed handover
- Shared calendar events, parties, trips and acknowledgements
- Norfolk 2026-27 and 2027-28 model school holidays, editable for school-specific differences
- Medical-item schema with locations, quantities, checks and expiry dates
- Private Supabase Storage bucket policies for future photos and documents
- Local demo mode if Supabase is not connected

## Phone-first Supabase setup

1. In your phone browser, create a free Supabase project.
2. In Supabase, open **SQL Editor**, create a new query, paste all of `supabase/schema.sql`, and run it once.
3. In the Supabase project, open **Connect** and copy:
   - Project URL
   - Publishable key
4. Open HomeBridge and paste those two values into its connection screen.
5. Create Dominic's account and household. From **Eva → Shared household**, create Hayley's one-time invite code.
6. Hayley creates her own account and selects **Join with code**.

The Project URL and publishable key are client identifiers. Never paste a database password, secret key or service-role key into the app.

## Run the source project

Requirements: Node.js 20.19.4 or later.

```bash
npm install
npx expo start
```

You can alternatively create `.env` from `.env.example`. Environment variables take priority over the connection details entered in the app.

## Authentication note

Supabase commonly requires new users to confirm their email address. During testing, either open the confirmation email before signing in or adjust the project's email confirmation setting in Supabase Auth.

## Data and safety

- Test access using two genuinely separate accounts before entering real medical information.
- HomeBridge tracks practical information; it is not a clinical decision-support system.
- Avoid putting sensitive medical details in future push-notification text.
- School model dates can differ from academy, school and INSET dates, so confirm Arden Grove's own calendar.
- Cached live data is read-only protection against a temporary connection loss; failed writes must be retried once online.

## Still to build

- Editing Eva's full profile in-app
- Adding/editing individual EpiPens and medical items in-app
- Date and time pickers for new events
- Camera uploads and document vault
- Push notifications
- Biometric app lock
- Full activity-history screen
- Data export and account deletion
- Signed Android APK and Play Store release
