import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface SessionBarsProps {
  // Rep counts for each set in display order, e.g. `[27, 22, 20, 16, 15]`.
  reps: number[];
  // Pixel height of the bar area. The label row adds ~16px below.
  height?: number;
  // When true, renders the per-bar rep number under each column (Complete
  // screen). When false, just the bars (compact use, future Stats variant).
  showLabels?: boolean;
  // When true, bars fade + grow up on mount, staggered 30ms apart.
  // Disable for tests or for re-mounts inside an existing layout to
  // avoid a re-animation flash on every prop change.
  animateIn?: boolean;
}

const BAR_ANIMATION_MS = 200;
const BAR_STAGGER_MS = 30;

// Mini bar chart shared between the Complete screen sets summary and the
// Stats today's-sets card. Tallest bar fills the row, the rest scale by
// `reps[i] / max`. Entrance animation fades + grows each bar in from
// the baseline, staggered 30ms apart, per Phase 13.3.
export function SessionBars({
  reps,
  height = 64,
  showLabels = true,
  animateIn = true,
}: SessionBarsProps) {
  const max = reps.length === 0 ? 1 : Math.max(...reps, 1);

  return (
    <View>
      <View style={[styles.row, { height }]}>
        {reps.map((value, i) => (
          <BarColumn
            key={i}
            ratio={value / max}
            delayMs={animateIn ? i * BAR_STAGGER_MS : 0}
            animateIn={animateIn}
          />
        ))}
      </View>
      {showLabels && (
        <View style={styles.labelRow}>
          {reps.map((value, i) => (
            <Text key={i} style={styles.label}>
              {value}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

interface BarColumnProps {
  ratio: number;
  delayMs: number;
  animateIn: boolean;
}

function BarColumn({ ratio, delayMs, animateIn }: BarColumnProps) {
  // 0 = not yet entered (collapsed + faded), 1 = fully present.
  // Seeded to 1 when `animateIn` is false so the bar renders at full
  // size without paying for an animation tick.
  const progress = useSharedValue(animateIn ? 0 : 1);

  useEffect(() => {
    if (!animateIn) {
      progress.value = 1;
      return;
    }
    progress.value = withDelay(
      delayMs,
      withTiming(1, {
        duration: BAR_ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [animateIn, delayMs, progress]);

  // Bars grow from the baseline rather than scaling from centre because
  // the parent uses `justifyContent: 'flex-end'`. Animating `height %`
  // is enough; no need for transform-origin gymnastics.
  const fillStyle = useAnimatedStyle(() => {
    const eased = progress.value;
    return {
      height: `${ratio * 100 * eased}%`,
      opacity: 0.2 + 0.8 * eased,
    };
  });

  return (
    <View style={styles.column}>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  column: {
    flex: 1,
    height: '100%',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    backgroundColor: colors.sage,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  label: {
    flex: 1,
    fontFamily: font.serif,
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
  },
});
