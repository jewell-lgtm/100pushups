import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface RestTimerProps {
  // Seconds remaining. Rendered as M:SS via `formatTime`. Passing 0 keeps
  // the timer mounted but renders "0:00" — the parent decides whether to
  // unmount entirely once rest is done.
  secondsLeft: number;
  // Threshold at which the timer warms from ink to blush as a gentle
  // "wrap it up" cue. Defaults to 5s; pass 0 to disable the warm-up.
  warningAtSeconds?: number;
}

const WARMUP_TWEEN_MS = 400;

// Big Fraunces countdown — "0:60" → "0:00" — with a subtle ink → blush
// colour warm in the final few seconds so the lifter feels the wrap-up
// without a beep. Composes onto the Waveform on the Workout screen
// (parent positions absolutely). Tabular numerals keep the digit width
// stable so "0:59" → "0:58" doesn't shift the layout left.
export function RestTimer({
  secondsLeft,
  warningAtSeconds = 5,
}: RestTimerProps) {
  // Drives an ink → blush interpolation when the timer crosses the warm
  // threshold. Separate from `secondsLeft` so the colour transition is
  // smooth instead of stepping with each tick.
  const warm = useSharedValue(secondsLeft <= warningAtSeconds ? 1 : 0);

  useEffect(() => {
    const shouldWarm = warningAtSeconds > 0 && secondsLeft <= warningAtSeconds;
    warm.value = withTiming(shouldWarm ? 1 : 0, {
      duration: WARMUP_TWEEN_MS,
      easing: Easing.inOut(Easing.quad),
    });
  }, [secondsLeft, warningAtSeconds, warm]);

  const numberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(warm.value, [0, 1], [colors.ink, colors.blush]),
  }));

  return (
    <View style={styles.root}>
      <Animated.Text style={[styles.number, numberStyle]}>
        {formatTime(secondsLeft)}
      </Animated.Text>
      <Text style={styles.caption}>REST · BREATHE</Text>
    </View>
  );
}

// `0:60` is preserved (not normalised to `1:00`) to match the design ref
// when the rest starts at exactly 60 seconds. Past 60 we move to mm:ss.
function formatTime(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  if (safe < 60) return `0:${safe.toString().padStart(2, '0')}`;
  if (safe === 60) return '0:60';
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    fontFamily: font.serif,
    fontSize: 56,
    lineHeight: 56,
    textAlign: 'center',
    // Tabular figures so each digit occupies the same advance width —
    // avoids horizontal jitter as the seconds tick down. The platform
    // falls back gracefully if the font lacks the feature.
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontFamily: font.sans,
    fontSize: 11,
    letterSpacing: 11 * 0.2,
    color: colors.inkDim,
    marginTop: 2,
  },
});
