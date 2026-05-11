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
import { radii } from '../theme/radii';

interface FakeInputProps {
  // The placeholder/value text rendered in serif. Treat this as a display
  // affordance — actual text entry happens via a real <TextInput> elsewhere
  // (Onboarding uses this purely to communicate "you'll be typing here").
  value: string;
}

// Capsule with a blinking sage caret — the Onboarding "you'll type here"
// affordance. Mimics the appearance of a focused text input without
// accepting keyboard input. Real text capture happens via a separate
// `TextInput` when the screen advances to that step.
export function FakeInput({ value }: FakeInputProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 500 }),
        withTiming(1, { duration: 500 }),
      ),
      -1,
    );
  }, [opacity]);

  const caretStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.root}>
      <Text style={styles.value}>{value}</Text>
      <Animated.View style={[styles.caret, caretStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: {
    fontFamily: font.serif,
    fontSize: 18,
    color: colors.ink,
  },
  caret: {
    width: 2,
    height: 22,
    backgroundColor: colors.sage,
  },
});
