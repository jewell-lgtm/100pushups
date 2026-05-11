// Font family names match the keys passed to `useFonts` in
// `app/_layout.tsx` (see 12.3). React Native treats each weight/style
// pair as its own family, so an italic or a different weight is a
// separate string — not a CSS-style `fontStyle: 'italic'` switch.
//
// Only the weights/styles currently used by the Breath design are loaded.
// Add more here (and to `useFonts`) if a screen needs them.
export const font = {
  serif: 'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansBold: 'Inter_700Bold',
  sansItalic: 'Inter_400Regular_Italic',
} as const;

export type FontKey = keyof typeof font;
