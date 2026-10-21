import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import i18n from '../src/i18n';
import { RouteErrorPage, RouteErrorView } from '../src/components/common/RouteErrorPage';

const locales = ['en', 'zh-CN', 'zh-TW', 'ru'];
const keys = [
  'route_error_title',
  'route_error_description',
  'route_error_reload',
  'route_error_home',
];

describe('route error page', () => {
  test('the hash router has an errorElement so a render crash is recoverable', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('errorElement: <RouteErrorPage />');
  });

  test('renders the error message with reload and dashboard actions', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(RouteErrorView, {
          detail: "Cannot read properties of null (reading 'map')",
          showHome: true,
          onReload: () => {},
        })
      )
    );

    expect(html).toContain('This page hit an error');
    expect(html).toContain('Cannot read properties of null (reading &#x27;map&#x27;)');
    expect(html).toContain('Reload page');
    expect(html).toContain('href="/dashboard"');
  });

  test('hides the dashboard link when the failing page is the dashboard', async () => {
    await i18n.changeLanguage('en');
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(RouteErrorView, { detail: '', showHome: false, onReload: () => {} })
      )
    );

    expect(html).toContain('Reload page');
    expect(html).not.toContain('Back to dashboard');
  });

  const renderFailedRoute = async (path: string) => {
    await i18n.changeLanguage('en');
    const routes = [
      {
        path: '*',
        loader: () => {
          throw new Error('secret internal failure');
        },
        element: createElement('div', null, 'page body'),
        errorElement: createElement(RouteErrorPage),
      },
    ];
    const handler = createStaticHandler(routes);
    const context = await handler.query(new Request(`http://localhost${path}`));
    if (context instanceof Response) throw new Error('unexpected redirect');
    return renderToStaticMarkup(
      createElement(StaticRouterProvider, {
        router: createStaticRouter(handler.dataRoutes, context),
        context,
        hydrate: false,
      })
    );
  };

  test('a throwing route renders the fallback through the router without leaking the message', async () => {
    const html = await renderFailedRoute('/fleet');

    expect(html).toContain('This page hit an error');
    expect(html).toContain('Reload page');
    expect(html).toContain('Back to dashboard');
    expect(html).not.toContain('page body');
    expect(html).not.toContain('secret internal failure');
  });

  test('a throwing /dashboard route offers reload only', async () => {
    const html = await renderFailedRoute('/dashboard');

    expect(html).toContain('This page hit an error');
    expect(html).not.toContain('Back to dashboard');
  });

  test('every locale defines the route error strings', () => {
    for (const locale of locales) {
      const common = JSON.parse(
        readFileSync(new URL(`../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8')
      ).common;
      for (const key of keys) expect(typeof common[key]).toBe('string');
    }
  });
});
