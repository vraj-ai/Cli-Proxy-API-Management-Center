import { describe, expect, it } from 'bun:test';
import { DEFAULT_GRANT_MODE, grantModelsFor } from '../src/features/fleet/grants';

describe('client key model grants', () => {
  it('defaults new client keys to every current and future model', () => {
    expect(DEFAULT_GRANT_MODE).toBe('all');
  });

  it('keeps an all grant dynamic by sending no model list', () => {
    // The backend checks the mode, not the list. An empty list is what lets a
    // key reach models added by a provider connection created later.
    expect(grantModelsFor('all', 'openai/', ['gpt-5.4'])).toEqual([]);
  });

  it('sends the exact selected ids when a key is restricted', () => {
    expect(grantModelsFor('list', 'openai/\nclaude-opus-4.7', ['gpt-5.4'])).toEqual([
      'gpt-5.4',
      'openai/',
      'claude-opus-4.7',
    ]);
  });
});
