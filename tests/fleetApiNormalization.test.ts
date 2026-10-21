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
  test('state() defaults flags so the page can index every flag', async () => {
    stubGet({ ...nullArrayState, flags: null });
    expect((await fleetApi.state()).flags).toEqual({
      caveman: false,
      ponytail: false,
      pxpipe: false,
    });

    stubGet({ ...nullArrayState, flags: { caveman: true } });
    expect((await fleetApi.state()).flags).toEqual({
      caveman: true,
      ponytail: false,
      pxpipe: false,
    });
  });

  test('state() survives a null body and null elements inside arrays', async () => {
    stubGet(null);
    const empty = await fleetApi.state();
    expect(empty.providers).toEqual([]);
    expect(empty.flags.pxpipe).toBe(false);

    stubGet({
      ...nullArrayState,
      providers: [
        null,
        { name: 'codex', kind: 'oauth', disabled: false, models: [null, 'gpt-5.4'] },
      ],
      quota: [null, { name: 'claude', plan: 'max', stale: false, resources: [null] }],
    });
    const state = await fleetApi.state();
    expect(state.providers.map((provider) => provider.name)).toEqual(['codex']);
    expect(state.providers[0]?.models).toEqual(['gpt-5.4']);
    expect(state.quota.map((provider) => provider.name)).toEqual(['claude']);
    expect(state.quota[0]?.resources).toEqual([]);
  });

  test('keys() survives a null body and null elements', async () => {
    stubGet(null);
    expect(await fleetApi.keys()).toEqual({ keys: [], legacy: [] });

    stubGet({
      keys: [null, { id: 'a', models: ['m'] }],
      legacy: [null, { index: 1, prefix: 'sk-' }],
    });
    const keys = await fleetApi.keys();
    expect(keys.keys.map((grant) => grant.id)).toEqual(['a']);
    expect(keys.legacy).toEqual([{ index: 1, prefix: 'sk-' }]);
  });

  test('savings() zero-fills every metric the page formats', async () => {
    const zeroPxpipe = {
      requests: 0,
      compressed: 0,
      chars_before: 0,
      chars_after: 0,
      saved_chars: 0,
      saved_pct: 0,
      saved_chars_by_model: {},
    };
    const zeroContext = {
      events: 0,
      bytes_before: 0,
      bytes_after: 0,
      saved_bytes: 0,
      saved_pct: 0,
    };

    stubGet({ pxpipe: null, subagent_context: null });
    expect(await fleetApi.savings()).toEqual({
      pxpipe: zeroPxpipe,
      subagent_context: zeroContext,
      injections_this_process: 0,
      note: '',
    });

    stubGet(null);
    expect((await fleetApi.savings()).subagent_context).toEqual(zeroContext);

    stubGet({ pxpipe: { requests: 7, saved_pct: 12.5 }, subagent_context: { events: 3 } });
    const partial = await fleetApi.savings();
    expect(partial.pxpipe).toEqual({ ...zeroPxpipe, requests: 7, saved_pct: 12.5 });
    expect(partial.subagent_context).toEqual({ ...zeroContext, events: 3 });
  });
});
