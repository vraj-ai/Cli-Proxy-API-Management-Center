import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../src/i18n';
import { PageErrorBoundary } from '../src/components/common/PageErrorBoundary';

const render = (state: { failed: boolean; error: unknown }) => {
  const boundary = new PageErrorBoundary({
    resetKey: '/fleet',
    showHome: true,
    children: createElement('div', null, 'page body'),
  });
  boundary.state = state;
  return renderToStaticMarkup(createElement(MemoryRouter, null, boundary.render()));
};

describe('page error boundary', () => {
  test('records the error that a child render threw', () => {
    const error = new Error("Cannot read properties of null (reading 'map')");
    expect(PageErrorBoundary.getDerivedStateFromError(error)).toEqual({ error, failed: true });
  });

  test('renders children until a render has failed', () => {
    expect(render({ failed: false, error: null })).toContain('page body');
  });

  test('renders the recoverable fallback instead of the page after a failure', async () => {
    await i18n.changeLanguage('en');
    const html = render({ failed: true, error: new Error('secret internal failure') });

    expect(html).toContain('This page hit an error');
    expect(html).toContain('Reload page');
    expect(html).toContain('Back to dashboard');
    expect(html).not.toContain('page body');
    expect(html).not.toContain('secret internal failure');
  });

  test('clears a failure when the reset key changes and keeps it otherwise', () => {
    const boundary = new PageErrorBoundary({
      resetKey: 'b',
      showHome: true,
      children: null,
    });
    const updates: unknown[] = [];
    boundary.setState = (next) => updates.push(next);
    boundary.state = { failed: true, error: new Error('x') };

    boundary.componentDidUpdate({ resetKey: 'b', showHome: true, children: null });
    expect(updates).toEqual([]);

    boundary.componentDidUpdate({ resetKey: 'a', showHome: true, children: null });
    expect(updates).toEqual([{ error: null, failed: false }]);
  });

  test('MainLayout wraps the routed page so the sidebar survives a page crash', () => {
    const source = readFileSync(
      new URL('../src/components/layout/MainLayout.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toMatch(/<PageErrorBoundary[\s\S]*<MainRoutes location=\{location\} \/>/);
  });
});
