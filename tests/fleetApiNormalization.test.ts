import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '../src/services/api/client';
import { fleetApi } from '../src/services/api/fleet';

// The fleet plugin marshals Go nil slices as JSON null.
const nullArrayState = {
  generated_at: '2026-10-21T00:00:00Z',
  link: 'http://127.0.0.1:8317',
  flags: { caveman: false, ponytail: false, pxpipe: false },
  providers: null,
  models: null,
  quota: [{ name: 'claude', plan: 'max', stale: true, resources: null }],
  pace: {},
  pxpipe: { scope: null, scope_source: 'config.json' },
  features: null,
};

let getSpy: ReturnType<typeof spyOn> | undefined;

const stubGet = (payload: unknown) => {
  getSpy = spyOn(apiClient, 'get').mockResolvedValue(payload as never);
};

afterEach(() => {
  getSpy?.mockRestore();
  getSpy = undefined;
});

describe('fleet API null-array normalization', () => {
  test('state() turns null arrays into empty arrays', async () => {
    stubGet(nullArrayState);

    const state = await fleetApi.state();

    expect(state.providers).toEqual([]);
    expect(state.models).toEqual([]);
    expect(state.quota[0]?.resources).toEqual([]);
    expect(state.pxpipe.scope).toEqual([]);
  });

  test('state() fills missing nested objects the page dereferences', async () => {
    stubGet({ generated_at: 'x' });

    const state = await fleetApi.state();

    expect(state.quota).toEqual([]);
    expect(state.pxpipe.scope).toEqual([]);
    expect(state.pace).toEqual({});
    expect(state.features.overrides).toEqual({});
  });

  test('state() keeps populated arrays untouched', async () => {
    stubGet({
      ...nullArrayState,
      models: ['gpt-5.4'],
      providers: [{ name: 'codex', kind: 'oauth', disabled: false, models: null }],
      quota: [
        {
          name: 'claude',
          plan: 'max',
          stale: false,
          resources: [{ name: 'weekly', kind: 'tokens', remaining: 1, limit: 2 }],
        },
      ],
    });

    const state = await fleetApi.state();

    expect(state.models).toEqual(['gpt-5.4']);
    expect(state.providers[0]?.models).toEqual([]);
    expect(state.quota[0]?.resources.map((resource) => resource.name)).toEqual(['weekly']);
  });

  test('keys() turns null keys, legacy and grant models into empty arrays', async () => {
    stubGet({ keys: null, legacy: null });
    const empty = await fleetApi.keys();
    expect(empty).toEqual({ keys: [], legacy: [] });

    stubGet({ keys: [{ id: 'a', name: 'a', models: null }], legacy: [] });
    const withGrant = await fleetApi.keys();
    expect(withGrant.keys[0]?.models).toEqual([]);
  });

  test('savings() turns a null per-model map into an empty object', async () => {
    stubGet({
      pxpipe: { saved_chars_by_model: null },
      subagent_context: {},
    });

    const savings = await fleetApi.savings();

    expect(savings.pxpipe.saved_chars_by_model).toEqual({});
  });
});
