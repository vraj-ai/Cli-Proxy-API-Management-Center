const port = Number(Bun.env.FLEET_FIXTURE_PORT ?? 4173);
const absent = Bun.env.FLEET_FIXTURE_MODE === 'absent';
const managementKey = 'fixture-management-key';

const state = {
  generated_at: new Date().toISOString(),
  link: `http://127.0.0.1:${port}`,
  flags: { caveman: true, ponytail: true, pxpipe: true },
  providers: [
    {
      name: 'openai',
      kind: 'oauth',
      disabled: false,
      models: ['gpt-5.4', 'gpt-5.4-mini'],
      detail: 'fixture-account',
    },
    { name: 'anthropic', kind: 'oauth', disabled: false, models: ['claude-opus-4.7'] },
  ],
  models: ['gpt-5.4', 'gpt-5.4-mini', 'claude-opus-4.7', 'gemini-3.1-pro'],
  quota: [
    {
      name: 'openai',
      plan: 'Fixture',
      stale: false,
      resources: [
        {
          name: 'Daily',
          kind: 'requests',
          remaining: 73,
          limit: 100,
          used_frac: 0.27,
          paced: false,
          resets_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      ],
    },
    {
      name: 'anthropic',
      plan: 'Fixture',
      stale: true,
      resources: [
        {
          name: 'Weekly',
          kind: 'requests',
          remaining: 28,
          limit: 100,
          used_frac: 0.72,
          paced: true,
          elapsed_frac: 0.45,
        },
      ],
    },
  ],
  pace: {
    model: 'gpt-5.4',
    tps: 42.7,
    output_tokens: 128,
    latency_ms: 2995,
    at: new Date().toISOString(),
    running: [] as string[],
  },
  pxpipe: {
    proxy_url: `http://127.0.0.1:${port}/pxpipe`,
    reachable: true,
    compressing: true,
    scope: ['gpt-5.4', 'claude-opus-4.7'],
    scope_source: 'config.json',
    shim_url: '',
    shim_enabled: true,
    shim_up: true,
  },
  features: {
    defaults: { pxpipe: true, caveman: true, ponytail: true, headroom: true, rtk: false },
    overrides: {} as Record<string, unknown>,
    effective: {} as Record<string, unknown>,
    tools: {
      headroom: {
        available: true,
        active: true,
        configured: true,
        kind: 'client',
        note: 'Enabled for fixture clients',
      },
      rtk: {
        available: true,
        active: false,
        configured: false,
        kind: 'client',
        note: 'Not configured',
      },
    },
  },
};

let keys = [
  {
    id: 'k_fixture_01',
    name: 'Local app',
    prefix: 'sk-flt-fi…1234',
    mode: 'list' as const,
    models: ['gpt-5.4'],
    disabled: false,
    created_at: '2026-10-01T12:00:00Z',
    live: true,
    model_count: 1,
  },
];
let legacy = [{ index: 0, prefix: 'sk-fixtu…4321' }];
let keyIndex = 2;
let fleetPluginConfig: Record<string, unknown> = { client_tools: { headroom: true, rtk: false } };

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: pluginHeaders });
const pluginHeaders = new Headers({
  'x-cpa-support-plugin': 'true',
  'x-cpa-version': 'fixture',
  'content-type': 'application/json',
});

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v0/management/')) {
      if (request.headers.get('authorization') !== `Bearer ${managementKey}`)
        return json({ error: 'unauthorized' }, 401);
      const path = url.pathname.slice('/v0/management'.length);
      if (path === '/config') return json({ 'request-log': true, 'api-keys': [] });
      if (path === '/plugins')
        return json({
          plugins_enabled: true,
          plugins_dir: 'plugins',
          plugins: [
            {
              id: 'fleet',
              configured: true,
              registered: true,
              enabled: true,
              effective_enabled: true,
              supports_oauth: false,
              path: '',
              config_fields: [
                { name: 'client_tools', type: 'object', description: 'Client tool toggles' },
              ],
              menus: [
                { path: '/hub', menu: 'Fleet Hub', description: '' },
                { path: '/keys', menu: 'Fleet Keys', description: '' },
                { path: '/savings', menu: 'Fleet Savings', description: '' },
                { path: '/router', menu: 'Fleet Router', description: '' },
              ],
              metadata: {
                name: 'Fleet',
                version: 'fixture',
                author: 'local',
                github_repository: '',
                logo: '',
                config_fields: [],
              },
            },
            {
              id: 'fixture-metrics',
              configured: true,
              registered: true,
              enabled: true,
              effective_enabled: true,
              supports_oauth: false,
              path: '',
              config_fields: [],
              menus: [
                {
                  path: `http://127.0.0.1:${port}/fixture-resource.html`,
                  menu: 'Fixture metrics',
                  description: 'Third-party resource fixture',
                },
              ],
              metadata: {
                name: 'Fixture metrics',
                version: '1.0',
                author: 'local',
                github_repository: '',
                logo: '',
                config_fields: [],
              },
            },
          ],
        });
      if (path === '/plugins/fixture-metrics/config') return json({});
      if (path === '/plugins/fleet/config' && request.method === 'GET')
        return json(fleetPluginConfig);
      if (path === '/plugins/fleet/config' && request.method === 'PATCH') {
        const body = (await request.json()) as { client_tools?: Record<string, boolean> };
        fleetPluginConfig = { ...fleetPluginConfig, ...body };
        for (const feature of ['headroom', 'rtk'] as const) {
          const enabled = body.client_tools?.[feature];
          if (enabled !== undefined) state.features.tools[feature].active = enabled;
        }
        return json(fleetPluginConfig);
      }
      if (path === '/auth-files') return json({ files: [] });
      if (path === '/auth-files/status') return json({});
      if (path === '/models') return json({ data: [] });
      if (path === '/quota') return json({});
      if (path === '/logs') return json({ logs: [] });
      if (path === '/system') return json({});
      if (path === '/api-keys') return json({ 'api-keys': ['sk-fixture-legacy-4321'] });
      if (
        path === '/fleet/state' ||
        path === '/fleet/savings' ||
        path.startsWith('/fleet/keys') ||
        path.startsWith('/fleet/features') ||
        path.startsWith('/fleet/pxpipe/')
      ) {
        if (absent) return json({ error: 'fleet unavailable' }, 404);
        if (path === '/fleet/state') return json(state);
        if (path === '/fleet/savings')
          return json({
            pxpipe: {
              requests: 86,
              compressed: 74,
              chars_before: 259000,
              chars_after: 189000,
              saved_chars: 70000,
              saved_pct: 27.0,
              saved_chars_by_model: { 'gpt-5.4': 44000, 'claude-opus-4.7': 26000 },
            },
            subagent_context: {
              events: 17,
              bytes_before: 125000,
              bytes_after: 89000,
              saved_bytes: 36000,
              saved_pct: 28.8,
            },
            injections_this_process: 22,
            note: 'Character and byte reductions are not token or dollar savings. Injection counts do not measure model compliance.',
          });
        if (path === '/fleet/keys' && request.method === 'GET') return json({ keys, legacy });
        if (path === '/fleet/keys' && request.method === 'POST') {
          const body = (await request.json()) as {
            name?: string;
            mode?: 'all' | 'list';
            models?: string[];
          };
          const secret = `sk-flt-fixture-${String(keyIndex).padStart(4, '0')}`;
          const key = {
            id: `k_fixture_${String(keyIndex++).padStart(2, '0')}`,
            name: body.name || 'Fixture key',
            prefix: 'sk-flt-fi…0000',
            mode: body.mode || 'all',
            models: body.models || [],
            disabled: false,
            created_at: new Date().toISOString(),
            live: true,
            model_count: body.models?.length ?? state.models.length,
          };
          keys = [...keys, key];
          return json({ key, secret });
        }
        if (path === '/fleet/keys' && request.method === 'PATCH') {
          const body = (await request.json()) as {
            id: string;
            name?: string;
            mode?: 'all' | 'list';
            models?: string[];
            disabled?: boolean;
          };
          keys = keys.map((key) =>
            key.id === body.id
              ? { ...key, ...body, model_count: body.models?.length ?? key.model_count }
              : key
          );
          return json({ key: keys.find((key) => key.id === body.id) });
        }
        if (path === '/fleet/keys' && request.method === 'DELETE') {
          const id = url.searchParams.get('id') || '';
          keys = keys.filter((key) => key.id !== id);
          return json({ revoked: id });
        }
        if (path === '/fleet/keys/adopt' && request.method === 'POST') {
          const body = (await request.json()) as {
            index: number;
            name: string;
            mode: 'all' | 'list';
            models: string[];
          };
          const key = {
            id: `k_fixture_${String(keyIndex++).padStart(2, '0')}`,
            name: body.name,
            prefix: legacy[body.index]?.prefix || 'sk-…',
            mode: body.mode,
            models: body.models || [],
            disabled: false,
            created_at: new Date().toISOString(),
            live: true,
            model_count: body.models?.length ?? state.models.length,
          };
          keys = [...keys, key];
          legacy = legacy.filter((entry) => entry.index !== body.index);
          return json({ key });
        }
        if (path === '/fleet/pxpipe/scope' && request.method === 'POST') {
          const body = (await request.json()) as { models: string[] };
          state.pxpipe.scope = body.models;
          return json({ scope: body.models });
        }
        if (path === '/fleet/features' && request.method === 'POST') {
          const body = (await request.json()) as {
            model: string;
            feature: string;
            value: boolean | null;
          };
          state.features.effective[body.model] = {
            ...((state.features.effective[body.model] as Record<string, boolean>) || {}),
            [body.feature]: body.value ?? false,
          };
          return json({ model: body.model, feature: body.feature, value: body.value });
        }
        if (path === '/fleet/pxpipe/compression') {
          const body = (await request.json()) as { enabled: boolean };
          state.pxpipe.compressing = body.enabled;
          return json({ compression_enabled: body.enabled });
        }
      }
      return json({});
    }

    if (url.pathname === '/v1/models') return json({ data: state.models.map((id) => ({ id })) });
    if (url.pathname === '/api-key-usage') return json({});
    if (url.pathname === '/fixture-resource.html')
      return new Response(
        '<!doctype html><html><body><h1>Fixture metrics resource</h1></body></html>',
        { headers: { 'content-type': 'text/html', 'x-cpa-support-plugin': 'true' } }
      );
    if (url.pathname === '/pxpipe' || url.pathname === '/pxpipe/')
      return new Response(
        '<!doctype html><html><body>Local pxpipe dashboard fixture</body></html>',
        { headers: { 'content-type': 'text/html' } }
      );
    if (url.pathname === '/' || url.pathname.endsWith('.html') || !url.pathname.includes('.')) {
      const file = Bun.file('./dist/index.html');
      if (await file.exists())
        return new Response(file, {
          headers: {
            ...Object.fromEntries(pluginHeaders),
            'content-type': 'text/html; charset=utf-8',
          },
        });
      return new Response('Run bun run build before starting the fixture server.', { status: 503 });
    }
    return new Response('Not found', { status: 404 });
  },
});

console.log(
  `Fleet fixture ready at http://127.0.0.1:${port}; Fleet mode: ${absent ? 'absent' : 'present'}`
);
console.log(
  `Login with URL http://127.0.0.1:${port} and key ${managementKey}. No provider API calls are implemented.`
);
