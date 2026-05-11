import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

export interface CalendarDay {
  // Day-of-month displayed in the cell.
  day: number;
  // 0 = rest / no workout, 100 = full target hit, anything in between =
  // partial. Drives fill colour and the small "partial" dot.
  value: number;
  // When true, the cell renders an ink-coloured border to mark today.
  isToday?: boolean;
}

interface CalendarGridProps {
  // One entry per cell in row-major order, starting on Sunday by default.
  // `null` cells render as blank placeholders — used to pad the first week
  // so the 1st of the month lines up under the correct weekday column.
  cells: (CalendarDay | null)[];
  // Header strings, defaults to Sun-first (`S M T W T F S`) per the
  // reference. Pass a localised array for other week starts.
  weekdayLabels?: readonly string[];
}

const DEFAULT_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

// Month-grid component for the History screen. Pure visual primitive —
// the caller computes the `cells` array (including padding) from the
// month being viewed; this component doesn't know about dates.
// Sage when complete, sage-soft when partial (plus a small dot), faded
// surfaceAlt when a rest day.
export function CalendarGrid({
  cells,
  weekdayLabels = DEFAULT_WEEKDAYS,
}: CalendarGridProps) {
  return (
    <View>
      <View style={styles.weekRow}>
        {weekdayLabels.map((label, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (cell == null) {
            return <View key={i} style={styles.cellSlot} />;
          }
          const isComplete = cell.value >= 100;
          const isPartial = cell.value > 0 && cell.value < 100;
          const isRest = cell.value === 0;
          return (
            <View key={i} style={styles.cellSlot}>
              <View
                style={[
                  styles.cell,
                  isComplete && styles.cellComplete,
                  isPartial && styles.cellPartial,
                  isRest && styles.cellRest,
                  cell.isToday && styles.cellToday,
                ]}
              >
                <Text
                  style={[
                    styles.cellNumber,
                    isComplete && styles.cellNumberComplete,
                  ]}
                >
                  {cell.day}
                </Text>
                {isPartial && <View style={styles.partialDot} />}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const CELL_GAP = 6;

const styles = StyleSheet.create({
  weekRow: {
    flexDirection: 'row',
    marginBottom: CELL_GAP,
  },
  weekdayLabel: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: 10,
    color: colors.inkFaint,
    textAlign: 'center',
    letterSpacing: 10 * 0.1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cellSlot: {
    // Seven columns; the -ish gap subtraction approximates the 6px gap in the
    // CSS grid reference. Cell padding handles the rest.
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: CELL_GAP / 2,
  },
  cell: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  cellComplete: {
    backgroundColor: colors.sage,
  },
  cellPartial: {
    backgroundColor: colors.sageSoft,
  },
  cellRest: {
    backgroundColor: colors.surfaceAlt,
    opacity: 0.4,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  cellNumber: {
    fontFamily: font.serif,
    fontSize: 14,
    color: colors.ink,
  },
  cellNumberComplete: {
    color: colors.surface,
  },
  partialDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ink,
    opacity: 0.4,
  },
});
