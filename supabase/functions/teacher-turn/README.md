# Legacy Teacher Luma function

The active app uses `teacher-chat`, which contains the newer scenario, repeated-pattern, recommendation, and goal-completion behavior. Keep this folder only as a record of the earlier implementation; do not deploy it for the current app.

This secure Supabase Edge Function calls Groq from the server. The mobile app never receives the provider key.

Required Supabase secrets:

```sh
supabase secrets set GROQ_API_KEY=your_groq_key
supabase secrets set GROQ_TEACHER_MODEL=openai/gpt-oss-20b
```

Deploy after linking this folder to the same Supabase project used by the app:

```sh
supabase functions deploy teacher-turn
```

The current app should use `EXPO_PUBLIC_TEACHER_FUNCTION_NAME=teacher-chat`.

The function accepts authenticated callers only. The Expo app calls it through `supabase.functions.invoke('teacher-turn')`.
