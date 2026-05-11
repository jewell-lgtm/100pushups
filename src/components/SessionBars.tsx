import { StyleSheet, Text, View } from 'react-native';
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
}

// Mini bar chart shared between the Complete screen sets summary and the
// Stats today's-sets card. Bars are sage-filled; tallest bar fills the row,
// every other bar scales by `reps[i] / max`. Render is intentionally
// stateless / static — the entrance animation lands in Phase 13.3.
export function SessionBars({ reps, height = 64, showLabels = true }: SessionBarsProps) {
  const max = reps.length === 0 ? 1 : Math.max(...reps, 1);

  return (
    <View>
      <View style={[styles.row, { height }]}>
        {reps.map((value, i) => {
          const ratio = value / max;
          return (
            <View key={i} style={styles.column}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${ratio * 100}%` },
                  ]}
                />
              </View>
            </View>
          );
        })}
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
