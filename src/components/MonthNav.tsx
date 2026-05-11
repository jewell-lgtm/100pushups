import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface MonthNavProps {
  // Handlers — both optional; pass only one to render a single-direction
  // navigator (e.g. disabling forward navigation in the current month).
  onPrev?: (e: GestureResponderEvent) => void;
  onNext?: (e: GestureResponderEvent) => void;
}

// ‹ › month-stepper buttons used in the History screen header. Each is a
// 34px outlined circle; sits in `ScreenHeader.trailing`. When a handler
// is omitted the corresponding button dims and stops responding.
export function MonthNav({ onPrev, onNext }: MonthNavProps) {
  return (
    <View style={styles.row}>
      <NavButton glyph="‹" onPress={onPrev} accessibilityLabel="Previous month" />
      <NavButton glyph="›" onPress={onNext} accessibilityLabel="Next month" />
    </View>
  );
}

interface NavButtonProps {
  glyph: string;
  onPress?: (e: GestureResponderEvent) => void;
  accessibilityLabel: string;
}

function NavButton({ glyph, onPress, accessibilityLabel }: NavButtonProps) {
  const disabled = onPress == null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  button: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  glyph: {
    fontFamily: font.sans,
    fontSize: 16,
    color: colors.ink,
    // Visually centre the chevron glyph — they sit slightly above baseline
    // by default and look offset inside a circle.
    lineHeight: 18,
  },
});
