export type SignupItemSuggestionGroup = {
  label: string;
  items: string[];
};

export const SIGNUP_ITEM_SUGGESTIONS: SignupItemSuggestionGroup[] = [
  {
    label: "Food",
    items: [
      "Chips & Dip",
      "Guacamole",
      "Salsa",
      "Nachos",
      "Pizza",
      "Wings",
      "Sliders",
      "Tacos",
      "Charcuterie Board",
      "Veggie Tray",
      "Fruit Tray",
      "Salad",
      "Cookies",
      "Brownies",
      "Cupcakes",
      "Ice Cream",
    ],
  },
  {
    label: "Drinks",
    items: [
      "Beer",
      "Wine",
      "Champagne",
      "Hard Seltzer",
      "Tequila",
      "Vodka",
      "Whiskey",
      "Rum",
      "Mixers",
      "Soda",
      "Sparkling Water",
      "Juice",
    ],
  },
];

export function normalizeSignupItemLabel(value: string) {
  return value.trim().toLowerCase();
}

export function usedSignupItemKeys(labels: string[]) {
  return new Set(labels.map(normalizeSignupItemLabel).filter(Boolean));
}

export function availableSignupSuggestions(usedLabels: string[]) {
  const used = usedSignupItemKeys(usedLabels);
  return SIGNUP_ITEM_SUGGESTIONS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !used.has(normalizeSignupItemLabel(item))),
  })).filter((group) => group.items.length > 0);
}
