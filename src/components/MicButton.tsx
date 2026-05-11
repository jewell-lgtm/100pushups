import { useEffect } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme/colors';

export type MicState = 'idle' | 'listening' | 'speaking';

interface MicButtonProps {
  // Drives the visual state. Maps to the Workout flow:
  //   idle      — "Tap when ready"
  //   listening — user is recording a reply (pulsing outer ring)
  //   speaking  — coach is talking; button dims to discourage interruption
  state: MicState;
  onPress?: (e: GestureResponderEvent) => void;
}

const BUTTON_SIZE = 76;
const PULSE_DURATION_MS = 1400;

// 76×76 ink-black circle from the Workout bottom dock. The animated layer
// is the listening-state pulse — an outer ring that scales 1.0 → 1.4 and
// fades 0.35 → 0 on a repeating 1.4s loop, giving the button a heartbeat
// while we're recording the user's reply.
//
// When `state === 'speaking'` the whole button dims to 60% so the user
// doesn't tap mid-coach-message (the listener would discard the audio
// anyway). The pulse ring is gated to listening only.
export function MicButton({ state, onPress }: MicButtonProps) {
  // 0 → 1 progresses through one pulse cycle. Repeats forever while
  // listening; pinned to 0 otherwise so the ring stays invisible.
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (state !== 'listening') {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: PULSE_DURATION_MS,
          easing: Easing.out(Easing.cubic),
        }),
        // Snap back to 0 so the next iteration starts from the centre
        // rather than continuing the expansion.
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );
  }, [state, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.35 * (1 - pulse.value),
    transform: [{ scale: 1 + 0.4 * pulse.value }],
  }));

  const buttonOpacity = state === 'speaking' ? 0.6 : 1;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.pulseRing, pulseStyle]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Voice input"
        accessibilityState={{ disabled: state === 'speaking' }}
        onPress={state === 'speaking' ? undefined : onPress}
        style={({ pressed }) => [
          styles.button,
          { opacity: buttonOpacity },
          pressed && state !== 'speaking' && styles.pressed,
        ]}
      >
        <MicGlyph />
      </Pressable>
    </View>
  );
}

function MicGlyph() {
  // Inline svg mic icon — keeps the design dependency-free of a font-icon
  // set. Path data lifted from `design/direction-b.jsx:83–86`.
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Rect x={8} y={2} width={6} height={12} rx={3} fill={colors.bg} />
      <Path
        d="M4 10v1a7 7 0 0 0 14 0v-1M11 18v3"
        stroke={colors.bg}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.sage,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    // RN doesn't honour box-shadow uniformly; the elevation prop covers
    // Android and the iOS shadow* props cover iOS. Both map to the
    // design's `0 10px 30px rgba(42,37,32,0.2)` drop shadow.
    elevation: 6,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
