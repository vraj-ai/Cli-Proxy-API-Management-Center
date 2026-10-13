export const parseModelGrantRules = (input: string, selected: string[] = []): string[] => [
  ...new Set([
    ...selected,
    ...input
      .split(/[\n,]/)
      .map((rule) => rule.trim())
      .filter(Boolean),
  ]),
];
