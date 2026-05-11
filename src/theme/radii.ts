// Border radii from the Breath design.
// `pill` is the standard React Native idiom for fully-rounded buttons /
// status chips — any value larger than half the element's width works.
export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  pill: 9999,
} as const;

export type RadiusToken = keyof typeof radii;
