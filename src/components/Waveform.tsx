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

// The Waveform encodes turn-taking directly so the user can read whose
// turn it is at a glance, without looking at any text:
//
//   speaking  — the coach is talking. Iris CONTRACTS to a small, bright
//               focal point. A fast "talking" ripple layers on top of
//               the slow breath. Reads as "they're telling you something."
//
//   listening — the user is speaking; the coach is receiving. Iris
//               DILATES to a wide, soft halo (~2× speaking size). No
//               talking ripple; calm breath only. Reads as "they're
//               listening to you."
//
//   idle      — between turns / no conversation. Iris settles at a
//               middle size. Calm breath; no talking ripple.
//
// Transitions between modes tween 700ms so the eye glides between
// states rather than snapping.
export type WaveformMode = 'speaking' | 'listening' | 'idle';

interface WaveformProps {
  mode: WaveformMode;
  // Base colour of the blob — outer halo + outer gradient stop.
  color: string;
  // Brighter accent for the iris highlight + inner gradient stop. Falls
  // back to `color` if omitted, but the speaking/listening contrast is
  // clearer when the two differ (sage + sageSoft is the design pairing).
  accent?: string;
  width: number;
  height: number;
}

// Tween duration when switching turn modes. Long enough to feel calm,
// short enough that "your turn → my turn" is recognisable mid-glance.
const MODE_TWEEN_MS = 700;

// Slow breath drives "alive but at rest." Talking ripple is fast enough
// to read as speech without buzzing.
const BREATH_FREQ = 1.5; // 2π / 1.5 ≈ 4.2s period
const TALK_FREQ = 10.5;

// Iris radius coefficients, expressed as fractions of the blob height.
// The 2× contrast between SPEAKING and LISTENING is intentional — it's
// the primary cue for "whose turn it is."
const IRIS_BASE = 0.13;
const IRIS_CONTRACT = 0.06; // speaking pulls iris down to ~0.07
const IRIS_DILATE = 0.09;   // listening pushes iris up to ~0.22

export function Waveform({
  mode,
  color,
  accent,
  width,
  height,
}: WaveformProps) {
  // Monotonic seconds since mount.
  const t = useSharedValue(0);

  // Two amounts tween in parallel — exactly one is at 1 (or both at 0 for
  // idle). Driving them independently keeps the worklet math simple and
  // makes future modes (e.g. "thinking") trivial to add.
  const speakingAmount = useSharedValue(mode === 'speaking' ? 1 : 0);
  const listeningAmount = useSharedValue(mode === 'listening' ? 1 : 0);

  useEffect(() => {
    speakingAmount.value = withTiming(mode === 'speaking' ? 1 : 0, {
      duration: MODE_TWEEN_MS,
      easing: Easing.inOut(Easing.cubic),
    });
    listeningAmount.value = withTiming(mode === 'listening' ? 1 : 0, {
      duration: MODE_TWEEN_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [mode, speakingAmount, listeningAmount]);

  useFrameCallback((info) => {
    'worklet';
    const dtMs = info.timeSincePreviousFrame ?? 16;
    t.value += dtMs / 1000;
  });

  const cx = width / 2;
  const cy = height / 2;

  // Outer halo — slow swell, never freezes. Listening opens it slightly
  // wider as a secondary "ears open" cue beyond the iris.
  const outerProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ);
    const talk = Math.sin(t.value * TALK_FREQ + 1.3) * speakingAmount.value;
    const baseSwell = 10;
    const widen = listeningAmount.value * 6;
    return {
      r: height * 0.46 + widen + breath * baseSwell + talk * 2,
      opacity: 0.13 + 0.05 * (0.5 + 0.5 * breath),
    };
  });

  // Mid ring — "presence" pulse via opacity. Drifts laterally a couple of
  // pixels so the blob doesn't feel pinned.
  const midProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ + 0.6);
    const talk = Math.sin(t.value * TALK_FREQ * 0.7 + 0.4) * speakingAmount.value;
    return {
      r: height * 0.38 + breath * 8 + talk * 2,
      opacity: 0.20 + 0.12 * (0.5 + 0.5 * breath),
      cx: cx + Math.sin(t.value * 0.6) * 2,
      cy: cy + Math.cos(t.value * 0.8) * 2,
    };
  });

  // Core gradient blob — body of the eye. Brightness goes 0.55 → 1.0 over
  // the breath; speaking pumps a faster intensity on top.
  const coreProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ + 1.2);
    const talk = Math.sin(t.value * TALK_FREQ * 1.1) * speakingAmount.value;
    const pulseAmp = 0.45 + 0.15 * speakingAmount.value;
    return {
      r: height * 0.32 + breath * 4 + talk * 3,
      opacity: 0.55 + pulseAmp * (0.5 + 0.5 * breath),
    };
  });

  // The iris — the turn-state cue. Radius contrasts ~2× between speaking
  // and listening; opacity stays high when speaking (focused), softens
  // when listening (receptive).
  const irisProps = useAnimatedProps(() => {
    'worklet';
    const breath = Math.sin(t.value * BREATH_FREQ + 1.2);
    const talkJitter =
      Math.sin(t.value * TALK_FREQ * 1.3) * 2 * speakingAmount.value;

    // Base radius for the current mode (tweens between modes via the
    // shared amounts). At idle, both amounts are 0 → IRIS_BASE.
    const modeRadius =
      IRIS_BASE
      - speakingAmount.value * IRIS_CONTRACT
      + listeningAmount.value * IRIS_DILATE;

    // Layered breath: when speaking, the iris also "punches" with the
    // breath peak (focused gaze gets brighter at peak). When listening,
    // breath modulation is gentler and inverted (subtle, like the pupil
    // adjusting to incoming sound).
    const breathScale =
      0.5 + 0.5 * breath * (speakingAmount.value - listeningAmount.value * 0.4);

    return {
      r: height * modeRadius + height * 0.03 * breathScale + talkJitter,
      // Speaking → near full brightness; listening → softer; idle in
      // between. Tiny breath flicker layered on top.
      opacity:
        0.55
        + 0.4 * speakingAmount.value
        + 0.15 * listeningAmount.value
        + 0.1 * (0.5 + 0.5 * breath),
    };
  });

  // Stable gradient ids derived from the colour so two Waveform instances
  // on the same screen don't share `<defs>` and collide on SVG ids.
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
