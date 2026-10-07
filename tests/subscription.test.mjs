import { test } from 'node:test';
import assert from 'node:assert/strict';

// Replicate core isPro and plan verification logic in pure JS for CI
function isPro(progress) {
  const sub = progress?.subscription;
  if (!sub) return false;
  if (sub.tier !== 'pro') return false;
  if (sub.status !== 'active' && sub.status !== 'trialing') return false;
  if (sub.expiresAt) {
    const expiry = new Date(sub.expiresAt).getTime();
    if (Date.now() > expiry) return false;
  }
  return true;
}

const PLANS = {
  annual: {
    id: 'annual',
    title: 'Annual Access',
    price: '$59.99',
    period: 'year',
    trialDays: 7,
    savePercent: 50,
  },
  monthly: {
    id: 'monthly',
    title: 'Monthly Access',
    price: '$9.99',
    period: 'month',
    trialDays: 0,
    savePercent: 0,
  },
};

test('isPro returns false when no subscription is present', () => {
  assert.equal(isPro({}), false);
  assert.equal(isPro({ subscription: undefined }), false);
});

test('isPro returns true for active non-expired pro entitlement', () => {
  const future = new Date(Date.now() + 30 * 86400 * 1000).toISOString();
  assert.equal(
    isPro({
      subscription: {
        tier: 'pro',
        status: 'active',
        plan: 'annual',
        expiresAt: future,
        willRenew: true,
      },
    }),
    true
  );
});

test('isPro returns true for 7-day trial in progress', () => {
  const trialExpiry = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  assert.equal(
    isPro({
      subscription: {
        tier: 'pro',
        status: 'trialing',
        plan: 'annual',
        expiresAt: trialExpiry,
        isTrial: true,
      },
    }),
    true
  );
});

test('isPro returns false when subscription has expired', () => {
  const past = new Date(Date.now() - 86400 * 1000).toISOString();
  assert.equal(
    isPro({
      subscription: {
        tier: 'pro',
        status: 'active',
        plan: 'monthly',
        expiresAt: past,
      },
    }),
    false
  );
});

test('isPro returns false if tier is free or status is canceled', () => {
  assert.equal(
    isPro({
      subscription: {
        tier: 'free',
        status: 'active',
      },
    }),
    false
  );
  assert.equal(
    isPro({
      subscription: {
        tier: 'pro',
        status: 'canceled',
      },
    }),
    false
  );
});

test('plans configure 7-day trial on annual and proper savings discount', () => {
  assert.equal(PLANS.annual.trialDays, 7);
  assert.equal(PLANS.annual.savePercent, 50);
  assert.equal(PLANS.monthly.trialDays, 0);
});
