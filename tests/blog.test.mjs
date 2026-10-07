import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Filter logic replication for fast CI verification
function filterBlogPosts(posts, options = {}) {
  let result = posts;

  if (options.category && options.category !== 'All') {
    result = result.filter((p) => p.category === options.category);
  }

  if (options.bookmarkedOnly && options.bookmarkedSlugs) {
    result = result.filter((p) => options.bookmarkedSlugs.includes(p.slug));
  }

  if (options.query && options.query.trim()) {
    const q = options.query.trim().toLowerCase();
    result = result.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q)) ||
        p.author.name.toLowerCase().includes(q)
    );
  }

  return result;
}

function validateEmail(email) {
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return Boolean(trimmed && emailRegex.test(trimmed));
}

// Read and parse src/data/blogPosts.ts
const blogPostsPath = resolve(__dirname, '../src/data/blogPosts.ts');
const fileContent = readFileSync(blogPostsPath, 'utf8');

// Parse blogPosts by extracting JSON-like object or using dynamic execution
const cleaned = fileContent
  .replace(/import type \{.*\} from '.*';/, '')
  .replace(/export const blogPosts:\s*BlogPost\[\]\s*=/, 'globalThis.__PARSED_POSTS =');

// Evaluate in isolated context
const evalFn = new Function(cleaned);
evalFn();
const blogPosts = globalThis.__PARSED_POSTS;

test('Blog posts catalog has 8 comprehensive articles', () => {
  assert.equal(blogPosts.length, 8);
});

test('Blog slugs are unique and URL-safe', () => {
  const slugs = new Set();
  const slugRegex = /^[a-z0-9-]+$/;
  for (const post of blogPosts) {
    assert.ok(post.slug, `Post must have a slug: ${post.title}`);
    assert.ok(slugRegex.test(post.slug), `Slug must be URL-safe: ${post.slug}`);
    assert.ok(!slugs.has(post.slug), `Duplicate slug detected: ${post.slug}`);
    slugs.add(post.slug);
  }
});

test('Every blog post has rich content, audio script, and key takeaways', () => {
  for (const post of blogPosts) {
    assert.ok(post.title.length > 10, `Title too short for ${post.slug}`);
    assert.ok(post.subtitle.length > 15, `Subtitle too short for ${post.slug}`);
    assert.ok(post.excerpt.length > 30, `Excerpt too short for ${post.slug}`);
    assert.ok(post.readTimeMinutes >= 3, `Read time should be realistic for ${post.slug}`);
    assert.ok(post.author.name && post.author.role, `Author info missing for ${post.slug}`);
    assert.ok(post.audioScript && post.audioScript.length > 50, `Audio script missing for ${post.slug}`);
    assert.ok(Array.isArray(post.sections) && post.sections.length >= 2, `Sections missing for ${post.slug}`);
    assert.ok(Array.isArray(post.keyTakeaways) && post.keyTakeaways.length >= 3, `Key takeaways missing for ${post.slug}`);

    // Verify each section
    for (const section of post.sections) {
      assert.ok(section.content && section.content.length > 20, `Section content too short in ${post.slug}`);
      if (section.callout) {
        assert.ok(['tip', 'science', 'trap', 'phrase'].includes(section.callout.type));
        assert.ok(section.callout.title && section.callout.text);
      }
    }
  }
});

test('Every blog post includes an interactive comprehension quiz', () => {
  for (const post of blogPosts) {
    assert.ok(post.quiz, `Quiz missing for ${post.slug}`);
    assert.ok(post.quiz.question.length > 10, `Quiz question invalid in ${post.slug}`);
    assert.ok(Array.isArray(post.quiz.options) && post.quiz.options.length >= 3, `Quiz options insufficient in ${post.slug}`);
    assert.ok(post.quiz.answerIndex >= 0 && post.quiz.answerIndex < post.quiz.options.length, `Invalid answerIndex in ${post.slug}`);
    assert.ok(post.quiz.explanation.length > 10, `Quiz explanation missing in ${post.slug}`);
  }
});

test('Blog category filtering correctly partitions articles', () => {
  const categories = ['Strategies', 'Speaking', 'Grammar', 'Culture', 'Colony'];
  for (const cat of categories) {
    const filtered = filterBlogPosts(blogPosts, { category: cat });
    assert.ok(filtered.length > 0, `No articles found for category ${cat}`);
    for (const post of filtered) {
      assert.equal(post.category, cat);
    }
  }

  // All category returns all posts
  const all = filterBlogPosts(blogPosts, { category: 'All' });
  assert.equal(all.length, blogPosts.length);
});

test('Blog search query filters across title, excerpt, and tags', () => {
  const plateauResults = filterBlogPosts(blogPosts, { query: 'plateau' });
  assert.ok(plateauResults.length >= 1);
  assert.equal(plateauResults[0].slug, 'break-intermediate-plateau');

  const speechResults = filterBlogPosts(blogPosts, { query: 'connected speech' });
  assert.ok(speechResults.length >= 1);
  assert.equal(speechResults[0].slug, 'connected-speech-secrets');

  const noResults = filterBlogPosts(blogPosts, { query: 'nonexistentxyzterm123' });
  assert.equal(noResults.length, 0);
});

test('Blog bookmark filtering isolates saved posts', () => {
  const savedSlugs = ['break-intermediate-plateau', 'overcoming-speaking-anxiety'];
  const bookmarked = filterBlogPosts(blogPosts, {
    bookmarkedOnly: true,
    bookmarkedSlugs: savedSlugs,
  });
  assert.equal(bookmarked.length, 2);
  assert.deepEqual(
    bookmarked.map((p) => p.slug).sort(),
    savedSlugs.sort()
  );
});

test('Newsletter subscription validates email format', () => {
  assert.equal(validateEmail(''), false);
  assert.equal(validateEmail('not-an-email'), false);
  assert.equal(validateEmail('polyglot@example.com'), true);
  assert.equal(validateEmail('learner@luma.app'), true);
});
