import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

export interface StatItem {
  // Uppercase eyebrow label ("Previous", "Target", "Streak"). Rendered in
  // small Inter; case is preserved as-passed (the styling uppercases it).
  label: string;
  // The headline value. Plain string so callers can append units inline
  // ("23 d") without the molecule encoding unit conventions.
  value: string;
}

interface StatTripleProps {
  items: readonly [StatItem, StatItem, StatItem];
}

// Three-column row of label/value pairs separated above by a hairline
// border. Used at the bottom of the Stats PB card; could extend to any
// three-stat summary that wants the same rhythm.
export function StatTriple({ items }: StatTripleProps) {
  return (
    <View style={styles.row}>
      {items.map((item, i) => (
        <View key={i} style={styles.column}>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.value}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 14,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  column: {
    flexShrink: 1,
  },
  label: {
    fontFamily: font.sans,
    fontSize: 10,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 10 * 0.12,
  },
  value: {
    fontFamily: font.serif,
    fontSize: 22,
    color: colors.ink,
    marginTop: 2,
  },
});
