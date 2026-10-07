import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('publishing protects drafts, rejects learners, and preserves live revisions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202609250001_course_publishing.sql', import.meta.url), 'utf8'));
    await db.exec(`insert into public.content_staff values ('00000000-0000-0000-0000-000000000001','teacher',now());
      set role authenticated;
      set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
      insert into public.courses values ('english','English','English');
      insert into public.course_units values ('a1-1','english','A1','First steps',1);`);
    const lesson = { title: 'Greetings', subtitle: 'Introduce yourself', emoji: '👋', color: '#176B4D', duration: 8, xp: 60, exercises: [{ id: 'one', type: 'choice', prompt: 'Say hello', options: ['Hello', 'Goodbye'], answer: 'Hello' }] };
    await db.query('insert into public.lesson_drafts(id,unit_id,content) values (1,$1,$2)', ['a1-1', JSON.stringify(lesson)]);
    await db.exec('select public.publish_lesson(1,1)');
    await db.query("update public.lesson_drafts set content = jsonb_set(content, '{title}', $1) where id = 1", [JSON.stringify('New draft')]);
    assert.equal((await db.query("select content->>'title' as title from public.published_lessons")).rows[0].title, 'Greetings');
    await assert.rejects(db.exec('select public.publish_lesson(1,1)'), /Draft changed/);
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'`);
    assert.equal((await db.query('select * from public.lesson_drafts')).rows.length, 0);
    assert.equal((await db.query('select * from public.content_staff')).rows.length, 0);
    await assert.rejects(db.exec('select public.publish_lesson(1,2)'), /Teacher access required/);
    await assert.rejects(db.exec("insert into public.content_staff(user_id,role) values(auth.uid(),'admin')"), /permission denied/);
    await assert.rejects(db.exec("update public.published_lessons set active=false"), /permission denied/);
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'`);
    assert.equal((await db.query("update public.lesson_drafts set content=content where id=1 and revision=1 returning id")).rows.length, 0);
    await db.exec('select public.publish_lesson(1,2)');
    await assert.rejects(db.exec('select public.unpublish_lesson(1,1)'), /Published version changed/);
    await db.exec('select public.unpublish_lesson(1,2)');
    assert.equal((await db.query('select active from public.published_lessons')).rows[0].active, false);
    assert.equal((await db.query('select * from public.lesson_publication_history')).rows.length, 3);
    const invalid = { ...lesson, exercises: [{ id: 'bad', type: 'choice', prompt: 'Question', answer: 'Missing', options: ['Other'] }] };
    await db.query('update public.lesson_drafts set content=$1 where id=1', [JSON.stringify(invalid)]);
    await assert.rejects(db.exec('select public.publish_lesson(1,3)'), /Answer must match a choice/);
    assert.equal((await db.query('select active from public.published_lessons')).rows[0].active, false);
  } finally { await db.close(); }
});
