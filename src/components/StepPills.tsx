import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

interface StepPillsProps {
  // Total number of steps in the flow.
  count: number;
  // Zero-based index of the currently active step.
  current: number;
}

const PILL_HEIGHT = 6;
const PILL_RADIUS = 3;
const PILL_INACTIVE_WIDTH = 6;
const PILL_ACTIVE_WIDTH = 22;
const PILL_GAP = 6;

// Onboarding progress indicator — small pills, the active one wider.
// Steps at-or-before `current` render sage; steps after render with the
// muted surfaceAlt fill. The 6 → 22 active-pill animation is wired in
// Phase 13.2; this component is the static visual.
export function StepPills({ count, current }: StepPillsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.pill,
            {
              width: i === current ? PILL_ACTIVE_WIDTH : PILL_INACTIVE_WIDTH,
              backgroundColor: i <= current ? colors.sage : colors.surfaceAlt,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: PILL_GAP,
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: PILL_RADIUS,
  },
});
