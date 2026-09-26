export const CLASS_OPTIONS = [
  ...Array.from({ length: 3 }, (_, level) =>
    ["A", "B", "C", "D", "E"].map(letter => `${level + 1}${letter}`)
  ).flat(),
  "S4", "S5", "S6", "Other",
];

export const isCurrentClass = (value: string) => CLASS_OPTIONS.includes(value);

// Presentation grouping only: never use this value as a student identity key.
export function displayClass(value: string): string {
  return /^[4-6][A-E]$/.test(value) ? `S${value[0]}` : value;
}
export function matchesClass(value: string, selected: string): boolean {
  return !selected || displayClass(value) === displayClass(selected);
}
