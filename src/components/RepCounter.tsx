import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface RepCounterProps {
  // Current rep count for the set in progress.
  reps: number;
  // Target the set is climbing toward — rendered in the "of {target}"
  // caption. Pass `undefined` to hide the caption entirely (open-ended
  // AMRAP-style sets).
  target?: number;
  // Optional contrasting colour. The reference web design uses
  // `mixBlendMode: 'difference'` to auto-contrast against the blob;
  // RN has no such blend mode, so pick a fixed colour with enough
  // contrast against the sage waveform. Defaults to ink (the recommended
  // contrast in Phase 12.4's note).
  color?: string;
}

const PULSE_MS = 220;
const PULSE_MAX = 1.08;

// Big Fraunces rep number with a subtle scale-pulse on each new rep —
// makes the count feel "alive" without distracting from the lift. Sits
// absolutely-positioned over the Waveform on the Workout screen during a
// set; the parent owns positioning, this molecule owns content.
export function RepCounter({ reps, target, color = colors.ink }: RepCounterProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    // Pulse on every change to `reps` — including the 0 → 1 transition
    // when the set starts. Reanimated `withSequence` runs serially so the
    // peak settles before the relax.
    scale.value = withSequence(
      withTiming(PULSE_MAX, {
        duration: PULSE_MS / 2,
        easing: Easing.out(Easing.cubic),
      }),
      withTiming(1, {
        duration: PULSE_MS / 2,
        easing: Easing.inOut(Easing.cubic),
      }),
    );
  }, [reps, scale]);

  const numberStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.root}>
      <Animated.Text style={[styles.number, { color }, numberStyle]}>
        {reps}
      </Animated.Text>
      {target != null && (
        <Text style={[styles.caption, { color }]}>{`OF ${target}`}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontFamily: font.serif,
    fontSize: 80,
    lineHeight: 80,
    letterSpacing: -1.6,
    textAlign: 'center',
  },
  caption: {
    fontFamily: font.sans,
    fontSize: 11,
    letterSpacing: 11 * 0.2,
    marginTop: 4,
    opacity: 0.85,
  },
});
