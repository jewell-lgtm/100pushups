import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';

interface TranscriptLineProps {
  // What the user said. Rendered already-quoted and italicised — pass the
  // raw transcript text without surrounding punctuation.
  text: string;
}

// Italic, muted, smart-quoted echo of the user's last spoken reply. Sits
// above the current `CoachMessage` in the Workout transcript to ground
// the conversation visually.
export function TranscriptLine({ text }: TranscriptLineProps) {
  return <Text style={styles.text}>{`“${text}”`}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontFamily: font.serifItalic,
    fontSize: 15,
    lineHeight: 15 * 1.45,
    color: colors.inkDim,
  },
});
