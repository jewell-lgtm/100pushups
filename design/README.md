# Handoff: 100 Pushups — "Breath" direction

## Overview
A voice-first iOS/Android app that coaches a user through 100 pushups per day using an LLM-driven, turn-based conversational interface. The user works out hands-free: the coach speaks, the user replies by voice, the coach adapts sets and pacing based on prior days. Conventional UI (stats, history, settings) surrounds the central chat experience.

This handoff covers **one of three explored directions — "Breath"**, the calm wellness aesthetic.

## About the Design Files
The files in this bundle are **design references created in HTML/React (Babel-transpiled JSX in the browser)** — prototypes showing intended look and behavior, **not production code to copy directly**.

The task is to recreate these designs in the target React Native codebase using its established patterns and libraries (navigation, styling, voice/audio, persistence).

Open `100 Pushups · B Breath.html` in a browser to see all six screens on a pan/zoom canvas. Click any screen's expand icon to focus it fullscreen. The Workout screen is interactive — tap the big mic button to advance the conversation and watch streaming/thinking states, the set counter, and the rest timer.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate pixel-close using your React Native styling system. The synthetic waveform math (see `shared.jsx › Waveform`) should be replaced with real audio amplitude data in production.

## Aesthetic direction — "Breath"
Calm, warm, considered. The opposite of a gamified fitness app.
- **Tone of coach:** Friendly gym buddy, but soft-spoken. Few words. Counts along during sets.
- **Type pairing:** Fraunces (serif, display) + Inter (sans, UI).
- **Color:** warm cream surfaces, sage green primary, ink-black text.
- **Voice indicator:** organic radial blob, not jagged bars.

## Screens (6)

### 1. Onboarding — baseline test (`B_OnboardingScreen`)
4-step flow on one screen, advanced via large pill button. Top: step pills (active is wider). Center: kicker label (sage, uppercase, tracking 0.18em), serif H1 (Fraunces 36/400), body copy (Inter 15, ink-dim). Step 2 & 3 show a "fake input" capsule with a blinking caret. Step 0 shows the blob. Step 3 shows a callout card with a sage circle icon and "Form over count" copy. Bottom: back arrow (56×56 outlined circle, hidden on step 0) + primary CTA (flex 1, ink-black pill).

### 2. Workout — main session (`B_WorkoutScreen`) — **the heart of the product**
- Header row: streak chip ("Day twenty-three") + time of day.
- **Hero blob (220px tall):** soft radial gradient circles morphing in sync. When the coach speaks, it animates more; when idle it gently breathes. When `state === 'set'`, the rep count overlays the blob in Fraunces 80 with `mixBlendMode: 'difference'`. When `state === 'rest'`, the timer ("0:60") overlays in serif with "REST · BREATHE" caption.
- **Transcript (last user reply + current coach message):** previous user reply is italic serif in muted color; current coach message streams in word-by-word in Fraunces 22, ink-black, with a blinking ▍ caret. While the LLM "thinks," show three bouncing dots.
- **Bottom voice control:** status label ("Listening" / "Coach is speaking" / "Tap when ready") then 76×76 ink-black circle button with mic icon.
- States cycle through the SCRIPT in `shared.jsx`: coach greeting → user reply → adaptive plan → user "set" → counting → coach feedback → rest → loop.

### 3. Session complete (`B_CompleteScreen`)
Header: "SESSION COMPLETE" kicker + duration. Body: huge "100" in Fraunces 132 with sage italic "done" beside it, then a serif reflection line ("Day twenty-three. That's three weeks unbroken."). Card 1: small bar chart of today's 5 sets (27,22,20,16,15). Card 2: sage-filled card with "FROM YOUR COACH" + a tomorrow-plan reflection paragraph + a small idle blob. Footer: two pill buttons — "Reflect by voice" (outlined) and "Done for today" (filled ink).

### 4. Stats — Personal Best (`B_StatsScreen`)
- Kicker + serif H1 "Personal best."
- PB card (white, 22px radius): "Single set, unbroken" eyebrow + huge "42" (Fraunces 96/400, letterspacing -0.04em) + italic sage "reps" + helper line "Set in one breath on April 28. Up four from your previous mark." + bottom row of three stats (Previous, Target, Streak) in serif.
- This-week bar chart, 7 bars, sage when 100, sageSoft when partial, today (last bar) at 0.5 opacity. Right-aligned "627 of 700" subtitle.
- Today card with 5 rows: index (serif), thin sage progress bar, rep count (Fraunces 18).

### 5. History (`B_HistoryScreen`)
- Header: kicker + "May 2026" + ‹ › month nav (circle outlined buttons).
- Streak banner: sage-filled card, "CURRENT STREAK 23 days" left, "Longest 31 d" right.
- Calendar grid: 7-col CSS grid, days labeled S M T W T F S, day cells 1:1 aspect, sage when complete, sageSoft when partial (with a small ink dot), surfaceAlt at 40% when rest. Today (day 11) has 2px ink border.
- Recent list: 3 rows (Today, Yesterday, Saturday). Each row: day label + serif rep count right, then italic note + sets/time meta below.

### 6. Settings — coach (`B_SettingsScreen`)
- Kicker + "Your coach" H1.
- **Personality** section: 3 radio-style cards (Calm teacher / Gym buddy [selected] / Drill sergeant). Selected card has sage border, white bg, sage radio dot.
- **Voice** section: grouped card with 3 rows (River/Sage/Wren). Selected row has sage circle icon + uppercase sage "SELECTED" badge.
- **Daily target** slider: 20–200 range, sage accent, default 100.
- Toggles list: Morning reminder (7:30 am), Count out loud (On), Form check with camera (On), Haptic on rep (Off). Each row shows the value in italic sage (or muted when off).

## Interactions & Behavior

### Voice flow (`shared.jsx › useConversation` + `SCRIPT`)
The prototype simulates the turn-based loop with a hardcoded SCRIPT. In production, replace with:
- **Coach turns:** stream from your LLM (Claude). Update the displayed text incrementally. Speak via TTS (`expo-speech` or platform native). The "thinking" dots show while waiting for first token. The blinking caret shows while streaming.
- **User turns:** start recording on tap (or auto when coach finishes). Show the live transcript inline (italic, quoted). Send to STT (`@react-native-voice/voice` or `expo-speech-recognition`).
- **Set state:** when the coach announces a set, switch to set mode. Use camera/sensor (or just a counter) to count reps. Display in the blob center.
- **Rest state:** count down from the coach-specified rest duration. Display in the blob center.

### Animations
- Blob: three offset circles, each radius driven by `sin(t * f + φ)` (see `shared.jsx › Waveform variant="blob"`).
- Streaming text caret: 1s blink.
- Step pills (onboarding): width transitions 6 → 22 on activation, 0.3s.

### State management
- `currentDay`, `streak`, `personalBest`, `dailyTarget` — persist to AsyncStorage/MMKV.
- `todaySets: number[]`, `conversationHistory: {who, text}[]` — per-day, persist locally; optionally sync.
- `personality`, `voice`, `target`, toggle prefs — persist to settings store.

## Design Tokens (from `direction-b.jsx › const B`)

```ts
const colors = {
  bg:        '#f5f0e8',  // warm cream — app background
  surface:   '#ffffff',  // cards
  surfaceAlt:'#ebe4d6',  // empty-state, inactive bar fill
  border:    'rgba(60,50,40,0.10)',
  ink:       '#2a2520',  // primary text
  inkDim:    '#776a5a',  // secondary text
  inkFaint:  '#a89e8d',  // tertiary/meta
  sage:      '#6b8a6e',  // primary accent
  sageSoft:  '#a8c1a9',  // accent secondary
  blush:     '#d99878',  // unused — reserve for warnings
};

const type = {
  serif: 'Fraunces',  // 300–700, opsz 9–144 — display, headings, large numbers
  sans:  'Inter',     // 400–700 — UI, body
};

const radii = { sm: 10, md: 14, lg: 18, xl: 22, pill: 9999 };
const spacing = { 1: 4, 2: 8, 3: 12, 4: 14, 5: 18, 6: 22, 7: 26 };
```

## React Native mapping

| Web (prototype) | React Native |
|---|---|
| `<div style>` | `<View style>` |
| Plain text in JSX | `<Text>` (RN requires all text wrapped) |
| `<button>` | `<Pressable>` |
| `<svg>` waveform | `react-native-svg` — copy JSX as-is, change imports |
| `style={{ gap }}` | RN 0.71+ supports gap |
| `mixBlendMode: 'difference'` (workout blob) | Use a contrasting color directly, or `@shopify/react-native-skia` if you need real blending |
| `linear-gradient` background | `expo-linear-gradient` |
| `Fraunces` / `Inter` fonts | `expo-font` (preload before splash dismisses) |
| `setTimeout` streaming | identical |
| `requestAnimationFrame` blob | `react-native-reanimated` `useFrameCallback` for 60fps |

### Suggested file layout in your RN repo
```
src/
  screens/
    OnboardingScreen.tsx       // → B_OnboardingScreen
    WorkoutScreen.tsx          // → B_WorkoutScreen (main)
    SessionCompleteScreen.tsx  // → B_CompleteScreen
    StatsScreen.tsx            // → B_StatsScreen
    HistoryScreen.tsx          // → B_HistoryScreen
    SettingsScreen.tsx         // → B_SettingsScreen
  components/
    Waveform.tsx               // blob variant only (drop bars/lines)
    ThinkingDots.tsx
    CalendarGrid.tsx
    SessionBars.tsx            // shared mini bar chart (Complete + Stats)
  hooks/
    useConversation.ts         // replace SCRIPT with real LLM/STT/TTS wiring
  theme/
    colors.ts, type.ts, radii.ts
```

## Files in this bundle
- `100 Pushups · B Breath.html` — entry point, open in a browser
- `direction-b.jsx` — all 6 screen components (B_* functions)
- `shared.jsx` — `useConversation`, `Waveform`, `ThinkingDots`, conversation `SCRIPT`
- `android-frame.jsx` — device chrome (status bar, gesture pill) — only for the prototype, do not port
- `design-canvas.jsx` — pan/zoom presentation shell — only for the prototype, do not port

## Out of scope for the port
- The pan/zoom canvas (`design-canvas.jsx`)
- The Android device frame (`android-frame.jsx`)
- The other two directions (Spotter, Reps) — not included in this bundle by design

## Open questions for the implementer
- Which voice/STT/TTS stack? (Expo Speech, Whisper, OpenAI Realtime, etc.)
- Camera-based form check on the workout screen — in scope for v1 or v2?
- Offline mode / does the LLM need to be cached or run locally for use mid-workout?
