import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { font } from '../theme/type';
import { Card } from './Card';

interface CalloutCardProps {
  // Optional leading element — the Onboarding "Form over count" callout
  // uses a 44px sage circle with a checkmark svg. Pass any node; the
  // component just provides the slot + alignment.
  icon?: React.ReactNode;
  // The Fraunces title line ("Form over count").
  title: string;
  // The body line under the title. Inter inkDim 12.
  body: string;
}

// Card-with-icon used as a focused tip on the Onboarding final step.
// Composes the Card molecule with an inline icon slot — keeps the
// Onboarding screen from re-inventing the card+icon layout.
export function CalloutCard({ icon, title, body }: CalloutCardProps) {
  return (
    <Card>
      <View style={styles.row}>
        {icon != null && <View style={styles.iconSlot}>{icon}</View>}
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconSlot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flexShrink: 1,
  },
  title: {
    fontFamily: font.serif,
    fontSize: 17,
    color: colors.ink,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 12,
    color: colors.inkDim,
    marginTop: 2,
  },
});
