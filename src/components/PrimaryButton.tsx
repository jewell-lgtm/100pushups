import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface PrimaryButtonProps {
  // Visible label. Always wrapped in a `<Text>` internally.
  label: string;
  onPress?: (e: GestureResponderEvent) => void;
  // `filled` (default) — ink-black background, cream text — for primary CTAs.
  // `outlined` — transparent with a hairline border — for secondary actions
  // (e.g. "Reflect by voice" on the Complete screen).
  variant?: 'filled' | 'outlined';
  // When true, the press handler is suppressed and the button dims. The
  // Complete screen's "Reflect by voice" CTA ships disabled until voice
  // input lands (Phase 13.4).
  disabled?: boolean;
  // Optional trailing element. The onboarding CTA appends a small arrow svg;
  // pass it as `trailing` rather than via children so the label stays the
  // single source of truth for the visible text.
  trailing?: React.ReactNode;
  // Lets the parent size the button (e.g. flex: 1 inside a button row).
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

// The pill-shaped CTA used across every screen. Two visual variants share
// the same shape, padding, and label typography — only fill / border / text
// colour change.
export function PrimaryButton({
  label,
  onPress,
  variant = 'filled',
  disabled = false,
  trailing,
  style,
  testID,
}: PrimaryButtonProps) {
  const isFilled = variant === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        isFilled ? styles.filled : styles.outlined,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      testID={testID}
    >
      <Text style={[styles.label, isFilled ? styles.labelFilled : styles.labelOutlined]}>
        {label}
      </Text>
      {trailing != null && <View style={styles.trailing}>{trailing}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  filled: {
    backgroundColor: colors.ink,
  },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: font.sansMedium,
    fontSize: 15,
    letterSpacing: 15 * 0.02,
  },
  labelFilled: {
    color: colors.bg,
  },
  labelOutlined: {
    color: colors.ink,
  },
  trailing: {
    marginLeft: 2,
  },
});
