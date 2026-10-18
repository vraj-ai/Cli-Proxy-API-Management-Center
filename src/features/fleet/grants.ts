export const parseModelGrantRules = (input: string, selected: string[] = []): string[] => [
  ...new Set([
    ...selected,
    ...input
      .split(/[\n,]/)
      .map((rule) => rule.trim())
      .filter(Boolean),
  ]),
];

/**
 * An "all" grant is a dynamic allow-list: the backend checks only the mode, so
 * models added by a later provider connection are included without an update.
 * Sending an empty list is what keeps that mode dynamic.
 */
export const DEFAULT_GRANT_MODE = 'all' as const;

export const grantModelsFor = (
  mode: 'all' | 'list',
  rules: string,
  selected: string[] = []
): string[] => (mode === 'all' ? [] : parseModelGrantRules(rules, selected));
