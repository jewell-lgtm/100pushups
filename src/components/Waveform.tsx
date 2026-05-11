import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

// Animated mirrors of the SVG primitives so reanimated worklets can mutate
// their props on the UI thread without React re-renders.
const ACircle = Animated.createAnimatedComponent(Circle);

interface WaveformProps {
  // When true, the blob morphs at full amplitude (coach speaking / thinking).
  // When false, amplitude smoothly collapses to ~12% — an idle "breath" pulse.
  active: boolean;
  // Base colour of the blob — outer rings and the gradient stops.
  color: string;
  // Optional brighter accent for the gradient core. Defaults to `color`.
  accent?: string;
  width: number;
  height: number;
}

// Animated radial blob ported from `design/shared.jsx › Waveform variant="blob"`.
// Three offset circles, radii driven by sin(t * f + φ); when `active` is false,
// amplitude scales down to a slow breathing pulse instead of freezing — matches
// the Phase 12.4 spec.
export function Waveform({
  active,
  color,
  accent,
  width,
  height,
}: WaveformProps) {
  // Monotonic time in seconds, advanced by the frame callback on the UI thread.
  const t = useSharedValue(0);
  // Tweened multiplier on the sin amplitudes: 1 when active, 0.12 when idle.
  // Animating the scalar (not the booleans inside the worklet) keeps the
  // transition continuous so the blob doesn't snap to a different shape.
  const amp = useSharedValue(active ? 1 : 0.12);

  useEffect(() => {
    amp.value = withTiming(active ? 1 : 0.12, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, amp]);

  useFrameCallback((info) => {
    'worklet';
    const dtMs = info.timeSincePreviousFrame ?? 16;
    t.value += dtMs / 1000;
  });

  const cx = width / 2;
  const cy = height / 2;

  // Each circle: radius = base + sin(t * freq + phase) * swing * amp.
  // Numbers lifted from the reference (shared.jsx:148–164). The `0.40`-based
  // outer ring is widest; `0.32` is the inner gradient core.
  const outerProps = useAnimatedProps(() => {
    'worklet';
    const r = height * 0.4 + Math.sin(t.value * 1.4 + 2) * 5 * amp.value;
    return {
      r,
      cx: cx + Math.sin(t.value * 0.9) * 4 * amp.value,
      cy: cy + Math.cos(t.value * 1.1) * 3 * amp.value,
    };
  });

  const midProps = useAnimatedProps(() => {
    'worklet';
    const r = height * 0.36 + Math.sin(t.value * 2.3 + 1) * 8 * amp.value;
    return {
      r,
      cx: cx + Math.sin(t.value * 1.3 + 1) * 3 * amp.value,
      cy: cy + Math.cos(t.value * 0.8 + 2) * 4 * amp.value,
    };
  });

  const coreProps = useAnimatedProps(() => {
    'worklet';
    const r = height * 0.32 + Math.sin(t.value * 1.8) * 6 * amp.value;
    return { r };
  });

  // Stable gradient id derived from the colour so two Waveform instances on
  // the same screen don't share `<defs>` and cause SVG-id collisions.
  const gradId = `waveform-${color.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient id={gradId} cx="50%" cy="50%">
          <Stop offset="0%" stopColor={accent ?? color} stopOpacity={0.9} />
          <Stop offset="60%" stopColor={color} stopOpacity={0.5} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <ACircle animatedProps={outerProps} fill={color} opacity={0.15} />
      <ACircle animatedProps={midProps} fill={color} opacity={0.25} />
      <ACircle animatedProps={coreProps} cx={cx} cy={cy} fill={`url(#${gradId})`} />
    </Svg>
  );
}
