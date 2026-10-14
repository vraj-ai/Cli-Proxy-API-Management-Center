import { describe, expect, it } from 'bun:test';
import { resolveLoginRedirect } from '../src/pages/loginRedirect';

describe('resolveLoginRedirect', () => {
  it('defaults to / when no redirect state exists', () => {
    expect(resolveLoginRedirect(null)).toBe('/');
    expect(resolveLoginRedirect(undefined)).toBe('/');
    expect(resolveLoginRedirect({})).toBe('/');
    expect(resolveLoginRedirect({ from: {} })).toBe('/');
  });

  it('returns the stored pathname', () => {
    expect(resolveLoginRedirect({ from: { pathname: '/fleet' } })).toBe('/fleet');
  });

  it('preserves the search portion so deep links keep their tab (fleet#175 F1)', () => {
    expect(
      resolveLoginRedirect({ from: { pathname: '/fleet/access', search: '?tab=models' } })
    ).toBe('/fleet/access?tab=models');
  });

  it('does not append a stray ? for searchless targets', () => {
    expect(resolveLoginRedirect({ from: { pathname: '/config', search: '' } })).toBe('/config');
  });
});
