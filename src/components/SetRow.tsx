import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface SetRowProps {
  // 1-based set index (1, 2, 3…). Rendered in muted serif on the left.
  index: number;
  // Rep count for this set. Becomes the right-aligned headline number.
  reps: number;
  // Reference for the progress-bar width — usually the maximum set in the
  // session, or the PB the row is being compared against. The bar renders
  // `reps / max` of the row.
  max: number;
  // Whether to render a thin separator above the row — the first row in a
  // list omits this so it sits flush with the section title.
  showTopBorder?: boolean;
}

// One row in the Stats today's-sets list: muted serif index, a thin sage
// progress bar, then the rep count in serif on the right. Composes
// horizontally; cards above and below handle their own padding.
export function SetRow({ index, reps, max, showTopBorder = true }: SetRowProps) {
  const ratio = max <= 0 ? 0 : Math.min(1, reps / max);
  return (
    <View style={[styles.row, showTopBorder && styles.divided]}>
      <Text style={styles.index}>{index}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <Text style={styles.reps}>{reps}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  index: {
    fontFamily: font.serif,
    fontSize: 16,
    color: colors.inkFaint,
    width: 18,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.sage,
    borderRadius: 3,
  },
  reps: {
    fontFamily: font.serif,
    fontSize: 18,
    color: colors.ink,
    width: 30,
    textAlign: 'right',
  },
});
