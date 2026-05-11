import { colors } from './colors';
import { font } from './type';
import { radii } from './radii';
import { spacing } from './spacing';

export const theme = {
  colors,
  font,
  radii,
  spacing,
} as const;

export type Theme = typeof theme;

export { colors, font, radii, spacing };
