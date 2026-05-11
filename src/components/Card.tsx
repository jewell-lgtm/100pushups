import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';

interface CardProps {
  children: React.ReactNode;
  // `surface` (default) is the white card used for the PB, today's-sets,
  // Voice list, Toggles list, etc. `sage` is the sage-filled treatment used
  // by the History streak banner and the Complete-screen coach reflection.
  variant?: 'surface' | 'sage';
  // `lg` (18) is the standard card radius; `xl` (22) is reserved for the
  // larger hero cards like the Stats PB card. `md` covers settings rows.
  radius?: 'md' | 'lg' | 'xl';
  // Pass-through escape hatch for layout-specific tweaks (margins, padding
  // overrides, flex). The component sets sensible defaults — variant +
  // radius + 1px border + 18px padding — that `style` can override.
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// Neutral content container shared across every screen. Two visual variants:
// the white-surface card with a hairline border, and the sage-filled card
// with no border (used as an attention treatment). Padding is supplied as a
// default but is intentionally overridable since real cards vary 14–24px.
export function Card({
  children,
  variant = 'surface',
  radius = 'lg',
  style,
  testID,
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radii[radius] },
        variant === 'surface' ? styles.surface : styles.sage,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 18,
  },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sage: {
    backgroundColor: colors.sage,
  },
});
