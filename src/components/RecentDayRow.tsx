import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface RecentDayRowProps {
  // Friendly day label ("Today · Mon", "Yesterday", "Saturday"). Free-form
  // so callers can mix relative and weekday forms without the row trying
  // to format dates itself.
  day: string;
  // Total reps for the day — rendered as the headline serif number on
  // the top-right.
  reps: number;
  // Optional one-line note carried over from the session reflection
  // ("Bumped first set to 27."). Rendered italic muted on the bottom-left.
  note?: string;
  // Set count for the day — left half of the bottom-right meta line.
  sets: number;
  // Human-readable elapsed time ("8 min", "9 min 20 s") — right half of
  // the bottom-right meta line.
  duration: string;
  // First-in-list rows can opt out of the top hairline so they sit flush
  // against the section heading.
  showBottomBorder?: boolean;
}

// History "Recent" list row. Two stacked horizontal rows:
//   top    — day label + serif rep count
//   bottom — italic note + "{sets} sets · {duration}" meta
// Hairline divider sits at the bottom of all but the last row.
export function RecentDayRow({
  day,
  reps,
  note,
  sets,
  duration,
  showBottomBorder = true,
}: RecentDayRowProps) {
  return (
    <View style={[styles.root, showBottomBorder && styles.divided]}>
      <View style={styles.row}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.reps}>{reps}</Text>
      </View>
      <View style={[styles.row, styles.metaRow]}>
        <Text style={styles.note} numberOfLines={1}>
          {note ?? ''}
        </Text>
        <Text style={styles.meta}>{`${sets} sets · ${duration}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: 14,
  },
  divided: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaRow: {
    marginTop: 4,
  },
  day: {
    fontFamily: font.sansMedium,
    fontSize: 14,
    color: colors.ink,
    flexShrink: 1,
  },
  reps: {
    fontFamily: font.serif,
    fontSize: 22,
    color: colors.ink,
  },
  note: {
    fontFamily: font.serifItalic,
    fontSize: 12,
    color: colors.inkDim,
    flexShrink: 1,
  },
  meta: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.inkFaint,
  },
});
