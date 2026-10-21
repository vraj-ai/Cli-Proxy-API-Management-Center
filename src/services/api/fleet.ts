import { apiClient } from './client';

export interface FleetProvider {
  name: string;
  kind: string;
  disabled: boolean;
  models: string[];
  detail?: string;
  patch_key?: string;
}

export interface FleetQuotaResource {
  name: string;
  kind: string;
  remaining: number;
  limit: number;
  used_frac: number;
  elapsed_frac?: number;
  paced: boolean;
  resets_at?: string;
}

export interface FleetQuotaProvider {
  name: string;
  plan: string;
  stale: boolean;
  resources: FleetQuotaResource[];
}

export type FleetPolicy = Partial<
  Record<'pxpipe' | 'caveman' | 'ponytail' | 'headroom' | 'rtk', boolean>
>;

export interface FleetState {
  generated_at: string;
  link: string;
  flags: { caveman: boolean; ponytail: boolean; pxpipe: boolean };
  providers: FleetProvider[];
  models: string[];
  quota: FleetQuotaProvider[];
  pace: {
    model?: string;
    tps?: number;
    output_tokens?: number;
    latency_ms?: number;
    at?: string;
    running?: string[];
  };
  pxpipe: {
    proxy_url: string;
    reachable: boolean;
    compressing: boolean;
    scope: string[];
    scope_source: string;
    shim_url: string;
    shim_enabled: boolean;
    shim_up: boolean;
  };
  features: {
    defaults: FleetPolicy;
    overrides: Record<string, FleetPolicy>;
    effective: Record<string, FleetPolicy>;
    tools: Record<
      string,
      { available: boolean; active: boolean; configured: boolean; kind: string; note: string }
    >;
  };
}

export interface FleetGrant {
  id: string;
  name: string;
  prefix: string;
  mode: 'all' | 'list';
  models: string[];
  disabled: boolean;
  created_at: string;
  live: boolean;
  model_count: number;
}

export interface FleetKeysResponse {
  keys: FleetGrant[];
  legacy: Array<{ index: number; prefix: string }>;
}

export interface FleetSavings {
  pxpipe: {
    requests: number;
    compressed: number;
    chars_before: number;
    chars_after: number;
    saved_chars: number;
    saved_pct: number;
    saved_chars_by_model: Record<string, number>;
  };
  subagent_context: {
    events: number;
    bytes_before: number;
    bytes_after: number;
    saved_bytes: number;
    saved_pct: number;
  };
  injections_this_process: number;
  note: string;
}

// The fleet plugin is Go: a nil slice or map marshals as JSON null, and a field it
// never sets is absent. Pages iterate these unguarded, so fix the shape on read.
const obj = <T extends object>(value: T | null | undefined): T => value ?? ({} as T);
const arr = <T>(value: Array<T | null> | null | undefined): T[] =>
  Array.isArray(value) ? value.filter((item): item is T => item != null) : [];
const objects = <T extends object>(value: Array<T | null> | null | undefined): T[] =>
  arr(value).filter((item) => typeof item === 'object');

export function normalizeFleetState(input: FleetState | null): FleetState {
  const raw = obj(input);
  const features = obj(raw.features);
  return {
    ...raw,
    flags: {
      caveman: false,
      ponytail: false,
      pxpipe: false,
      ...obj<Partial<FleetState['flags']>>(raw.flags),
    },
    providers: objects(raw.providers).map((provider) => ({
      ...provider,
      models: arr(provider.models),
    })),
    models: arr(raw.models),
    quota: objects(raw.quota).map((provider) => ({
      ...provider,
      resources: objects(provider.resources),
    })),
    pace: obj(raw.pace),
    pxpipe: { ...obj(raw.pxpipe), scope: arr(raw.pxpipe?.scope) },
    features: {
      ...features,
      defaults: obj(features.defaults),
      overrides: obj(features.overrides),
      effective: obj(features.effective),
      tools: obj(features.tools),
    },
  };
}

export function normalizeFleetKeys(input: FleetKeysResponse | null): FleetKeysResponse {
  const raw = obj(input);
  return {
    keys: objects(raw.keys).map((grant) => ({ ...grant, models: arr(grant.models) })),
    legacy: objects(raw.legacy),
  };
}

const ZERO_PXPIPE_SAVINGS: FleetSavings['pxpipe'] = {
  requests: 0,
  compressed: 0,
  chars_before: 0,
  chars_after: 0,
  saved_chars: 0,
  saved_pct: 0,
  saved_chars_by_model: {},
};

const ZERO_CONTEXT_SAVINGS: FleetSavings['subagent_context'] = {
  events: 0,
  bytes_before: 0,
  bytes_after: 0,
  saved_bytes: 0,
  saved_pct: 0,
};

export function normalizeFleetSavings(input: FleetSavings | null): FleetSavings {
  const raw = obj<Partial<FleetSavings>>(input);
  return {
    injections_this_process: 0,
    note: '',
    ...raw,
    pxpipe: {
      ...ZERO_PXPIPE_SAVINGS,
      ...obj(raw.pxpipe),
      saved_chars_by_model: obj(raw.pxpipe?.saved_chars_by_model),
    },
    subagent_context: { ...ZERO_CONTEXT_SAVINGS, ...obj(raw.subagent_context) },
  };
}

export const fleetApi = {
  state: async () => normalizeFleetState(await apiClient.get<FleetState>('/fleet/state')),
  savings: async () => normalizeFleetSavings(await apiClient.get<FleetSavings>('/fleet/savings')),
  keys: async () => normalizeFleetKeys(await apiClient.get<FleetKeysResponse>('/fleet/keys')),
  createKey: (body: { name: string; mode: 'all' | 'list'; models: string[] }) =>
    apiClient.post<{ key: FleetGrant; secret: string }>('/fleet/keys', body),
  updateKey: (body: {
    id: string;
    name?: string;
    mode?: 'all' | 'list';
    models?: string[];
    disabled?: boolean;
  }) => apiClient.patch<{ key: FleetGrant }>('/fleet/keys', body),
  revokeKey: (id: string) =>
    apiClient.delete<{ revoked: string }>('/fleet/keys', { params: { id } }),
  adoptKey: (body: { index: number; name: string; mode: 'all' | 'list'; models: string[] }) =>
    apiClient.post<{ key: FleetGrant }>('/fleet/keys/adopt', body),
  setScope: (models: string[]) =>
    apiClient.post<{ scope: string[] }>('/fleet/pxpipe/scope', { models }),
  setCompression: (enabled: boolean) =>
    apiClient.post<{ compression_enabled: boolean }>('/fleet/pxpipe/compression', { enabled }),
  setFeature: (model: string, feature: string, enabled: boolean | null) =>
    apiClient.post<{ model: string; feature: string; value: boolean | null }>('/fleet/features', {
      model,
      feature,
      value: enabled,
    }),
};
