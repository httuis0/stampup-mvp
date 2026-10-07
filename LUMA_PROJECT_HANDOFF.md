# Luma — Project Handoff

Last updated: September 28, 2026

## What Luma is

Luma is a multilingual, AI-supported mobile language-learning app built with Expo / React Native and Supabase. It is intended to become a real App Store and Play Store product, not a prototype.

The product has two connected experiences:

1. Learner mobile app — lessons, progress, review, speaking practice, profile, language settings, and subscriptions in the future.
2. Teacher studio — a web workspace where approved staff can create, import, preview, and publish lessons.

## Core product direction

- Luma should teach languages through a structured path from Pre-A1 through advanced levels.
- It should adapt to a learner’s level, goals, mistakes, practice history, and preferred language.
- The AI is a teacher, not a general assistant. Its role is to ask useful questions, answer language questions, correct errors gently, teach vocabulary, and keep conversations natural.
- The visual style is calm, premium, welcoming, and focused: warm cream background, forest green foundation, lime progress accents, and a small amount of coral and violet for learning moments.
- The app must avoid unnecessary buttons and clutter. Every screen should have one clear primary action.

## Workspace

Project folder:

`/Users/najmul/Documents/Codex/2026-09-15/https-chatgpt-com-share-6aa92a41-76b4/outputs/lingua-spark`

Important folders:

- `App.tsx` — learner app screens and primary UI.
- `src/components/TeacherSession.tsx` — Maya/Leo speaking lesson experience.
- `src/components/TeacherDashboard.tsx` — web teacher studio.
- `src/data/scenarios.ts` — detailed real-world speaking scenarios.
- `src/lessons/` — progressive lesson content.
- `src/lib/teacher.ts` — client connection to Teacher Luma.
- `supabase/functions/teacher-chat/index.ts` — AI teacher Edge Function.
- `supabase/migrations/` — database migrations.

## Authentication and progress

- Learner authentication uses Supabase Auth.
- Learner progress is cached locally and synchronized to Supabase.
- A learner remains signed in between app launches unless they deliberately sign out in Profile.
- Profile supports choosing app language, support language, learning target, goal, profile image, and teacher voice.
- The app currently supports English and Bangla interface translation. New interface strings should be added to `src/i18n.tsx` rather than hard-coded.

## Teacher Luma

Teacher choices:

- Maya — female teacher voice and violet avatar treatment.
- Leo — male teacher voice and blue avatar treatment.

Teacher behavior:

- Uses the selected real-world speaking scenario.
- Responds to the learner’s meaning before correcting language.
- Gives one useful correction at a time and preserves the intended meaning.
- Can explain vocabulary and answer relevant language questions.
- Uses speech-to-text when supported by the environment.
- Speaks responses using Expo Speech; some native speech features require a custom development build and cannot work fully in Expo Go.
- Does not automatically stop after a fixed number of turns. Learners use **Finish practice** when ready.

AI connection:

- The Edge Function uses the `GROQ_API_KEY` secret configured in Supabase.
- Teacher function name defaults to `teacher-chat` and may be set in `.env` as `EXPO_PUBLIC_TEACHER_FUNCTION_NAME`.
- After editing `supabase/functions/teacher-chat/index.ts`, deploy with:

```bash
npx supabase functions deploy teacher-chat
```

## Speaking scenarios

The app must use the full teacher scenario library from:

`src/data/scenarios.ts`

Do not replace it with the older display-only array in `src/data.ts`.

The app now imports the full catalog correctly. It includes detailed prompts, vocabulary, branches, common mistakes, completion checks, and scenario goals for real-life topics such as introductions, daily routine, food and restaurants, shopping, work, airport and travel, interviews, and more.

## Lessons and curriculum

- Lessons are structured by level and units.
- The current library includes Pre-A1, A1, A2 expansion content, and lesson publishing support through the teacher studio.
- Lessons contain exercises for learning, choosing, listening, sentence building, and speaking.
- Wrong answers become review items; review activity strengthens the learner’s progress profile.
- Course progression unlocks next lessons after mastery.

## Teacher studio

Open on web using:

`http://localhost:8081/?studio=teacher`

Teacher studio capabilities:

- Teacher sign-in.
- Role-based access through the `content_staff` table.
- Create, import, edit, preview, and publish lessons.
- Published content becomes available to learners.

If a signed-in account gets this error:

`This account does not have teacher access.`

the account needs an entry in `content_staff` with the appropriate role in Supabase.

## Database work completed

The project contains migrations for:

- Production learner foundation and cloud learner state.
- Teacher course publishing and content staff access.
- Learning evidence / review tracking.

When new migrations need to be applied:

```bash
npx supabase db push
```

## Current visual design system

### Learner dashboard

- Strong primary continue-learning card.
- Daily practice plan and completion ring.
- Course progress shortcut.
- Maya/Leo teacher practice card.
- Skills summary and a simple route into progress review.

### Speaking hub

- Clear Maya/Leo teacher identity card.
- Recommended speaking scenario as the visual focal point.
- Scenario cards for real-world conversation choices.
- Visible ready status and a clean route into the teacher session.

### Teacher conversation session

- Premium teacher header with avatar and replay action.
- Goal-focused practice context card.
- Distinct teacher and learner message bubbles.
- Separate correction, recommendation, word-help, speech-to-text, and finish-practice controls.

### Lesson player

- Lesson icon, title, duration, and XP context at the top of the exercise.
- Clear progress header.
- Large, touch-friendly answer cards.
- Improved help, listening, sentence-building, speaking, and feedback presentation.

### Learning path

- Course summary card with level, mastered lesson count, and percentage.
- Level selector, unit selection, unlock path, and individual lesson cards.

### Progress and review

- Streak, XP, course progress, and skills summary.
- Working review-focus shortcut into mistake-based review.
- Quick review and lesson revision actions.

## Important setup files

`.env` should contain valid Supabase values and must not be committed:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
EXPO_PUBLIC_TEACHER_FUNCTION_NAME=teacher-chat
```

The `.env` file is in the project root:

`/Users/najmul/Documents/Codex/2026-09-15/https-chatgpt-com-share-6aa92a41-76b4/outputs/lingua-spark/.env`

## Running the app

From the project folder:

```bash
npm start -- --clear
```

Then scan the Expo QR code using Expo Go or open the web URL printed in Terminal.

If port 8081 is in use, Expo can safely use the offered alternative port.

## Native voice limitation

Expo Go can handle much of the app, but full native speech-recognition behavior may require a development build. A development build requires Apple developer credentials for iOS. This was deferred for now.

The app should continue to work with typed input and available speech features in Expo Go / web while native build setup is pending.

## Validation commands

Run these after meaningful app changes:

```bash
npx tsc --noEmit
npx expo export --platform web --output-dir /tmp/luma-web-check
```

Latest design work passed both checks.

## Recommended next product work

1. Complete the Profile and Settings visual redesign.
2. Add real subscription infrastructure: entitlement data model, Stripe/RevenueCat, monthly and annual plans, restore purchases, and store-compliant paywall.
3. Add teacher-studio analytics: lesson completion, average score, dropout point, review patterns, and speaking activity.
4. Expand B1–C2 curriculum with professionally reviewed progression and assessment rules.
5. Add a supported native development build for reliable iOS and Android speech recognition.
6. Add automated tests for lesson progression, review scheduling, subscription entitlement, and teacher response handling.
7. Prepare store assets: icon, screenshots, privacy policy, terms, onboarding copy, support email, and app-store metadata.

## Conversation notes

The user’s central priorities have been:

- Build a commercial-grade language-learning app, not a demo.
- Make Teacher Luma feel like a natural English teacher rather than a generic assistant.
- Support multiple languages across the full interface.
- Give learners persistent login, clear settings, profile images, goals, language choices, and teacher voice choices.
- Make speaking voice, speech-to-text, corrections, scenario variety, lessons, review, progress, and teacher publishing all feel coherent.
- Preserve existing manual changes unless they are broken.
- Prefer a polished, calm, professional mobile design with working controls and no visual chaos.

This document is a detailed project handoff created from the working conversation and codebase context. It is not a byte-for-byte export of the raw chat transcript.
