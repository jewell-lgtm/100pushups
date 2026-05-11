import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface VoiceRowProps {
  // Display label for the voice. Free-form so callers can append flavour
  // (e.g. "River — warm, low") without the molecule prescribing a format.
  label: string;
  selected: boolean;
  // First-in-group rows omit the top border so they sit flush against the
  // parent Card's interior padding.
  showTopBorder?: boolean;
  onPress?: (e: GestureResponderEvent) => void;
}

// One row of the Settings voice picker. Avatar circle (sage-filled when
// selected, surfaceAlt otherwise) + label + uppercase "SELECTED" badge.
// Designed to live inside a Card that supplies the outer border.
export function VoiceRow({
  label,
  selected,
  showTopBorder = true,
  onPress,
}: VoiceRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        showTopBorder && styles.divided,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: selected ? colors.sage : colors.surfaceAlt,
          },
        ]}
      >
        <SpeakerGlyph color={selected ? colors.surface : colors.inkDim} />
      </View>
      <Text style={styles.label}>{label}</Text>
      {selected && <Text style={styles.badge}>SELECTED</Text>}
    </Pressable>
  );
}

function SpeakerGlyph({ color }: { color: string }) {
  // Tiny inline svg speaker icon — same shape as the design reference.
  return (
    <Svg width={13} height={13} viewBox="0 0 13 13" fill="none">
      <Path d="M3 4v5l4 2.5V1.5L3 4z" fill={color} />
      <Path
        d="M9 4.5a3 3 0 0 1 0 4"
        stroke={color}
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontFamily: font.sans,
    fontSize: 14,
    color: colors.ink,
  },
  badge: {
    fontFamily: font.sans,
    fontSize: 11,
    color: colors.sage,
    letterSpacing: 11 * 0.1,
  },
});
