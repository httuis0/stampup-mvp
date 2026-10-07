# Production learner-data foundation

This milestone moves Luma from device-only demo progress to authenticated, offline-first learner data.

## What is included

- A private `profiles` row for each learner.
- Queryable learner preferences in `learner_settings`.
- A versioned `learner_state` document that preserves the current app's complete progress model while the product is migrated to normalized learning records.
- Row-level security on every learner table. An authenticated learner can only read and change their own records.
- Automatic profile and settings creation for new Supabase Auth users.
- Existing on-device progress migration after sign-in.
- Newest-copy resolution between the device and cloud.
- Immediate device saves, debounced cloud sync, and offline fallback.
- A durable reset marker so deleted progress is not restored from the cloud after an offline reset.

The migration is:

`supabase/migrations/202609230001_production_learner_foundation.sql`

## One-time Supabase setup

Run these commands from the `lingua-spark` folder:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Your project reference appears in the Supabase project URL and in **Project settings → General**. Do not place a database password, service-role key, or AI provider key in the Expo `.env` file.

After the push, Supabase Table Editor should show:

- `profiles`
- `learner_settings`
- `learner_state`

In **Authentication → Policies**, confirm row-level security is enabled for all three tables.

## App verification

1. Restart Expo and sign in to an existing Luma account.
2. Complete one lesson or change a profile preference.
3. Wait about one second.
4. In Supabase Table Editor, open `learner_state` and confirm the signed-in user's row exists.
5. Sign into the same account on another device or browser. The same progress should load.
6. Turn off the network, complete an activity, and reopen the app. The local copy should still load and sync after the connection returns and another progress change occurs.

## Intentional limits of this bridge

This is the safe compatibility layer for the current learner app, not the final analytics model. The raw state document must not be used to decide paid access because client progress can be edited by a modified app. Subscription entitlements must come from verified App Store, Play Store, or billing webhooks on the server.

Profile images currently remain device-local because they are local file URIs. The next media milestone should upload them to a private Supabase Storage bucket and save only the storage path.

## Next production migrations

The next schema work should add normalized tables behind the same repository boundary, in this order:

1. Course catalog and publishing: courses, levels, units, lessons, exercises, translations, draft/published versions.
2. Learning evidence: lesson attempts, exercise attempts, answer events, speaking sessions, teacher corrections.
3. Mastery and review: skill mastery, vocabulary mastery, grammar mastery, spaced-repetition items and review outcomes.
4. Billing entitlements: products, subscriptions, receipts/webhook events, and server-owned access decisions.
5. Teacher dashboard roles: organizations, staff memberships, content permissions, audit log, and publish workflow.

This order lets the current mobile app keep working while the teacher dashboard and adaptive learning engine are added without another destructive rewrite.
