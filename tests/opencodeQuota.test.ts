import { describe, expect, it } from 'bun:test';
import { normalizeOpenCodeQuota } from '../src/features/quota/opencode';
import type { FleetQuotaProvider } from '../src/services/api/fleet';

const provider = (resources: FleetQuotaProvider['resources']): FleetQuotaProvider => ({
  name: 'opencode',
  plan: 'Go',
  stale: false,
  resources,
});

describe('OpenCode Go quota normalization', () => {
  it('returns unavailable when the proxy has no OpenCode provider', () => {
    expect(normalizeOpenCodeQuota(undefined)).toEqual({
      available: false,
      plan: '',
      stale: false,
      windows: [],
    });
  });

  it('maps the three windows in order and derives remaining percent', () => {
    const quota = normalizeOpenCodeQuota(
      provider([
        {
          name: 'monthly',
          kind: 'consumption',
          remaining: 41,
          limit: 100,
          used_frac: 0.59,
          paced: false,
        },
        {
          name: 'session',
          kind: 'consumption',
          remaining: 76,
          limit: 100,
          used_frac: 0.24,
          paced: false,
          resets_at: '2026-10-19T00:00:00Z',
        },
        {
          name: 'weekly',
          kind: 'consumption',
          remaining: 58,
          limit: 100,
          used_frac: 0.42,
          paced: false,
        },
      ])
    );
    expect(quota.available).toBe(true);
    expect(quota.plan).toBe('Go');
    expect(quota.windows.map((window) => window.key)).toEqual(['session', 'weekly', 'monthly']);
    expect(quota.windows.map((window) => window.remainingPercent)).toEqual([76, 58, 41]);
    expect(quota.windows[0].resetsAt).toBe('2026-10-19T00:00:00Z');
  });

  it('accepts the rolling alias and a used fraction without a limit', () => {
    const quota = normalizeOpenCodeQuota(
      provider([
        {
          name: 'rolling',
          kind: 'consumption',
          remaining: 0,
          limit: 0,
          used_frac: 0.8,
          paced: false,
        },
      ])
    );
    expect(quota.windows[0]).toMatchObject({
      key: 'session',
      remainingPercent: 20,
      usedPercent: 80,
    });
    expect(quota.available).toBe(true);
  });

  it('ignores unknown resources and reports unavailable', () => {
    const quota = normalizeOpenCodeQuota(
      provider([
        {
          name: 'daily',
          kind: 'consumption',
          remaining: 1,
          limit: 2,
          used_frac: 0.5,
          paced: false,
        },
      ])
    );
    expect(quota.available).toBe(false);
    expect(quota.windows).toEqual([]);
  });
});
