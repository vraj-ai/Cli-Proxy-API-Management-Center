import { describe, expect, test } from 'bun:test';
import {
  cooldownRemainingSeconds,
  isDevinLoginBlocked,
  MAX_DEVIN_COOLDOWN_SECONDS,
  parseDevinCooldownSeconds,
  parseRetryAfterSeconds,
} from '@/pages/devinCooldown';

const NOW = 1_800_000_000_000;

describe('parseRetryAfterSeconds', () => {
  test('accepts delay seconds as a number or string', () => {
    expect(parseRetryAfterSeconds(120, NOW)).toBe(120);
    expect(parseRetryAfterSeconds('120', NOW)).toBe(120);
  });

  test('accepts an HTTP date relative to now', () => {
    const at = new Date(NOW + 1740 * 1000).toUTCString();
    const seconds = parseRetryAfterSeconds(at, NOW);
    expect(seconds).toBeGreaterThanOrEqual(1739);
    expect(seconds).toBeLessThanOrEqual(1740);
  });

  test('rejects past dates, non-positive and unbounded values', () => {
    expect(parseRetryAfterSeconds(new Date(NOW - 1000).toUTCString(), NOW)).toBeUndefined();
    expect(parseRetryAfterSeconds(0, NOW)).toBeUndefined();
    expect(parseRetryAfterSeconds(-5, NOW)).toBeUndefined();
    expect(parseRetryAfterSeconds(MAX_DEVIN_COOLDOWN_SECONDS + 1, NOW)).toBeUndefined();
    expect(parseRetryAfterSeconds('soon', NOW)).toBeUndefined();
    expect(parseRetryAfterSeconds(undefined, NOW)).toBeUndefined();
  });
});

describe('parseDevinCooldownSeconds', () => {
  test('prefers the Retry-After header', () => {
    const err = Object.assign(new Error('Too many requests'), {
      status: 429,
      headers: { 'Retry-After': '1740' },
    });
    expect(parseDevinCooldownSeconds(err, NOW)).toBe(1740);
  });

  test('reads case-insensitive headers and getter-style header bags', () => {
    const plain = Object.assign(new Error('Limited'), {
      headers: { 'retry-after': '60' },
    });
    expect(parseDevinCooldownSeconds(plain, NOW)).toBe(60);
    const bag = Object.assign(new Error('Limited'), {
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? '90' : undefined),
      },
    });
    expect(parseDevinCooldownSeconds(bag, NOW)).toBe(90);
  });

  test('falls back to body retry fields', () => {
    for (const body of [{ retry_after: 120 }, { retryAfter: '120' }]) {
      const err = Object.assign(new Error('Limited'), { details: body, data: body });
      expect(parseDevinCooldownSeconds(err, NOW)).toBe(120);
    }
  });

  test('recognizes narrow provider retry phrases', () => {
    expect(parseDevinCooldownSeconds('IP banned, try again in 29 minutes', NOW)).toBe(1740);
    expect(parseDevinCooldownSeconds('try in 29 mins', NOW)).toBe(1740);
    expect(parseDevinCooldownSeconds('Retry in 2 hours', NOW)).toBe(7200);
    expect(parseDevinCooldownSeconds('try again in 45 secs', NOW)).toBe(45);
  });

  test('never invents a timer from an undated error', () => {
    expect(parseDevinCooldownSeconds(Object.assign(new Error('IP banned')), NOW)).toBeUndefined();
    expect(parseDevinCooldownSeconds(Object.assign(new Error('try again later')), NOW)).toBeUndefined();
    expect(parseDevinCooldownSeconds(undefined, NOW)).toBeUndefined();
    expect(parseDevinCooldownSeconds(null, NOW)).toBeUndefined();
  });
});

describe('cooldown expiry and manual-only retry', () => {
  test('remaining seconds clamp at zero once expired', () => {
    expect(cooldownRemainingSeconds(undefined, NOW)).toBe(0);
    expect(cooldownRemainingSeconds(NOW + 61_000, NOW)).toBe(61);
    expect(cooldownRemainingSeconds(NOW - 1000, NOW)).toBe(0);
  });

  test('login start stays blocked for an open session or live cooldown only', () => {
    expect(isDevinLoginBlocked(undefined, NOW)).toBe(false);
    expect(isDevinLoginBlocked({}, NOW)).toBe(false);
    expect(isDevinLoginBlocked({ state: 'abc' }, NOW)).toBe(true);
    expect(isDevinLoginBlocked({ cooldownUntil: NOW + 60_000 }, NOW)).toBe(true);
    // Expired cooldowns unblock: the next attempt still needs a user click.
    expect(isDevinLoginBlocked({ cooldownUntil: NOW - 1000 }, NOW)).toBe(false);
  });
});
