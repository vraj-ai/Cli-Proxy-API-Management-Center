import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { groupTodos, normalizeTodos, type Todo } from '../src/features/fleet/todos';
import { apiClient } from '../src/services/api/client';
import { fleetApi, normalizeTodosResponse } from '../src/services/api/fleet';

let getSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  getSpy?.mockRestore();
  getSpy = undefined;
});

const todo = (over: Partial<Todo>): Todo => ({
  id: 'id',
  project: 'proj',
  title: 'title',
  status: 'pending',
  updated_at: '2026-10-21T10:00:00Z',
  ...over,
});

describe('normalizeTodos', () => {
  test('reads a valid array and keeps safe links', () => {
    const raw = JSON.stringify([
      {
        id: 'a',
        project: 'fleet',
        title: 'Ship card',
        status: 'in_progress',
        updated_at: '2026-10-21T09:00:00Z',
        link: 'https://github.com/vraj-ai/x/pull/7',
      },
      {
        id: 'b',
        title: 'Old task',
        updated_at: '2026-10-20T09:00:00Z',
        link: 'http://example.com',
      },
    ]);

    const result = normalizeTodos(raw);

    expect(result.problem).toBeNull();
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0]).toEqual({
      id: 'a',
      project: 'fleet',
      title: 'Ship card',
      status: 'in_progress',
      updated_at: '2026-10-21T09:00:00Z',
      link: 'https://github.com/vraj-ai/x/pull/7',
    });
    expect(result.todos[1]?.project).toBe('unassigned');
    expect(result.todos[1]?.status).toBe('pending');
    expect(result.updatedAt).toBe('2026-10-21T09:00:00Z');
  });

  test('treats empty input as empty', () => {
    for (const raw of [undefined, null, '', '   ', 'null']) {
      const result = normalizeTodos(raw);
      expect(result.todos).toEqual([]);
      expect(result.updatedAt).toBeNull();
      expect(result.problem).toBe('empty');
    }
  });

  test('reports malformed JSON and non-array bodies', () => {
    for (const raw of ['not json', '{}', '{"a":1}', '"null"', '42']) {
      const result = normalizeTodos(raw);
      expect(result.todos).toEqual([]);
      expect(result.updatedAt).toBeNull();
      expect(result.problem).toBe('malformed');
    }
  });

  test('returns no problem for a valid empty array', () => {
    expect(normalizeTodos('[]')).toEqual({ todos: [], updatedAt: null, problem: null });
  });

  test('drops entries that are not objects or lack string id/title', () => {
    const raw = JSON.stringify([
      null,
      'text',
      42,
      [],
      { id: null, title: 'missing id' },
      { id: 'x', title: null },
      { id: 'ok', title: 'kept' },
    ]);

    const result = normalizeTodos(raw);

    expect(result.todos.map((item) => item.id)).toEqual(['ok']);
  });

  test('drops unsafe link schemes', () => {
    const raw = JSON.stringify([
      { id: 'js', title: 'x', link: 'javascript:alert(1)' },
      { id: 'data', title: 'x', link: 'data:text/html,hi' },
      { id: 'ftp', title: 'x', link: 'ftp://example.com' },
      { id: 'none', title: 'x' },
    ]);

    const { todos } = normalizeTodos(raw);

    expect(todos.every((item) => item.link === undefined)).toBe(true);
  });

  test('maps unknown or missing status to pending', () => {
    const raw = JSON.stringify([
      { id: 'a', title: 'x', status: 'done' },
      { id: 'b', title: 'x', status: null },
      { id: 'c', title: 'x', status: 'blocked_on_vraj' },
    ]);

    const { todos } = normalizeTodos(raw);

    expect(todos.map((item) => item.status)).toEqual(['pending', 'pending', 'blocked_on_vraj']);
  });

  test('updatedAt ignores invalid and missing timestamps', () => {
    const raw = JSON.stringify([
      { id: 'a', title: 'x', updated_at: 'nope' },
      { id: 'b', title: 'x' },
      { id: 'c', title: 'x', updated_at: '2026-10-19T00:00:00Z' },
    ]);

    expect(normalizeTodos(raw).updatedAt).toBe('2026-10-19T00:00:00Z');
    expect(normalizeTodos(JSON.stringify([{ id: 'a', title: 'x', updated_at: 'nope' }])).updatedAt).toBeNull();
  });
});

describe('groupTodos', () => {
  test('sorts projects alphabetically and statuses in workflow order', () => {
    const todos = [
      todo({ id: '1', project: 'beta', status: 'completed' }),
      todo({ id: '2', project: 'beta', status: 'pending' }),
      todo({ id: '3', project: 'alpha', status: 'completed' }),
      todo({ id: '4', project: 'alpha', status: 'in_progress' }),
      todo({ id: '5', project: 'alpha', status: 'blocked_on_vraj' }),
      todo({ id: '6', project: 'alpha', status: 'pending' }),
    ];

    const grouped = groupTodos(todos);

    expect(grouped.map((item) => item.project)).toEqual(['alpha', 'beta']);
    expect(grouped[0]?.groups.map((group) => group.status)).toEqual([
      'in_progress',
      'blocked_on_vraj',
      'pending',
      'completed',
    ]);
    expect(grouped[1]?.groups.map((group) => group.status)).toEqual(['pending', 'completed']);
  });

  test('omits empty status groups and sorts items newest first', () => {
    const todos = [
      todo({ id: 'old', project: 'p', updated_at: '2026-10-01T00:00:00Z' }),
      todo({ id: 'new', project: 'p', updated_at: '2026-10-21T00:00:00Z' }),
      todo({ id: 'mid', project: 'p', updated_at: '2026-10-10T00:00:00Z' }),
    ];

    const [project] = groupTodos(todos);

    expect(project?.groups).toHaveLength(1);
    expect(project?.groups[0]?.items.map((item) => item.id)).toEqual(['new', 'mid', 'old']);
  });

  test('returns no groups for no todos', () => {
    expect(groupTodos([])).toEqual([]);
  });
});

describe('normalizeTodosResponse', () => {
  test('coerces an object error to an empty string', () => {
    expect(normalizeTodosResponse({ raw: '[]', error: { message: 'boom' } })).toEqual({
      raw: '[]',
      fetched_at: '',
      stale: false,
      error: '',
    });
  });

  test('coerces a numeric raw to an empty string', () => {
    expect(normalizeTodosResponse({ raw: 42, fetched_at: 7, stale: 'yes' })).toEqual({
      raw: '',
      fetched_at: '',
      stale: false,
      error: '',
    });
  });

  test('returns an empty envelope for null, array, and string input', () => {
    for (const input of [null, [], '[{"id":"a"}]', 'text', 42, undefined]) {
      expect(normalizeTodosResponse(input)).toEqual({
        raw: '',
        fetched_at: '',
        stale: false,
        error: '',
      });
    }
  });

  test('keeps valid string fields and a boolean stale flag', () => {
    const payload = {
      raw: '[]',
      fetched_at: '2026-10-21T12:00:00Z',
      stale: true,
      error: 'todo file unreadable',
    };

    expect(normalizeTodosResponse(payload)).toEqual(payload);
  });
});

describe('fleetApi.todos', () => {
  test('loads the todo response and keeps stale/error flags', async () => {
    const payload = {
      raw: '[]',
      fetched_at: '2026-10-21T12:00:00Z',
      stale: true,
      error: 'todo file unreadable',
    };
    getSpy = spyOn(apiClient, 'get').mockResolvedValue(payload as never);

    const response = await fleetApi.todos();

    expect(getSpy).toHaveBeenCalledWith('/fleet/todos');
    expect(response).toEqual(payload);
    expect(normalizeTodos(response.raw).problem).toBeNull();
  });
});
