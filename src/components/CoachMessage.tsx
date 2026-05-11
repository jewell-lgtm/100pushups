import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/colors';
import { font } from '../theme/type';
import { ThinkingDots } from './ThinkingDots';

interface CoachMessageProps {
  // The streamed-so-far text. Empty string is allowed during the
  // "thinking" pre-first-token state.
  text: string;
  // While streaming: a blinking ▍ caret renders at the end of the text.
  // Once the LLM finishes, pass `streaming={false}` to drop the caret.
  streaming: boolean;
  // True before the first token arrives — renders the bouncing dots in
  // place of any text. `text` is ignored when this is true.
  thinking: boolean;
}

// Serif coach text — the heart of the Workout transcript. Three states
// share the same slot to avoid layout jumps:
//   thinking → 3 bouncing dots
//   streaming → text + blinking caret
//   final → text only
// The caret is a tiny U+258D block (▍) blinked via Reanimated rather
// than a CSS keyframe so its threading matches the rest of the design
// system.
export function CoachMessage({ text, streaming, thinking }: CoachMessageProps) {
  const caretOpacity = useSharedValue(1);

  useEffect(() => {
    if (!streaming) {
      caretOpacity.value = 0;
      return;
    }
    caretOpacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 500 }),
        withTiming(1, { duration: 500 }),
      ),
      -1,
    );
  }, [streaming, caretOpacity]);

  const caretStyle = useAnimatedStyle(() => ({
    opacity: caretOpacity.value,
  }));

  if (thinking) {
    return (
      <View style={styles.thinkingSlot}>
        <ThinkingDots />
      </View>
    );
  }

  return (
    <Text style={styles.text}>
      {text}
      {streaming && (
        <Animated.Text style={[styles.caret, caretStyle]}>{'▍'}</Animated.Text>
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: font.serif,
    fontSize: 22,
    lineHeight: 22 * 1.35,
    color: colors.ink,
    letterSpacing: -0.22,
  },
  caret: {
    color: colors.ink,
    fontSize: 22,
  },
  thinkingSlot: {
    minHeight: 30,
    justifyContent: 'center',
  },
});
