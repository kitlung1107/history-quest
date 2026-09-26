export const CLASS_OPTIONS = [
  ...Array.from({ length: 3 }, (_, level) =>
    ["A", "B", "C", "D", "E"].map(letter => `${level + 1}${letter}`)
  ).flat(),
  "S4", "S5", "S6", "Other",
];

export const isCurrentClass = (value: string) => CLASS_OPTIONS.includes(value);
