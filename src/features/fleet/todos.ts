export const TODO_STATUSES = ['in_progress', 'blocked_on_vraj', 'pending', 'completed'] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export interface Todo {
  id: string;
  project: string;
  title: string;
  status: TodoStatus;
  updated_at: string;
  link?: string;
}

export interface TodoStatusGroup {
  status: TodoStatus;
  items: Todo[];
}

export interface TodoProjectGroup {
  project: string;
  groups: TodoStatusGroup[];
}

export interface NormalizedTodos {
  todos: Todo[];
  updatedAt: string | null;
  problem: 'empty' | 'malformed' | null;
}

const isStatus = (value: unknown): value is TodoStatus =>
  typeof value === 'string' && (TODO_STATUSES as readonly string[]).includes(value);

const isSafeLink = (value: unknown): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value);

const timeOf = (value: string): number => {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function normalizeTodo(input: unknown): Todo | null {
  if (!isRecord(input)) return null;
  const { id, title } = input;
  if (typeof id !== 'string' || typeof title !== 'string') return null;
  const updated_at = typeof input.updated_at === 'string' ? input.updated_at : '';
  return {
    id,
    project: typeof input.project === 'string' && input.project ? input.project : 'unassigned',
    title,
    status: isStatus(input.status) ? input.status : 'pending',
    updated_at,
    ...(isSafeLink(input.link) ? { link: input.link } : {}),
  };
}

const isEmptyRaw = (raw: unknown) =>
  raw === undefined ||
  raw === null ||
  (typeof raw === 'string' && ['', 'null'].includes(raw.trim()));

export function normalizeTodos(raw: unknown): NormalizedTodos {
  if (isEmptyRaw(raw)) return { todos: [], updatedAt: null, problem: 'empty' };
  if (typeof raw !== 'string') return { todos: [], updatedAt: null, problem: 'malformed' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { todos: [], updatedAt: null, problem: 'malformed' };
  }
  if (!Array.isArray(parsed)) return { todos: [], updatedAt: null, problem: 'malformed' };

  const todos: Todo[] = [];
  for (const entry of parsed) {
    const todo = normalizeTodo(entry);
    if (todo) todos.push(todo);
  }

  let updatedAt: string | null = null;
  let newest = Number.NEGATIVE_INFINITY;
  for (const todo of todos) {
    const time = timeOf(todo.updated_at);
    if (time > newest) {
      newest = time;
      updatedAt = todo.updated_at;
    }
  }
  return { todos, updatedAt, problem: null };
}

export function groupTodos(todos: Todo[]): TodoProjectGroup[] {
  const projects = new Map<string, Map<TodoStatus, Todo[]>>();
  for (const todo of todos) {
    const statuses = projects.get(todo.project) ?? new Map<TodoStatus, Todo[]>();
    const items = statuses.get(todo.status) ?? [];
    items.push(todo);
    statuses.set(todo.status, items);
    projects.set(todo.project, statuses);
  }

  return [...projects.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((project) => {
      const statuses = projects.get(project) ?? new Map<TodoStatus, Todo[]>();
      return {
        project,
        groups: TODO_STATUSES.filter((status) => statuses.has(status)).map((status) => ({
          status,
          items: [...(statuses.get(status) ?? [])].sort(
            (a, b) => timeOf(b.updated_at) - timeOf(a.updated_at)
          ),
        })),
      };
    });
}
