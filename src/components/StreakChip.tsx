import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface StreakChipProps {
  // The full label as a string ("Day twenty-three"). Spelt-out numbers are
  // a Breath-direction style choice — pass them already formatted.
  label: string;
}

// Small horizontal pill — sage dot + label — shown in the Workout
// header to anchor "what day of the streak this is."
export function StreakChip({ label }: StreakChipProps) {
  return (
    <View style={styles.root}>
      <View style={styles.dot} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.sage,
  },
  label: {
    fontFamily: font.sans,
    fontSize: 13,
    color: colors.inkDim,
  },
});
