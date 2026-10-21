import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  fleetApi,
  type FleetGrant,
  type FleetSavings,
  type FleetTodosResponse,
} from '@/services/api/fleet';
import { pluginsApi } from '@/services/api/plugins';
import { useAuthStore } from '@/stores';
import { isRecord } from '@/utils/helpers';
import { DEFAULT_GRANT_MODE, grantModelsFor } from './grants';
import { groupTodos, normalizeTodos } from './todos';
import styles from './FleetPage.module.scss';

type FleetView = 'overview' | 'access' | 'activity';
type FleetLoad<T> =
  | { status: 'loading' }
  | { status: 'ready'; value: T }
  | { status: 'error'; message: string; unavailable?: boolean };

const loading = <T,>(): FleetLoad<T> => ({ status: 'loading' });
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Request failed';

function isUnavailable(error: unknown) {
  return (
    error instanceof Error && 'status' in error && (error.status === 404 || error.status === 501)
  );
}

function useFleetData<T>(load: () => Promise<T>) {
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const apiBase = useAuthStore((state) => state.apiBase);
  const [result, setResult] = useState<FleetLoad<T>>(loading);
  const [resultKey, setResultKey] = useState('');
  const generation = useRef(0);
  const connectionKey = `${apiBase}:${connectionStatus}`;

  const updateResult = useCallback(
    (next: FleetLoad<T>) => {
      setResult(next);
      setResultKey(`${apiBase}:${connectionStatus}`);
    },
    [apiBase, connectionStatus]
  );

  const refresh = useCallback(async () => {
    const requestID = ++generation.current;
    if (connectionStatus !== 'connected') {
      updateResult(loading());
      return;
    }
    updateResult(loading());
    try {
      const value = await load();
      if (requestID === generation.current) updateResult({ status: 'ready', value });
    } catch (error) {
      if (requestID === generation.current) {
        updateResult({
          status: 'error',
          message: errorMessage(error),
          unavailable: isUnavailable(error),
        });
      }
    }
  }, [connectionStatus, load, updateResult]);

  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [apiBase, refresh]);

  return {
    result: resultKey === connectionKey ? result : loading<T>(),
    refresh,
    connectionStatus,
    apiBase,
    generation,
  };
}

function FleetShell({ view, children }: { view: FleetView; children: ReactNode }) {
  const { t } = useTranslation();
  const items: Array<{ view: FleetView; label: string; to: string }> = [
    { view: 'overview', label: t('fleet.nav_overview'), to: '/fleet' },
    { view: 'access', label: t('fleet.nav_access'), to: '/fleet/access' },
    { view: 'activity', label: t('fleet.nav_activity'), to: '/fleet/activity' },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{t('fleet.eyebrow')}</div>
          <h1>{t(`fleet.title_${view}`)}</h1>
          <p>{t(`fleet.description_${view}`)}</p>
        </div>
        <nav className={styles.tabs} aria-label={t('fleet.navigation')}>
          {items.map((item) => (
            <Link
              key={item.view}
              to={item.to}
              aria-current={view === item.view ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

function LoadState<T>({ result, retry }: { result: FleetLoad<T>; retry: () => void }) {
  const { t } = useTranslation();
  if (result.status === 'loading')
    return (
      <div className={styles.notice} role="status">
        {t('fleet.loading')}
      </div>
    );
  if (result.status === 'ready') return null;
  return (
    <div className={styles.notice} role="alert">
      <strong>{result.unavailable ? t('fleet.unavailable_title') : t('fleet.error_title')}</strong>
      <p>{result.unavailable ? t('fleet.unavailable_body') : result.message}</p>
      {!result.unavailable && (
        <button type="button" onClick={retry}>
          {t('fleet.retry')}
        </button>
      )}
    </div>
  );
}

const formatWhen = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
};

function TodosCard({ response }: { response?: FleetTodosResponse | null }) {
  const { t } = useTranslation();
  const { todos, updatedAt, problem } = useMemo(() => normalizeTodos(response?.raw), [response?.raw]);
  const projects = useMemo(() => groupTodos(todos), [todos]);
  const fetchedAt = formatWhen(response?.fetched_at);
  const newestAt = formatWhen(updatedAt);
  const flagged = Boolean(response?.stale || response?.error || problem);
  const problemText =
    response?.error || (problem ? t(`fleet.todos_problem_${problem}`) : '');

  return (
    <section className={styles.panel} aria-labelledby="fleet-todos-heading">
      <div className={styles.sectionHead}>
        <div>
          <h2 id="fleet-todos-heading">{t('fleet.todos_heading')}</h2>
          <p>{t('fleet.todos_help')}</p>
        </div>
        <div className={styles.todoMeta}>
          {fetchedAt && (
            <time dateTime={response?.fetched_at}>
              {t('fleet.todos_fetched', { value: fetchedAt })}
            </time>
          )}
          {newestAt && <span>{t('fleet.todos_updated', { value: newestAt })}</span>}
          {flagged && <span className={styles.stale}>{t('fleet.stale')}</span>}
        </div>
      </div>
      {problemText && (
        <p className={styles.muted} role="status">
          {problemText}
        </p>
      )}
      {todos.length === 0 ? (
        <p className={styles.muted}>{t('fleet.todos_empty')}</p>
      ) : (
        <div className={styles.todoProjects}>
          {projects.map(({ project, groups }) => (
            <section className={styles.todoProject} key={project} aria-label={project}>
              <h3>{project}</h3>
              {groups.map(({ status, items }) => (
                <div className={styles.todoGroup} key={status}>
                  <h4>{t(`fleet.todo_status_${status}`)}</h4>
                  <ul className={styles.todoList}>
                    {items.map((todo) => {
                      const when = formatWhen(todo.updated_at);
                      return (
                        <li key={todo.id}>
                          {todo.link ? (
                            <a href={todo.link} target="_blank" rel="noopener noreferrer">
                              {todo.title}
                            </a>
                          ) : (
                            <span>{todo.title}</span>
                          )}
                          {when && <time dateTime={todo.updated_at}>{when}</time>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function FleetOverview() {
  const { t } = useTranslation();
  const load = useCallback(() => fleetApi.state(), []);
  const todosLoadFn = useCallback(async () => (await fleetApi.todos()) ?? null, []);
  const { result, refresh } = useFleetData(load);
  const todosLoad = useFleetData(todosLoadFn);
  const state = result.status === 'ready' ? result.value : null;

  return (
    <FleetShell view="overview">
      <LoadState result={result} retry={() => void refresh()} />
      {state && (
        <>
          <section className={styles.statusLine} aria-label={t('fleet.instance_status')}>
            <span className={styles.statusDot} />
            <strong>{t('fleet.connected')}</strong>
            <span>{state.link}</span>
            <time dateTime={state.generated_at}>
              {t('fleet.updated', { value: new Date(state.generated_at).toLocaleString() })}
            </time>
          </section>
          <section className={styles.columns}>
            <div className={styles.panel}>
              <h2>{t('fleet.providers_heading')}</h2>
              {state.providers.length === 0 ? (
                <p className={styles.muted}>{t('fleet.no_providers')}</p>
              ) : (
                <ul className={styles.providerList}>
                  {state.providers.map((provider) => (
                    <li key={`${provider.kind}:${provider.name}:${provider.detail ?? ''}`}>
                      <span className={styles.providerMark} aria-hidden="true">
                        {provider.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className={styles.providerInfo}>
                        <strong>{provider.name}</strong>
                        <small>
                          {provider.detail || provider.kind} ·{' '}
                          {t('fleet.models_count', { count: provider.models.length })}
                        </small>
                      </span>
                      <span className={provider.disabled ? styles.badgeMuted : styles.badge}>
                        {provider.disabled ? t('fleet.disabled') : t('fleet.enabled')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link className={styles.inlineLink} to="/ai-providers">
                {t('fleet.manage_accounts')}
              </Link>
            </div>
            <div className={styles.panel}>
              <h2>{t('fleet.pace_heading')}</h2>
              {state.pace.model ? (
                <div className={styles.pace}>
                  <strong>{state.pace.tps?.toFixed(1) ?? '—'}</strong>
                  <span>{t('fleet.tokens_per_second')}</span>
                  <code>{state.pace.model}</code>
                  <small>
                    {state.pace.output_tokens ?? '—'} {t('fleet.output_tokens')} ·{' '}
                    {state.pace.latency_ms ?? '—'} ms
                  </small>
                </div>
              ) : (
                <p className={styles.muted}>
                  {state.pace.running?.length ? t('fleet.request_running') : t('fleet.no_pace')}
                </p>
              )}
              {state.pace.running?.length ? (
                <p className={styles.running}>
                  {t('fleet.running', { value: state.pace.running.join(', ') })}
                </p>
              ) : null}
            </div>
          </section>
          <section className={styles.panel}>
            <h2>{t('fleet.quota_heading')}</h2>
            {state.quota.length === 0 ? (
              <p className={styles.muted}>{t('fleet.no_quota')}</p>
            ) : (
              <div className={styles.quotaList}>
                {state.quota.map((provider) => (
                  <div className={styles.quotaProvider} key={provider.name}>
                    <div className={styles.quotaProviderHead}>
                      <strong>{provider.name}</strong>
                      <span>{provider.plan}</span>
                      {provider.stale && <span className={styles.stale}>{t('fleet.stale')}</span>}
                    </div>
                    {provider.resources.map((resource) => (
                      <div className={styles.quotaRow} key={`${provider.name}:${resource.name}`}>
                        <span>{resource.name}</span>
                        <span>
                          {Number.isFinite(resource.remaining) && Number.isFinite(resource.limit)
                            ? `${resource.remaining} / ${resource.limit}`
                            : t('fleet.unknown')}
                        </span>
                        {resource.resets_at ? (
                          <time dateTime={resource.resets_at}>
                            {new Date(resource.resets_at).toLocaleString()}
                          </time>
                        ) : (
                          <span>{t('fleet.reset_unknown')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <Link className={styles.inlineLink} to="/quota">
              {t('fleet.open_quota')}
            </Link>
          </section>
          <section className={styles.panel}>
            <h2>{t('fleet.path_heading')}</h2>
            <p className={styles.muted}>{t('fleet.path_summary')}</p>
            <div className={styles.flagList}>
              {(['pxpipe', 'caveman', 'ponytail'] as const).map((name) => (
                <span className={styles.flag} key={name}>
                  <span className={state.flags[name] ? styles.statusDot : styles.statusOff} />
                  {t(`fleet.feature_${name}`)}
                  <strong>{state.flags[name] ? t('fleet.enabled') : t('fleet.disabled')}</strong>
                </span>
              ))}
            </div>
            <Link className={styles.inlineLink} to="/fleet/access?tab=models">
              {t('fleet.configure_models')}
            </Link>
          </section>
        </>
      )}
      <LoadState result={todosLoad.result} retry={() => void todosLoad.refresh()} />
      {todosLoad.result.status === 'ready' && <TodosCard response={todosLoad.result.value} />}
    </FleetShell>
  );
}

function KeySecretDialog({
  secret,
  link,
  onClose,
}: {
  secret: string;
  link: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const copySecret = async () => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.secretDialog}
      aria-labelledby="fleet-key-created"
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className={styles.secretEyebrow}>{t('fleet.secret_eyebrow')}</div>
      <h2 id="fleet-key-created">{t('fleet.secret_once')}</h2>
      <p>{t('fleet.secret_help')}</p>
      <div className={styles.secretValue}>
        <code>{secret}</code>
      </div>
      <dl className={styles.secretMeta}>
        <div>
          <dt>{t('fleet.endpoint')}</dt>
          <dd>
            <code>{link ? `${link.replace(/\/$/, '')}/v1` : t('fleet.unknown')}</code>
          </dd>
        </div>
        <div>
          <dt>{t('fleet.auth_header')}</dt>
          <dd>
            <code>Authorization: Bearer &lt;key&gt;</code>
          </dd>
        </div>
      </dl>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.primaryButton} onClick={() => void copySecret()}>
          {copied ? t('fleet.copied') : t('fleet.copy_secret')}
        </button>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => dialogRef.current?.close()}
        >
          {t('fleet.done')}
        </button>
      </div>
    </dialog>
  );
}

const modelFeatures = ['pxpipe', 'caveman', 'ponytail'] as const;

function FleetAccess() {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'models' ? 'models' : 'keys';
  const stateLoad = useCallback(() => fleetApi.state(), []);
  const keysLoad = useCallback(() => fleetApi.keys(), []);
  const stateData = useFleetData(stateLoad);
  const keysData = useFleetData(keysLoad);
  const [filter, setFilter] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'all' | 'list'>(DEFAULT_GRANT_MODE);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [manualModelRules, setManualModelRules] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editDrafts, setEditDrafts] = useState<
    Record<string, { name: string; mode: 'all' | 'list'; models: string }>
  >({});
  const connectionKey = `${stateData.apiBase}:${stateData.connectionStatus}`;
  const mutationKey = useRef(connectionKey);
  const state = stateData.result.status === 'ready' ? stateData.result.value : null;
  const keys = keysData.result.status === 'ready' ? keysData.result.value : null;
  const models = useMemo(() => {
    const unique = [...new Set(state?.models ?? [])];
    const query = filter.trim().toLocaleLowerCase();
    return unique
      .filter((model) => !query || model.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b));
  }, [filter, state?.models]);

  const mutate = async <T,>(action: () => Promise<T>, onSuccess?: (value: T) => void) => {
    const startKey = mutationKey.current;
    setBusy(true);
    setMessage('');
    try {
      const value = await action();
      if (startKey !== mutationKey.current) return;
      onSuccess?.(value);
      await Promise.all([keysData.refresh(), stateData.refresh()]);
    } catch (error) {
      if (startKey === mutationKey.current) setMessage(errorMessage(error));
    } finally {
      if (startKey === mutationKey.current) setBusy(false);
    }
  };

  useEffect(() => {
    mutationKey.current = connectionKey;
    setBusy(false);
    setSecret('');
    setMessage('');
  }, [connectionKey, location.pathname]);

  const toggleModel = (model: string) =>
    setSelectedModels((current) =>
      current.includes(model) ? current.filter((item) => item !== model) : [...current, model]
    );
  const beginEdit = (key: FleetGrant) =>
    setEditDrafts((current) => ({
      ...current,
      [key.id]: { name: key.name, mode: key.mode, models: key.models.join(', ') },
    }));
  const setGlobalTool = (feature: 'headroom' | 'rtk', enabled: boolean) =>
    mutate(async () => {
      const config = await pluginsApi.getConfig('fleet');
      const currentTools = isRecord(config.client_tools) ? config.client_tools : {};
      return pluginsApi.patchConfig('fleet', {
        client_tools: { ...currentTools, [feature]: enabled },
      });
    });
  const listModeInvalid =
    mode === 'list' && selectedModels.length === 0 && !manualModelRules.trim();

  return (
    <FleetShell view="access">
      <div className={styles.subtabs} role="tablist" aria-label={t('fleet.access_tabs')}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'keys'}
          onClick={() => setSearchParams({})}
        >
          {t('fleet.client_keys')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'models'}
          onClick={() => setSearchParams({ tab: 'models' })}
        >
          {t('fleet.model_access')}
        </button>
      </div>
      {activeTab === 'models' ? (
        <>
          <LoadState result={stateData.result} retry={() => void stateData.refresh()} />
          {state && (
            <>
              <section className={styles.panel}>
                <div className={styles.sectionHead}>
                  <div>
                    <h2>{t('fleet.exact_catalog')}</h2>
                    <p>{t('fleet.exact_catalog_help')}</p>
                  </div>
                  <label className={styles.search}>
                    <span>{t('fleet.search_models')}</span>
                    <input
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      type="search"
                      placeholder={t('fleet.model_search_placeholder')}
                    />
                  </label>
                </div>
                <div className={styles.modelToolbar}>
                  <span className={styles.modelCount}>
                    {t('fleet.model_count', { count: state.models.length })}
                  </span>
                  <label className={styles.compressionToggle}>
                    <input
                      type="checkbox"
                      checked={state.pxpipe.compressing}
                      disabled={!state.pxpipe.reachable || busy}
                      onChange={(event) =>
                        void mutate(() => fleetApi.setCompression(event.target.checked))
                      }
                    />
                    <span>
                      <strong>{t('fleet.compression_toggle')}</strong>
                      <small>
                        {state.pxpipe.reachable
                          ? t('fleet.compression_help')
                          : t('fleet.pxpipe_unreachable')}
                      </small>
                    </span>
                  </label>
                </div>
                <div className={styles.modelTable} role="table" aria-label={t('fleet.model_table')}>
                  <div className={styles.modelTableHead} role="row">
                    <span role="columnheader">{t('fleet.model')}</span>
                    <span role="columnheader">{t('fleet.pxpipe_scope')}</span>
                    {modelFeatures.map((feature) => (
                      <span role="columnheader" key={feature}>
                        {t(`fleet.feature_${feature}`)}
                      </span>
                    ))}
                  </div>
                  {models.map((model) => (
                    <div className={styles.modelRow} role="row" key={model}>
                      <code role="cell">{model}</code>
                      <label className={styles.checkCell} role="cell">
                        <input
                          type="checkbox"
                          aria-label={`${model} ${t('fleet.pxpipe_scope')}`}
                          checked={state.pxpipe.scope.includes(model)}
                          onChange={(event) =>
                            void mutate(() =>
                              fleetApi.setScope(
                                event.target.checked
                                  ? [...state.pxpipe.scope, model]
                                  : state.pxpipe.scope.filter((item) => item !== model)
                              )
                            )
                          }
                        />
                        <span className={styles.cellLabel}>{t('fleet.pxpipe_scope')}</span>
                      </label>
                      {modelFeatures.map((feature) => (
                        <label className={styles.checkCell} role="cell" key={feature}>
                          <input
                            type="checkbox"
                            aria-label={`${model} ${t(`fleet.feature_${feature}`)}`}
                            checked={
                              state.features.effective[model]?.[feature] ??
                              state.features.defaults[feature] ??
                              false
                            }
                            onChange={(event) =>
                              void mutate(() =>
                                fleetApi.setFeature(model, feature, event.target.checked)
                              )
                            }
                          />
                          <span className={styles.cellLabel}>{t(`fleet.feature_${feature}`)}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                  {models.length === 0 && (
                    <p className={styles.muted}>{t('fleet.no_matching_models')}</p>
                  )}
                </div>
              </section>
              <section className={styles.panel}>
                <div className={styles.sectionHead}>
                  <div>
                    <h2>{t('fleet.global_tools')}</h2>
                    <p>{t('fleet.global_tools_help')}</p>
                  </div>
                </div>
                {(['headroom', 'rtk'] as const).map((feature) => {
                  const tool = state.features.tools[feature];
                  return (
                    <div className={styles.toolRow} key={feature}>
                      <span>
                        <strong>{t(`fleet.feature_${feature}`)}</strong>
                        <small>
                          {tool?.note ||
                            t('fleet.tool_state', {
                              state: tool?.available
                                ? t('fleet.available')
                                : t('fleet.unavailable_title'),
                            })}
                        </small>
                      </span>
                      <label>
                        <input
                          type="checkbox"
                          checked={tool?.active ?? false}
                          disabled={!tool?.available || busy}
                          onChange={(event) => void setGlobalTool(feature, event.target.checked)}
                        />
                        {tool?.active ? t('fleet.enabled') : t('fleet.disabled')}
                      </label>
                    </div>
                  );
                })}
                <Link className={styles.inlineLink} to="/plugins">
                  {t('fleet.open_plugin_settings')}
                </Link>
              </section>
            </>
          )}
        </>
      ) : (
        <>
          <LoadState result={keysData.result} retry={() => void keysData.refresh()} />
          <LoadState result={stateData.result} retry={() => void stateData.refresh()} />
          {message && (
            <div className={styles.notice} role="alert">
              {message}
            </div>
          )}
          {secret && (
            <KeySecretDialog
              secret={secret}
              link={state?.link ?? ''}
              onClose={() => setSecret('')}
            />
          )}
          <section className={styles.panel}>
            <div className={styles.createIntro}>
              <h2>{t('fleet.create_key')}</h2>
              <p>{t('fleet.create_help')}</p>
            </div>
            <form
              className={styles.createForm}
              onSubmit={(event) => {
                event.preventDefault();
                void mutate(
                  () =>
                    fleetApi.createKey({
                      name: name.trim() || t('fleet.default_key_name'),
                      mode,
                      models: grantModelsFor(mode, manualModelRules, selectedModels),
                    }),
                  (result) => {
                    setSecret(result.secret);
                    setName('');
                    setSelectedModels([]);
                    setManualModelRules('');
                  }
                );
              }}
            >
              <label className={styles.field}>
                <span>{t('fleet.key_name_optional')}</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  placeholder={t('fleet.key_name_placeholder')}
                />
              </label>
              <fieldset className={styles.grantChoice}>
                <legend>{t('fleet.grant_mode')}</legend>
                <label className={mode === 'all' ? styles.grantOptionActive : styles.grantOption}>
                  <input
                    type="radio"
                    name="fleet-grant"
                    checked={mode === 'all'}
                    onChange={() => setMode('all')}
                  />
                  <span>
                    <strong>{t('fleet.access_all_title')}</strong>
                    <small>{t('fleet.access_all_help')}</small>
                  </span>
                </label>
                <label className={mode === 'list' ? styles.grantOptionActive : styles.grantOption}>
                  <input
                    type="radio"
                    name="fleet-grant"
                    checked={mode === 'list'}
                    onChange={() => setMode('list')}
                  />
                  <span>
                    <strong>{t('fleet.access_list_title')}</strong>
                    <small>{t('fleet.access_list_help')}</small>
                  </span>
                </label>
              </fieldset>
              {mode === 'list' && (
                <div className={styles.modelPicker} aria-label={t('fleet.selected_models')}>
                  <label className={styles.search}>
                    <span>{t('fleet.search_models')}</span>
                    <input
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                      type="search"
                      placeholder={t('fleet.model_search_placeholder')}
                    />
                  </label>
                  <div className={styles.pickerList}>
                    {models.map((model) => (
                      <label className={styles.pickerRow} key={model}>
                        <input
                          type="checkbox"
                          checked={selectedModels.includes(model)}
                          onChange={() => toggleModel(model)}
                        />
                        <code>{model}</code>
                      </label>
                    ))}
                    {models.length === 0 && (
                      <p className={styles.muted}>{t('fleet.no_matching_models')}</p>
                    )}
                  </div>
                  <label className={styles.field}>
                    <span>{t('fleet.model_rules')}</span>
                    <textarea
                      value={manualModelRules}
                      onChange={(event) => setManualModelRules(event.target.value)}
                      placeholder="openai/"
                    />
                  </label>
                </div>
              )}
              <div className={styles.formActions}>
                <span className={styles.formHint}>
                  {mode === 'all' ? t('fleet.access_includes_new') : t('fleet.new_models_excluded')}
                </span>
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={busy || listModeInvalid}
                >
                  {busy ? t('fleet.create_key_busy') : t('fleet.create_key')}
                </button>
              </div>
            </form>
          </section>
          {keys && (
            <section className={styles.panel}>
              <div className={styles.sectionHead}>
                <div>
                  <h2>{t('fleet.managed_keys')}</h2>
                  <p>{t('fleet.managed_keys_help')}</p>
                </div>
              </div>
              {keys.keys.length === 0 ? (
                <p className={styles.muted}>{t('fleet.no_keys')}</p>
              ) : (
                <div className={styles.keyList}>
                  {keys.keys.map((key) => {
                    const draft = editDrafts[key.id];
                    return (
                      <article className={styles.keyCard} key={key.id}>
                        <div className={styles.keyHead}>
                          <div className={styles.keyIdentity}>
                            <strong>{key.name}</strong>
                            <code>{key.prefix}</code>
                          </div>
                          <span
                            className={key.live && !key.disabled ? styles.badge : styles.badgeMuted}
                          >
                            {key.disabled
                              ? t('fleet.disabled')
                              : key.live
                                ? t('fleet.live')
                                : t('fleet.missing')}
                          </span>
                        </div>
                        <div className={styles.keyAccess}>
                          {key.mode === 'all' ? (
                            <span className={styles.accessAll}>
                              <span className={styles.accessDot} />
                              {t('fleet.grant_all')}
                              <small>{t('fleet.access_includes_new')}</small>
                            </span>
                          ) : (
                            <span className={styles.accessList}>
                              {t('fleet.grant_models', { count: key.model_count })}
                              <small>{t('fleet.new_models_excluded')}</small>
                            </span>
                          )}
                          <span className={styles.keyMeta}>
                            {t('fleet.key_created', {
                              value: new Date(key.created_at).toLocaleDateString(),
                            })}
                          </span>
                          {key.mode === 'list' && !draft && (
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={busy}
                              onClick={() =>
                                void mutate(() =>
                                  fleetApi.updateKey({ id: key.id, mode: 'all', models: [] })
                                )
                              }
                            >
                              {t('fleet.allow_all')}
                            </button>
                          )}
                        </div>
                        {draft ? (
                          <div className={styles.editForm}>
                            <label className={styles.field}>
                              <span>{t('fleet.key_name')}</span>
                              <input
                                value={draft.name}
                                onChange={(event) =>
                                  setEditDrafts((current) => ({
                                    ...current,
                                    [key.id]: { ...draft, name: event.target.value },
                                  }))
                                }
                              />
                            </label>
                            <label className={styles.field}>
                              <span>{t('fleet.grant_mode')}</span>
                              <select
                                value={draft.mode}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  if (value === 'all' || value === 'list')
                                    setEditDrafts((current) => ({
                                      ...current,
                                      [key.id]: { ...draft, mode: value },
                                    }));
                                }}
                              >
                                <option value="all">{t('fleet.all_models')}</option>
                                <option value="list">{t('fleet.selected_models')}</option>
                              </select>
                            </label>
                            {draft.mode === 'list' && (
                              <label className={styles.field} style={{ flexBasis: '100%' }}>
                                <span>{t('fleet.model_rules')}</span>
                                <textarea
                                  value={draft.models}
                                  onChange={(event) =>
                                    setEditDrafts((current) => ({
                                      ...current,
                                      [key.id]: { ...draft, models: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                            )}
                            <div className={styles.formActions}>
                              <button
                                type="button"
                                className={styles.primaryButton}
                                disabled={busy}
                                onClick={() =>
                                  void mutate(() =>
                                    fleetApi.updateKey({
                                      id: key.id,
                                      name: draft.name,
                                      mode: draft.mode,
                                      models: grantModelsFor(draft.mode, draft.models),
                                    })
                                  )
                                }
                              >
                                {t('fleet.save')}
                              </button>
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() =>
                                  setEditDrafts((current) => {
                                    const next = { ...current };
                                    delete next[key.id];
                                    return next;
                                  })
                                }
                              >
                                {t('fleet.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.actions}>
                            <button type="button" onClick={() => beginEdit(key)}>
                              {t('fleet.edit')}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void mutate(() =>
                                  fleetApi.updateKey({ id: key.id, disabled: !key.disabled })
                                )
                              }
                            >
                              {key.disabled ? t('fleet.enable') : t('fleet.disable')}
                            </button>
                            <button
                              type="button"
                              className={styles.danger}
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(t('fleet.revoke_confirm', { name: key.name })))
                                  void mutate(() => fleetApi.revokeKey(key.id));
                              }}
                            >
                              {t('fleet.revoke')}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
              {keys.legacy.length > 0 && (
                <div className={styles.legacy}>
                  <h3>{t('fleet.legacy_keys')}</h3>
                  <p>{t('fleet.legacy_help')}</p>
                  {keys.legacy.map((legacy) => (
                    <div className={styles.legacyRow} key={legacy.index}>
                      <code>{legacy.prefix}</code>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void mutate(() =>
                            fleetApi.adoptKey({
                              index: legacy.index,
                              name: `Adopted ${legacy.prefix}`,
                              mode: 'all',
                              models: [],
                            })
                          )
                        }
                      >
                        {t('fleet.adopt')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </FleetShell>
  );
}

function FleetActivity() {
  const { t } = useTranslation();
  const load = useCallback(() => fleetApi.savings(), []);
  const stateLoad = useCallback(() => fleetApi.state(), []);
  const { result, refresh } = useFleetData(load);
  const stateData = useFleetData(stateLoad);
  const savings: FleetSavings | null = result.status === 'ready' ? result.value : null;
  const state = stateData.result.status === 'ready' ? stateData.result.value : null;
  const staleProviders = state?.quota.filter((provider) => provider.stale) ?? [];

  return (
    <FleetShell view="activity">
      <LoadState result={result} retry={() => void refresh()} />
      <LoadState result={stateData.result} retry={() => void stateData.refresh()} />
      {state && (
        <section className={styles.panel}>
          <h2>{t('fleet.freshness_heading')}</h2>
          <p className={styles.muted}>{t('fleet.freshness_help')}</p>
          <div className={styles.metricRow}>
            <span>
              <strong>{state.pace.tps?.toFixed(1) ?? '—'}</strong>
              <small>
                {t('fleet.tokens_per_second')}
                {state.pace.model ? ` · ${state.pace.model}` : ''}
              </small>
            </span>
            <span>
              <strong>{state.quota.length.toLocaleString()}</strong>
              <small>
                {staleProviders.length
                  ? t('fleet.stale_accounts', { count: staleProviders.length })
                  : t('fleet.quota_fresh')}
              </small>
            </span>
            <span>
              <strong>{new Date(state.generated_at).toLocaleTimeString()}</strong>
              <small>{t('fleet.state_generated')}</small>
            </span>
          </div>
          {staleProviders.length > 0 && (
            <div className={styles.quotaList}>
              {staleProviders.map((provider) => (
                <div className={styles.quotaProvider} key={provider.name}>
                  <div className={styles.quotaProviderHead}>
                    <strong>{provider.name}</strong>
                    <span>{provider.plan}</span>
                    <span className={styles.stale}>{t('fleet.stale')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link className={styles.inlineLink} to="/fleet">
            {t('fleet.open_overview')}
          </Link>
        </section>
      )}
      {savings && (
        <>
          <p className={styles.caveat}>{savings.note || t('fleet.savings_caveat')}</p>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <div>
                <h2>{t('fleet.pxpipe_savings')}</h2>
                <p>{t('fleet.character_reduction')}</p>
              </div>
              <a href="http://127.0.0.1:47821/dashboard" target="_blank" rel="noopener noreferrer">
                {t('fleet.open_pxpipe')}
              </a>
            </div>
            <div className={styles.metricRow}>
              <span>
                <strong>{savings.pxpipe.saved_pct.toFixed(1)}%</strong>
                <small>{t('fleet.text_reduction')}</small>
              </span>
              <span>
                <strong>{savings.pxpipe.requests.toLocaleString()}</strong>
                <small>{t('fleet.requests')}</small>
              </span>
              <span>
                <strong>{savings.pxpipe.saved_chars.toLocaleString()}</strong>
                <small>{t('fleet.characters_reduced')}</small>
              </span>
            </div>
            <p className={styles.muted}>
              {t('fleet.character_flow', {
                before: savings.pxpipe.chars_before.toLocaleString(),
                after: savings.pxpipe.chars_after.toLocaleString(),
              })}
            </p>
            <div className={styles.modelList}>
              {Object.entries(savings.pxpipe.saved_chars_by_model)
                .sort((a, b) => b[1] - a[1])
                .map(([model, chars]) => (
                  <div className={styles.quotaRow} key={model}>
                    <code>{model}</code>
                    <span>
                      {chars.toLocaleString()} {t('fleet.characters')}
                    </span>
                  </div>
                ))}
            </div>
          </section>
          <section className={styles.panel}>
            <h2>{t('fleet.context_savings')}</h2>
            <p>{t('fleet.byte_reduction')}</p>
            <div className={styles.metricRow}>
              <span>
                <strong>{savings.subagent_context.saved_pct.toFixed(1)}%</strong>
                <small>{t('fleet.byte_reduction')}</small>
              </span>
              <span>
                <strong>{savings.subagent_context.events.toLocaleString()}</strong>
                <small>{t('fleet.events')}</small>
              </span>
              <span>
                <strong>{savings.subagent_context.saved_bytes.toLocaleString()}</strong>
                <small>{t('fleet.bytes_reduced')}</small>
              </span>
            </div>
            <p className={styles.muted}>
              {t('fleet.byte_flow', {
                before: savings.subagent_context.bytes_before.toLocaleString(),
                after: savings.subagent_context.bytes_after.toLocaleString(),
              })}
            </p>
          </section>
          <section className={styles.panel}>
            <h2>{t('fleet.injection_heading')}</h2>
            <p>{t('fleet.injection_explainer')}</p>
            <strong className={styles.injectionCount}>
              {savings.injections_this_process.toLocaleString()}
            </strong>
            <span>{t('fleet.injections')}</span>
          </section>
        </>
      )}
    </FleetShell>
  );
}

export function FleetPage() {
  const location = useLocation();
  if (location.pathname === '/fleet/access') return <FleetAccess />;
  if (location.pathname === '/fleet/activity') return <FleetActivity />;
  return <FleetOverview />;
}
