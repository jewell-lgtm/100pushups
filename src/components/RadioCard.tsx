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

interface RadioCardProps {
  // Big serif label ("Calm teacher" / "Gym buddy" / "Drill sergeant").
  title: string;
  // Short Inter inkDim body line underneath.
  description: string;
  selected: boolean;
  onPress?: (e: GestureResponderEvent) => void;
}

// Selectable card row from the Settings personality picker. Title + body
// on the left, radio-style dot on the right; the whole row is the hit
// target. Selected state thickens the border to 1.5px sage and lights
// the radio circle's inner dot.
export function RadioCard({
  title,
  description,
  selected,
  onPress,
}: RadioCardProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        selected ? styles.rootSelected : styles.rootUnselected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View
        style={[
          styles.radioOuter,
          { borderColor: selected ? colors.sage : colors.inkFaint },
        ]}
      >
        {selected && <View style={styles.radioInner} />}
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
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  rootSelected: {
    borderWidth: 1.5,
    borderColor: colors.sage,
  },
  rootUnselected: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.85,
  },
  text: {
    flexShrink: 1,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 17,
    color: colors.ink,
  },
  description: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.inkDim,
    marginTop: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.sage,
  },
});
