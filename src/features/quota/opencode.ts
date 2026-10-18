import type { FleetQuotaProvider, FleetQuotaResource } from '@/services/api/fleet';

export type OpenCodeWindowKey = 'session' | 'weekly' | 'monthly';

export interface OpenCodeWindow {
  key: OpenCodeWindowKey;
  /** Percent still available, 0-100. */
  remainingPercent: number | null;
  /** Percent used, 0-100. */
  usedPercent: number | null;
  resetsAt?: string;
}

export interface OpenCodeQuota {
  available: boolean;
  plan: string;
  stale: boolean;
  windows: OpenCodeWindow[];
}

const WINDOW_KEYS: OpenCodeWindowKey[] = ['session', 'weekly', 'monthly'];

const RESOURCE_ALIASES: Record<OpenCodeWindowKey, string[]> = {
  session: ['session', 'rolling', 'fivehour', 'five_hour'],
  weekly: ['weekly', 'week'],
  monthly: ['monthly', 'month'],
};

const findWindow = (
  resources: FleetQuotaResource[],
  key: OpenCodeWindowKey
): FleetQuotaResource | undefined => {
  const aliases = RESOURCE_ALIASES[key];
  return resources.find((resource) => aliases.includes(resource.name.toLowerCase()));
};

const percentLeft = (
  resource: FleetQuotaResource
): { left: number | null; used: number | null } => {
  if (Number.isFinite(resource.limit) && resource.limit > 0) {
    const used = Number.isFinite(resource.used_frac) ? resource.used_frac * 100 : 0;
    return { left: Math.max(0, Math.min(100, 100 - used)), used: Math.max(0, Math.min(100, used)) };
  }
  if (Number.isFinite(resource.used_frac)) {
    const used = Math.max(0, Math.min(1, resource.used_frac)) * 100;
    return { left: 100 - used, used };
  }
  return { left: null, used: null };
};

/**
 * OpenUsage reports the three OpenCode Go windows as stable resource keys. The
 * proxy is a generic pass-through, so normalize the names here once instead of
 * branching in the card.
 */
export function normalizeOpenCodeQuota(provider?: FleetQuotaProvider): OpenCodeQuota {
  if (!provider) {
    return { available: false, plan: '', stale: false, windows: [] };
  }
  const windows = WINDOW_KEYS.flatMap((key) => {
    const resource = findWindow(provider.resources, key);
    if (!resource) return [];
    const { left, used } = percentLeft(resource);
    return [
      {
        key,
        remainingPercent: left,
        usedPercent: used,
        resetsAt: resource.resets_at,
      } satisfies OpenCodeWindow,
    ];
  });
  return {
    available: windows.length > 0,
    plan: provider.plan,
    stale: provider.stale,
    windows,
  };
}
