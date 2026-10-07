import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('Blogger XML Theme file exists and has valid Blogger tags', () => {
  const path = resolve(__dirname, '../templates/blogger-theme.xml');
  assert.ok(existsSync(path), 'blogger-theme.xml must exist');

  const content = readFileSync(path, 'utf8');
  assert.ok(content.startsWith('<?xml version="1.0" encoding="UTF-8" ?>'));
  assert.ok(content.includes('<b:skin>'), 'Must include <b:skin> for CSS injection');
  assert.ok(content.includes('</b:skin>'));
  assert.ok(content.includes('<b:section id=\'main\''), 'Must include main blog section');
  assert.ok(content.includes('<b:widget id=\'Blog1\''), 'Must include Blog widget');
  assert.ok(content.includes('--color-green: #059669;'), 'Must include Luma green brand color');
  assert.ok(content.includes('--bg-cream: #FAF8F5;'), 'Must include Luma cream background');
});

test('Android Native XML Theme file exists and defines Light & Dark themes', () => {
  const path = resolve(__dirname, '../templates/android-themes.xml');
  assert.ok(existsSync(path), 'android-themes.xml must exist');

  const content = readFileSync(path, 'utf8');
  assert.ok(content.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
  assert.ok(content.includes('<style name="Theme.Luma"'), 'Must define Theme.Luma');
  assert.ok(content.includes('<style name="Theme.Luma.Night"'), 'Must define Theme.Luma.Night');
  assert.ok(content.includes('<style name="Theme.Luma.Splash"'), 'Must define Splash theme');
  assert.ok(content.includes('<color name="luma_green">#059669</color>'), 'Must include primary green');
  assert.ok(content.includes('<color name="luma_cream">#FAF8F5</color>'), 'Must include cream background');
});

test('Blog RSS Feed XML file contains all 8 articles', () => {
  const path = resolve(__dirname, '../templates/blog-feed.xml');
  assert.ok(existsSync(path), 'blog-feed.xml must exist');

  const content = readFileSync(path, 'utf8');
  assert.ok(content.includes('<rss version="2.0"'));
  assert.ok(content.includes('<title>Luma Sparks'));

  const itemCount = (content.match(/<item>/g) || []).length;
  assert.equal(itemCount, 8, 'RSS feed must contain all 8 articles');
});

test('Expo Config Plugin for Android theme exports a function', async () => {
  const path = resolve(__dirname, '../plugins/withAndroidTheme.js');
  assert.ok(existsSync(path), 'withAndroidTheme.js plugin must exist');

  const { default: withAndroidTheme } = await import('../plugins/withAndroidTheme.js');
  assert.equal(typeof withAndroidTheme, 'function');
});
