import { Link, isRouteErrorResponse, useLocation, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import styles from './RouteErrorPage.module.scss';

function describeRouteError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`.trim();
  if (error instanceof Error) return error.message;
  return '';
}

export function RouteErrorView({
  detail,
  showHome,
  onReload,
  embedded = false,
}: {
  detail: string;
  showHome: boolean;
  onReload: () => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={embedded ? `${styles.page} ${styles.embedded}` : styles.page} role="alert">
      <h1>{t('common.route_error_title')}</h1>
      <p>{t('common.route_error_description')}</p>
      {detail && <p className={styles.detail}>{detail}</p>}
      <div className={styles.actions}>
        <Button onClick={onReload}>{t('common.route_error_reload')}</Button>
        {showHome && (
          <Link className="btn btn-secondary" to="/dashboard">
            {t('common.route_error_home')}
          </Link>
        )}
      </div>
    </div>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  const { pathname } = useLocation();
  return (
    <RouteErrorView
      detail={import.meta.env.DEV ? describeRouteError(error) : ''}
      showHome={pathname !== '/dashboard'}
      onReload={() => window.location.reload()}
    />
  );
}
