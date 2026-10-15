import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  collectPluginResourceEntries,
  resolveLegacyFleetRoute,
  resolvePluginResourceRoute,
} from '../src/features/plugins/pluginResources';
import { isLegacyCpaRouterModel } from '../src/services/api/models';
import type { PluginListEntry } from '../src/types';
import { parseModelGrantRules } from '../src/features/fleet/grants';

const plugin = (id: string, paths: string[]): PluginListEntry => ({
  id,
  path: '',
  configured: true,
  registered: true,
  enabled: true,
  effectiveEnabled: true,
  supportsOAuth: false,
  logo: '',
  configFields: [],
  menus: paths.map((path) => ({ path, menu: path, description: '' })),
  metadata: null,
});

describe('Fleet plugin route adoption', () => {
  it('maps legacy Fleet menus into native Fleet hash routes', () => {
    const [overview, access, activity] = collectPluginResourceEntries([
      plugin('fleet', ['/hub', '/keys', '/savings']),
    ]);

    expect([overview?.route, access?.route, activity?.route]).toEqual([
      '/fleet',
      '/fleet/access',
      '/fleet/activity',
    ]);
  });

  it('keeps third-party plugin resources on their resource route', () => {
    const [resource] = collectPluginResourceEntries([plugin('metrics', ['/overview'])]);

    expect(resource?.route).toBe('/plugin-pages/metrics/0');
  });

  it('redirects bookmarked Fleet plugin pages to their native sections', () => {
    expect(resolveLegacyFleetRoute('fleet', 0)).toBe('/fleet');
    expect(resolveLegacyFleetRoute('fleet', 1)).toBe('/fleet/access');
    expect(resolveLegacyFleetRoute('fleet', 2)).toBe('/fleet/activity');
    expect(resolveLegacyFleetRoute('fleet', 3)).toBe('/fleet');
    expect(resolveLegacyFleetRoute('metrics', 0)).toBeNull();
  });

  it('adopts every legacy Fleet resource path the backend emits', () => {
    // Mirrors the legacy hash routes served by the Fleet plugin hub page:
    // /keys, /models, /activity, /providers, /console plus the registered menus
    // /hub, /savings and /router.
    expect(resolvePluginResourceRoute('fleet', '/hub', 0)).toBe('/fleet');
    expect(resolvePluginResourceRoute('fleet', '/', 0)).toBe('/fleet');
    expect(resolvePluginResourceRoute('fleet', '/keys', 1)).toBe('/fleet/access');
    expect(resolvePluginResourceRoute('fleet', '/models', 1)).toBe('/fleet/access?tab=models');
    expect(resolvePluginResourceRoute('fleet', '/savings', 2)).toBe('/fleet/activity');
    expect(resolvePluginResourceRoute('fleet', '/activity', 2)).toBe('/fleet/activity');
    expect(resolvePluginResourceRoute('fleet', '/router', 3)).toBe('/fleet');
    expect(resolvePluginResourceRoute('fleet', '/providers', 0)).toBe('/ai-providers');
    expect(resolvePluginResourceRoute('fleet', '/console', 0)).toBe('/config');
    expect(resolvePluginResourceRoute('fleet', '/unknown', 9)).toBe('/plugin-pages/fleet/9');
  });

  it('never surfaces the retired cpa router model in normalized lists', () => {
    expect(isLegacyCpaRouterModel('cpa router')).toBe(true);
    expect(isLegacyCpaRouterModel(' CPA ROUTER ')).toBe(true);
    expect(isLegacyCpaRouterModel('gpt-5.4')).toBe(false);

    const source = readFileSync(
      new URL('../src/services/api/models.ts', import.meta.url),
      'utf8'
    );
    expect(source.match(/return normalizeModelList\(/g) ?? []).toHaveLength(0);
  });

  it('ships a Fleet-branded document title', () => {
    const source = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
    expect(source).toContain("document.title = 'Fleet'");
    expect(source).not.toContain('Management Center');
  });

  it('keeps exact and prefix grants while merging catalog picks without duplicates', () => {
    expect(parseModelGrantRules('openai/\nclaude-opus-4.7, openai/', ['gpt-5.4'])).toEqual([
      'gpt-5.4',
      'openai/',
      'claude-opus-4.7',
    ]);
  });

  it('keeps Fleet labels aligned across all supported locales', () => {
    const locales = ['en', 'zh-CN', 'zh-TW', 'ru'].map(
      (locale) =>
        JSON.parse(
          readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
        ) as {
          fleet: Record<string, string>;
        }
    );
    const expectedKeys = Object.keys(locales[0].fleet).sort();
    for (const locale of locales.slice(1)) {
      expect(Object.keys(locale.fleet).sort()).toEqual(expectedKeys);
    }
  });
});
