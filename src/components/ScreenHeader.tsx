import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';
import { Kicker } from './Kicker';

interface ScreenHeaderProps {
  // Uppercase eyebrow rendered above the title. Optional — Onboarding's
  // header layout differs and supplies its own kicker inline.
  kicker?: string;
  // The Fraunces H1. Plain string keeps the molecule simple; multi-line
  // headers (Complete's huge "100 done") are bespoke and don't use this.
  title: string;
  // 30 (default) for Stats / History / Settings; 34 elevates the Stats PB
  // screen if a screen wants a heavier first impression.
  titleSize?: number;
  // Right-side slot — History uses it for the ‹ › month-nav buttons.
  // Sits baseline-aligned with the title.
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Kicker + Fraunces H1 paired in the layout shared by Stats / History /
// Settings. Trailing slot keeps the History month-nav inline with the
// title without forcing a separate "right cluster" abstraction.
export function ScreenHeader({
  kicker,
  title,
  titleSize = 30,
  trailing,
  style,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.text}>
        {kicker != null && <Kicker>{kicker}</Kicker>}
        <Text style={[styles.title, { fontSize: titleSize }]}>{title}</Text>
      </View>
      {trailing != null && <View style={styles.trailing}>{trailing}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  text: {
    flexShrink: 1,
  },
  title: {
    fontFamily: font.serif,
    color: colors.ink,
    marginTop: 4,
    letterSpacing: -0.6,
    lineHeight: undefined,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
