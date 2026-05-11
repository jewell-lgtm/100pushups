import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface KickerProps {
  children: string;
  // Defaults to inkFaint per most headers; the Onboarding screen variant uses
  // `tone="sage"` to match its more prominent "STEP 1 OF 3" pill.
  tone?: 'faint' | 'sage';
  style?: StyleProp<TextStyle>;
}

// The small uppercase tracking label that sits above every screen's H1.
// Letterspacing differs between the two tones — 0.15em for plain headers,
// 0.18em for the sage onboarding kicker — matching `direction-b.jsx` usage.
export function Kicker({ children, tone = 'faint', style }: KickerProps) {
  return (
    <Text
      style={[
        styles.base,
        tone === 'sage' ? styles.sage : styles.faint,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: font.sans,
    textTransform: 'uppercase',
  },
  faint: {
    color: colors.inkFaint,
    fontSize: 12,
    letterSpacing: 12 * 0.15,
  },
  sage: {
    color: colors.sage,
    fontSize: 11,
    letterSpacing: 11 * 0.18,
  },
});
