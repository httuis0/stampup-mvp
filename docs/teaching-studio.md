# Teaching studio setup

Apply the next migration from the lingua-spark folder:

```sh
npx supabase db push
```

Create or use your normal Luma account. In Supabase → Authentication → Users, copy its user ID. In the Supabase SQL Editor run this after replacing the placeholder:

```sql
insert into public.content_staff (user_id, role)
values ('YOUR_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

This assignment is done only by the project owner. Signing up for an app account does not grant teacher permissions. In this first release teachers and admins both edit and publish content; staff membership is managed only through the project owner’s database access.

Start Expo, open its web address, and add `?studio=teacher`. For example, if Expo is running on port 8082:

`http://localhost:8082/?studio=teacher`

Sign in, select **Import existing lessons**, then select a lesson. Import keeps existing draft rows and preserves all current lesson IDs. Imported lessons are drafts until you publish them.

Edit a title or activity, save the draft, preview it, then publish. Draft edits do not change the published lesson. If another teacher has changed a draft, saving or publishing an outdated version fails so you can reload it safely.

Open or reload the learner app after publishing. It downloads published English lessons and keeps a device cache. Switching back to the app also refreshes the catalog. Lessons already open remain the version the learner started. Unpublishing hides the lesson after the next successful catalog refresh; offline devices may still use their last downloaded version. Existing bundled lessons remain available until explicitly replaced or unpublished.

## Included in this release

- Separate browser entry for teacher login and authoring.
- Import of existing courses, units and lessons without replacing manual edits.
- New lesson creation in existing units, activity editing, preview, save, publish and unpublish.
- Database-enforced staff permissions and optimistic version checks.
- Immutable publication history and separate draft/live snapshots.
- Learner app reads published English lessons and caches them locally.

## Remaining work

The studio currently edits lesson content in existing units. Course and unit creation UI, translation workflow, media uploads, staff invitation UI, subscriptions, detailed learning-attempt records and assessment improvements are subsequent features. Lesson translation text is currently the existing Bangla explanation field, not a complete multi-language course publishing system.

Published snapshots retain previously public content when unpublished so the mobile app can hide matching bundled IDs. Unpublish is not a remote wipe of downloaded content.

## Verification

The database regression test runs PostgreSQL in memory and checks learner access denial, hidden drafts, staff self-promotion denial, draft revision conflicts, invalid answer rejection, publish isolation and unpublishing history.

```sh
node --test tests/course-publishing.test.mjs
npx tsc --noEmit
```

After applying to Supabase, test with one staff account and one ordinary learner account. The learner must not be able to enter the teaching studio, and should see only published changes in its learning path.
