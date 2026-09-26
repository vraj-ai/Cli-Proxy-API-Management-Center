import { isRecord } from '@/utils/helpers';

/**
 * Devin OAuth cooldown parsing.
 *
 * A failed `startAuth` can carry a provider rate limit (the "try again in
 * 29 minutes" case). The UI may only count down a duration the server
 * actually supplied — never an invented one. Sources, in order:
 *
 * 1. The `Retry-After` response header (delay seconds or HTTP date).
 * 2. A `retry_after` / `retryAfter` response body field.
 * 3. A narrow provider message: "try (again) in N seconds/minutes/hours".
 *
 * Anything else returns undefined and the caller shows the original error
 * text with no timer.
 */

/** Upper bound for a login cooldown countdown; larger values show no timer. */
export const MAX_DEVIN_COOLDOWN_SECONDS = 24 * 3600;

const clampCooldownSeconds = (value: number): number | undefined => {
  if (!Number.isFinite(value)) return undefined;
  const seconds = Math.floor(value);
  if (seconds <= 0 || seconds > MAX_DEVIN_COOLDOWN_SECONDS) return undefined;
  return seconds;
};

const readHeaderValue = (headers: unknown, name: string): unknown => {
  if (!headers || typeof headers !== 'object') return undefined;
  const get = (headers as { get?: unknown }).get;
  if (typeof get === 'function') {
    try {
      return (get as (key: string) => unknown).call(headers, name);
    } catch {
      return undefined;
    }
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
};

/** Parse an HTTP Retry-After value (delay seconds or HTTP date) into seconds. */
export function parseRetryAfterSeconds(
  value: unknown,
  nowMs: number = Date.now()
): number | undefined {
  if (typeof value === 'number') return clampCooldownSeconds(value);
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d+$/.test(text)) return clampCooldownSeconds(Number(text));
    const at = Date.parse(text);
    if (!Number.isNaN(at)) return clampCooldownSeconds((at - nowMs) / 1000);
  }
  return undefined;
}

const MESSAGE_COOLDOWN = /try(?:\s+again)?\s+in\s+(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i;

const unitSeconds = (unit: string): number | undefined => {
  const word = unit.toLowerCase();
  if (word.startsWith('sec')) return 1;
  if (word.startsWith('min')) return 60;
  if (word.startsWith('hour') || word.startsWith('hr')) return 3600;
  return undefined;
};

const messageCooldownSeconds = (text: string): number | undefined => {
  const match = MESSAGE_COOLDOWN.exec(text);
  if (!match) return undefined;
  const unit = unitSeconds(match[2]);
  if (!unit) return undefined;
  return clampCooldownSeconds(Number(match[1]) * unit);
};

/**
 * Extract a Devin login cooldown (seconds) from a failed startAuth error.
 * Returns undefined when the error carries no recognizable duration.
 */
export function parseDevinCooldownSeconds(
  error: unknown,
  nowMs: number = Date.now()
): number | undefined {
  if (typeof error === 'string') return messageCooldownSeconds(error);
  if (!isRecord(error)) return undefined;
  const fromHeader = parseRetryAfterSeconds(readHeaderValue(error.headers, 'retry-after'), nowMs);
  if (fromHeader !== undefined) return fromHeader;
  const body = error.details ?? error.data;
  if (isRecord(body)) {
    const fromBody = parseRetryAfterSeconds(
      body.retry_after ?? body.retryAfter ?? body.retry_in_seconds,
      nowMs
    );
    if (fromBody !== undefined) return fromBody;
  }
  const message = error instanceof Error ? error.message : undefined;
  if (typeof message === 'string' && message) return messageCooldownSeconds(message);
  return undefined;
}

/** A Devin login start is blocked while a session is open or a cooldown runs. */
export function isDevinLoginBlocked(
  providerState: { state?: string; cooldownUntil?: number } | undefined,
  nowMs: number
): boolean {
  if (!providerState) return false;
  if (providerState.state) return true;
  return cooldownRemainingSeconds(providerState.cooldownUntil, nowMs) > 0;
}

/** Seconds left on a cooldown deadline; 0 when absent or expired. */
export function cooldownRemainingSeconds(
  cooldownUntilMs: number | undefined,
  nowMs: number
): number {
  if (typeof cooldownUntilMs !== 'number' || !Number.isFinite(cooldownUntilMs)) return 0;
  return Math.max(0, Math.ceil((cooldownUntilMs - nowMs) / 1000));
}
