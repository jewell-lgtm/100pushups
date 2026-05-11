// Token values are sourced verbatim from `design/direction-b.jsx › const B`.
// Keep in sync if the design ref shifts.
export const colors = {
  bg: '#f5f0e8',
  surface: '#ffffff',
  surfaceAlt: '#ebe4d6',
  border: 'rgba(60,50,40,0.10)',
  ink: '#2a2520',
  inkDim: '#776a5a',
  inkFaint: '#a89e8d',
  sage: '#6b8a6e',
  sageSoft: '#a8c1a9',
  blush: '#d99878',
} as const;

export type ColorToken = keyof typeof colors;
