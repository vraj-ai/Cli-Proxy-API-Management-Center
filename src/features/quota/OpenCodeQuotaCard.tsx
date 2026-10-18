import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fleetApi, type FleetQuotaProvider } from '@/services/api/fleet';
import { useAuthStore } from '@/stores';
import { normalizeOpenCodeQuota } from './opencode';
import styles from './OpenCodeQuotaCard.module.scss';

type Load =
  { status: 'loading' } | { status: 'ready'; provider?: FleetQuotaProvider } | { status: 'error' };

const percentText = (value: number | null) => {
  if (value === null) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
};

const meterClass = (value: number | null) => {
  if (value === null) return styles.meterUnknown;
  if (value >= 70) return styles.meterHigh;
  if (value >= 30) return styles.meterMedium;
  return styles.meterLow;
};

export function OpenCodeQuotaCard() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (connectionStatus !== 'connected') {
      setLoad({ status: 'loading' });
      return;
    }
    const request = ++generation.current;
    setLoad((current) => (current.status === 'ready' ? current : { status: 'loading' }));
    try {
      const state = await fleetApi.state();
      if (request !== generation.current) return;
      setLoad({
        status: 'ready',
        provider: state.quota.find((provider) => provider.name === 'opencode'),
      });
    } catch {
      if (request === generation.current) setLoad({ status: 'error' });
    }
  }, [connectionStatus]);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [apiBase, refresh]);

  const provider = load.status === 'ready' ? load.provider : undefined;
  const quota = normalizeOpenCodeQuota(provider);
  const plan = quota.plan || t('opencode_quota.plan');
  const stale = quota.stale;

  return (
    <section className={styles.card} data-reveal aria-labelledby="opencode-quota-title">
      <header className={styles.head}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>{t('opencode_quota.eyebrow')}</span>
          <div className={styles.titleRow}>
            <h2 id="opencode-quota-title">{t('opencode_quota.title')}</h2>
            <span className={styles.plan}>{plan}</span>
            {stale && <span className={styles.stale}>{t('opencode_quota.stale')}</span>}
          </div>
          <p>{t('opencode_quota.description')}</p>
        </div>
        <div className={styles.headActions}>
          <button type="button" onClick={() => void refresh()} disabled={load.status === 'loading'}>
            {t('common.refresh')}
          </button>
          <a href="https://opencode.ai/console" target="_blank" rel="noreferrer">
            {t('opencode_quota.open_console')}
          </a>
        </div>
      </header>

      {load.status === 'error' ? (
        <div className={styles.empty} role="alert">
          <strong>{t('opencode_quota.unavailable_title')}</strong>
          <p>{t('opencode_quota.unavailable_desc')}</p>
        </div>
      ) : load.status === 'loading' && !provider ? (
        <div className={styles.empty} role="status">
          {t('common.loading')}
        </div>
      ) : quota.available ? (
        <div className={styles.windows}>
          {quota.windows.map((window) => (
            <div className={styles.window} key={window.key}>
              <div className={styles.windowHead}>
                <span className={styles.windowLabel}>{t(`opencode_quota.${window.key}`)}</span>
                <span className={styles.windowShare}>
                  {t(`opencode_quota.${window.key}_share`)}
                </span>
                <strong className={styles.windowValue}>
                  {t('opencode_quota.left', { value: percentText(window.remainingPercent) })}
                </strong>
              </div>
              <div
                className={styles.meter}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={window.remainingPercent ?? undefined}
                aria-label={`${t('opencode_quota.title')} ${t(`opencode_quota.${window.key}`)}`}
              >
                <span
                  className={`${styles.meterFill} ${meterClass(window.remainingPercent)}`}
                  style={{ width: `${window.remainingPercent ?? 0}%` }}
                />
              </div>
              <div className={styles.windowMeta}>
                <span>{t('opencode_quota.used', { value: percentText(window.usedPercent) })}</span>
                <span>
                  {window.resetsAt
                    ? t('opencode_quota.reset', {
                        value: new Date(window.resetsAt).toLocaleString(),
                      })
                    : t('opencode_quota.reset_unknown')}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>{t('opencode_quota.empty_title')}</strong>
          <p>{t('opencode_quota.empty_desc')}</p>
        </div>
      )}

      <footer className={styles.footer}>
        <span>{t('opencode_quota.source')}</span>
        <span>{t('opencode_quota.plan_note')}</span>
      </footer>
    </section>
  );
}
