import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';

interface StepPillsProps {
  // Total number of steps in the flow.
  count: number;
  // Zero-based index of the currently active step.
  current: number;
}

const PILL_HEIGHT = 6;
const PILL_RADIUS = 3;
const PILL_INACTIVE_WIDTH = 6;
const PILL_ACTIVE_WIDTH = 22;
const PILL_GAP = 6;
const TRANSITION_MS = 300;

// Onboarding progress indicator. The active pill widens 6 → 22px and
// its fill cross-fades from surfaceAlt → sage; passed pills hold sage.
// Animation lands on the UI thread via Reanimated so the whole row stays
// 60fps even mid-scroll.
//
// Each pill is its own animated child so the row reflows naturally as
// widths change. The reflow is what creates the subtle "pillar shifts
// right" feeling you get when a step advances.
export function StepPills({ count, current }: StepPillsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => (
        <Pill key={i} isActive={i === current} isPassed={i <= current} />
      ))}
    </View>
  );
}

interface PillProps {
  isActive: boolean;
  isPassed: boolean;
}

function Pill({ isActive, isPassed }: PillProps) {
  // 0 = inactive, 1 = active. Width interpolates linearly; colour blends
  // surfaceAlt → sage. Passed (but not currently active) pills jump
  // directly to sage via the `colour` shared value seeded below.
  const width = useSharedValue(isActive ? PILL_ACTIVE_WIDTH : PILL_INACTIVE_WIDTH);
  const colourBlend = useSharedValue(isPassed ? 1 : 0);

  useEffect(() => {
    width.value = withTiming(
      isActive ? PILL_ACTIVE_WIDTH : PILL_INACTIVE_WIDTH,
      { duration: TRANSITION_MS, easing: Easing.out(Easing.cubic) },
    );
  }, [isActive, width]);

  useEffect(() => {
    colourBlend.value = withTiming(isPassed ? 1 : 0, {
      duration: TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [isPassed, colourBlend]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value,
    backgroundColor: interpolateColor(
      colourBlend.value,
      [0, 1],
      [colors.surfaceAlt, colors.sage],
    ),
  }));

  return <Animated.View style={[styles.pill, animatedStyle]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PILL_GAP,
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
  },
});
