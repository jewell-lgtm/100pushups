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
  // When false the blob settles into the slow HAL breath — never frozen,
  // never dead. The two states share the slow breath; `active` layers on a
  // faster, smaller "talking" rhythm.
  active: boolean;
  // Base colour of the blob — outer halo + the gradient outer stop.
  color: string;
  // Brighter accent that the core gradient warms toward at the peak of each
  // breath. Falls back to `color` when omitted, but the HAL effect needs a
  // contrast so callers should pass one (sage vs sageSoft).
  accent?: string;
  width: number;
  height: number;
}

// Animated radial blob — "HAL eye." Four layers stacked back-to-front share a
// single slow breath (~4s period) and a faster talking rhythm gated to
// `active`. The breath drives:
//   • Subtle outer-halo radius swell (always alive — never freezes)
//   • Mid-ring opacity pulse (the "presence")
//   • Core gradient brightness — opacity blends 0.55 → 1.0 across the cycle
//   • Bright "iris" highlight that focuses (small + bright) and softens
//     (larger + dimmer) — the part that makes the eye feel like it's
//     watching back.
//
// Two clocks: `breath` runs forever on the UI thread; `talk` runs forever
// too but `talkAmp` (the multiplier we wrap it in) is tween-collapsed to 0
// when `active` is false so the static breath stays clean.
export function Waveform({
  active,
  color,
  accent,
  width,
  height,
}: WaveformProps) {
  // Monotonic seconds since mount — feeds both clocks.
  const t = useSharedValue(0);
  // Multiplier on the fast "talking" rhythm. Tweens 0 ↔ 1 so the transition
  // between idle breath and active morphing is continuous.
  const talkAmp = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    talkAmp.value = withTiming(active ? 1 : 0, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, talkAmp]);

  useFrameCallback((info) => {
    'worklet';
    const dtMs = info.timeSincePreviousFrame ?? 16;
    t.value += dtMs / 1000;
  });

  const cx = width / 2;
  const cy = height / 2;

  // Breath period ≈ 4.2s (2π / 1.5) — a deliberate "deep breath" cadence.
  // Talking rhythm is ~1.7Hz, fast enough to read as speech without buzzing.
  const BREATH_FREQ = 1.5;
  const TALK_FREQ = 10.5;

  // Outer halo — wider than the visual core. The halo's job is to give the
  // blob mass; it swells gently with the breath but never moves laterally.
  const outerProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ); // -1..1
    const talk = Math.sin(t.value * TALK_FREQ + 1.3) * talkAmp.value;
    const swell = 10 + 4 * talkAmp.value;
    return {
      r: height * 0.46 + breath * swell + talk * 2,
      opacity: 0.13 + 0.05 * (0.5 + 0.5 * breath),
    };
  });

  // Mid ring — slightly tighter, opacity does most of the work. This is the
  // "presence" layer; it gets denser at the peak of the breath.
  const midProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ + 0.6);
    const talk = Math.sin(t.value * TALK_FREQ * 0.7 + 0.4) * talkAmp.value;
    return {
      r: height * 0.38 + breath * (8 + 3 * talkAmp.value) + talk * 2,
      opacity: 0.20 + 0.12 * (0.5 + 0.5 * breath),
      cx: cx + Math.sin(t.value * 0.6) * 2,
      cy: cy + Math.cos(t.value * 0.8) * 2,
    };
  });

  // Core gradient blob — the body of the eye. Radius is fairly stable; the
  // gradient does the work via its parent opacity (we can't animate Stop
  // opacities on the UI thread with react-native-svg).
  const coreProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ + 1.2);
    const talk = Math.sin(t.value * TALK_FREQ * 1.1) * talkAmp.value;
    return {
      r: height * 0.32 + breath * (4 + 4 * talkAmp.value) + talk * 3,
      // Opacity is the "brightness" — 0.55 to 1.0 over the breath. This is
      // what makes the eye visibly "alive" even when nothing else is moving.
      opacity: 0.55 + 0.45 * (0.5 + 0.5 * breath),
    };
  });

  // Bright iris highlight — the small focal point inside the core. This is
  // the "watching back" layer: it CONTRACTS at peak-breath (focused gaze)
  // and softens / widens / dims at trough (relaxed gaze). Anti-correlated
  // with the core to read as a real iris.
  const irisProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ + 1.2);
    const talkJitter = Math.sin(t.value * TALK_FREQ * 1.3) * 2 * talkAmp.value;
    // Inverted: bigger at trough, tighter at peak.
    const focus = 0.5 - 0.5 * breath; // 0 at peak, 1 at trough
    return {
      r: height * 0.10 + focus * (height * 0.04) + talkJitter,
      // Brighter at peak, dimmer at trough. Reaches 1.0 momentarily.
      opacity: 0.5 + 0.5 * (0.5 + 0.5 * breath),
    };
  });

  // Stable gradient ids derived from the colour so two Waveform instances on
  // the same screen don't share `<defs>` and cope with SVG-id collisions.
  const baseId = color.replace(/[^a-z0-9]/gi, '');
  const coreGradId = `waveform-core-${baseId}`;
  const irisGradId = `waveform-iris-${baseId}`;
  const iris = accent ?? color;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <RadialGradient id={coreGradId} cx="50%" cy="50%">
          <Stop offset="0%" stopColor={iris} stopOpacity={0.85} />
          <Stop offset="55%" stopColor={color} stopOpacity={0.55} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={irisGradId} cx="50%" cy="50%">
          <Stop offset="0%" stopColor={iris} stopOpacity={1} />
          <Stop offset="70%" stopColor={iris} stopOpacity={0.4} />
          <Stop offset="100%" stopColor={iris} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <ACircle animatedProps={outerProps} cx={cx} cy={cy} fill={color} />
      <ACircle animatedProps={midProps} fill={color} />
      <ACircle animatedProps={coreProps} cx={cx} cy={cy} fill={`url(#${coreGradId})`} />
      <ACircle animatedProps={irisProps} cx={cx} cy={cy} fill={`url(#${irisGradId})`} />
    </Svg>
  );
}
