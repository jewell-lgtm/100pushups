import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';
import { radii } from '../theme/radii';

interface ToggleRowProps {
  // Setting label ("Morning reminder", "Count out loud", etc).
  label: string;
  // Free-form value text rendered on the right in italic sage — "7:30 am",
  // "On", "Off". The Breath design doesn't use a hard boolean toggle UI;
  // it shows the current value as italic text and trusts the row's
  // `onPress` (or a future detail screen) to mutate it.
  value: string;
  // When the value reads as "off-like" — "Off", an empty string, "Never" —
  // the row dims the value to inkFaint instead of sage. Pass `true`
  // explicitly to take the muted styling; defaults to inferring from the
  // literal "Off" string so the common case is one prop.
  off?: boolean;
  // When true, the row gets a "soon" pill at the right edge — used for
  // toggles that are visually present but not yet wired (Phase 13.4
  // mentions the camera form-check + haptic rows might land this way).
  soon?: boolean;
  // First-in-group rows omit the top divider so they sit flush.
  showTopBorder?: boolean;
  // Optional handler; omitting it makes the row read as a static display
  // (still accessible, just not interactive).
  onPress?: (e: GestureResponderEvent) => void;
}

// Settings list row — label on the left, italic-sage value on the right.
// Designed to live inside a `Card` that supplies the outer chrome.
export function ToggleRow({
  label,
  value,
  off,
  soon = false,
  showTopBorder = true,
  onPress,
}: ToggleRowProps) {
  const isOff = off ?? value === 'Off';
  const interactive = onPress != null;

  return (
    <Pressable
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      disabled={!interactive}
      style={({ pressed }) => [
        styles.root,
        showTopBorder && styles.divided,
        pressed && interactive && styles.pressed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        {soon && (
          <View style={styles.soonPill}>
            <Text style={styles.soonText}>SOON</Text>
          </View>
        )}
        <Text
          style={[
            styles.value,
            isOff ? styles.valueOff : styles.valueOn,
          ]}
        >
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    fontFamily: font.sans,
    fontSize: 14,
    color: colors.ink,
    flexShrink: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontFamily: font.serifItalic,
    fontSize: 13,
  },
  valueOn: {
    color: colors.sage,
  },
  valueOff: {
    color: colors.inkFaint,
  },
  soonPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  soonText: {
    fontFamily: font.sans,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 10 * 0.1,
  },
});
