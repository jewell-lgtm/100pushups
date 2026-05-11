import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

interface ThinkingDotsProps {
  // Defaults to the sage accent — matches the Breath design's coach voice.
  color?: string;
  size?: number;
}

interface DotProps {
  delayMs: number;
  color: string;
  size: number;
}

// One dot animates 0 → 1 → 0 over 960ms, then idles 240ms — total 1.2s loop.
// Opacity blends 0.3 → 1.0, translateY blends 0 → -3 to mirror the CSS
// keyframes in `design/shared.jsx:207`. Each dot gets a 150ms phase offset.
function Dot({ delayMs, color, size }: DotProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 480, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 480, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 240 }),
        ),
        -1,
      ),
    );
  }, [delayMs, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * progress.value,
    transform: [{ translateY: -3 * progress.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animated,
      ]}
    />
  );
}

// Three bouncing dots — the "Coach is thinking" indicator shown while the
// LLM is pre-first-token. Lives in the Workout transcript area and the
// Complete-screen reflection card.
export function ThinkingDots({ color = colors.sage, size = 7 }: ThinkingDotsProps) {
  return (
    <View style={[styles.row, { gap: size * 0.7 }]}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delayMs={i * 150} color={color} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
