// Spacing scale from the Breath design — `direction-b.jsx › const B`.
// Numbers are unitless pixels (React Native style units = device-independent
// pixels, scaled by PixelRatio for physical output).
export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 14,
  5: 18,
  6: 22,
  7: 26,
} as const;

export type SpacingToken = keyof typeof spacing;
