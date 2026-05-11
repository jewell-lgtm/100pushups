// shared.jsx — common building blocks for all three directions
// Voice-first conversation engine, waveforms, useTime hook, conversation scripts.

// ─────────────────────────────────────────────────────────────
// useTime — RAF-driven monotonic clock for animations
// ─────────────────────────────────────────────────────────────
function useTime(running = true) {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    if (!running) return;
    let raf, start = performance.now();
    const tick = (now) => { setT((now - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return t;
}

// ─────────────────────────────────────────────────────────────
// Conversation script — shared across all directions
// Each entry: { who: 'coach' | 'you', text, dur (ms to stream), state? }
// state: 'rest' starts a rest timer afterwards; 'set' shows set counter
// ─────────────────────────────────────────────────────────────
const SCRIPT = [
  { who: 'coach', text: "Morning. Ready to put 100 on the board?", dur: 1400 },
  { who: 'you',   text: "Yeah. Slept seven hours, shoulders feel okay." },
  { who: 'coach', text: "Good. Yesterday you did 25, 25, 20, 15, 15. Let's open with 27 today — small bump, still well within range. Tell me when you're set.", dur: 3200 },
  { who: 'you',   text: "Set." },
  { who: 'coach', text: "Go. I'll count out loud — focus on the chest, full lockout at the top.", dur: 2200, state: 'set', target: 27 },
  { who: 'coach', text: "27. Clean reps. 73 to go. Rest 60 seconds — breathe through the nose.", dur: 2400, state: 'rest', rest: 60 },
];

// ─────────────────────────────────────────────────────────────
// useConversation — drives the turn-based streaming chat
// Returns { messages, current, advance, state, restLeft, setReps }
// ─────────────────────────────────────────────────────────────
function useConversation() {
  const [idx, setIdx] = React.useState(0);
  const [streamed, setStreamed] = React.useState(""); // partial text of current coach message
  const [streaming, setStreaming] = React.useState(false);
  const [thinking, setThinking] = React.useState(false);
  const [history, setHistory] = React.useState([]);
  const [restLeft, setRestLeft] = React.useState(0);
  const [setReps, setSetReps] = React.useState(0);
  const restTimer = React.useRef(null);
  const setTimer = React.useRef(null);

  const current = SCRIPT[idx];

  // Auto-stream coach messages
  React.useEffect(() => {
    if (!current || current.who !== 'coach') return;
    setThinking(true); setStreamed(""); setStreaming(false);
    const thinkT = setTimeout(() => {
      setThinking(false); setStreaming(true);
      const total = current.text.length;
      const dur = current.dur || 1800;
      let i = 0;
      const step = () => {
        i += Math.max(1, Math.round(total / (dur / 30)));
        if (i >= total) { setStreamed(current.text); setStreaming(false); }
        else { setStreamed(current.text.slice(0, i)); streamT = setTimeout(step, 30); }
      };
      let streamT = setTimeout(step, 30);
    }, 700);
    return () => clearTimeout(thinkT);
  }, [idx]);

  // When coach msg has state, kick it off after streaming finishes
  React.useEffect(() => {
    if (!current || current.who !== 'coach' || streaming || thinking) return;
    if (current.state === 'rest' && restLeft === 0) {
      setRestLeft(current.rest);
      clearInterval(restTimer.current);
      restTimer.current = setInterval(() => {
        setRestLeft((r) => {
          if (r <= 1) { clearInterval(restTimer.current); return 0; }
          return r - 1;
        });
      }, 1000);
    }
    if (current.state === 'set' && setReps === 0) {
      clearInterval(setTimer.current);
      setTimer.current = setInterval(() => {
        setSetReps((r) => {
          if (r >= current.target) { clearInterval(setTimer.current); return r; }
          return r + 1;
        });
      }, 350);
    }
  }, [idx, streaming, thinking]);

  const advance = () => {
    if (current && current.who === 'coach' && (streaming || thinking)) return;
    const finished = SCRIPT[idx];
    if (finished) {
      setHistory((h) => [...h, { who: finished.who, text: finished.who === 'coach' ? finished.text : finished.text }]);
    }
    setSetReps(0); setRestLeft(0);
    setIdx((i) => (i + 1) % SCRIPT.length);
  };

  return { current, streamed, streaming, thinking, history, advance, restLeft, setReps, idx };
}

// ─────────────────────────────────────────────────────────────
// Waveform — three visual variants share this same data source
// variant: 'bars' | 'blob' | 'lines'
// ─────────────────────────────────────────────────────────────
function Waveform({ variant = 'bars', active = true, color = '#000', accent, width = 320, height = 120 }) {
  const t = useTime(active);
  const samples = 48;

  // Generate amplitude array — calmer when idle, bigger when active
  const amps = React.useMemo(() => Array.from({ length: samples }, (_, i) => i), []);
  const amp = (i) => {
    const base = active ? 0.55 : 0.12;
    const v = Math.sin(t * 6 + i * 0.4) * 0.3 + Math.sin(t * 11 + i * 0.7) * 0.25 + Math.sin(t * 3 + i) * 0.2;
    return Math.max(0.05, base + v * (active ? 0.45 : 0.06));
  };

  if (variant === 'bars') {
    const barW = (width - samples * 4) / samples;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {amps.map((i) => {
          const a = amp(i);
          const h = a * height * 0.95;
          return (
            <rect key={i}
              x={i * (barW + 4) + 2}
              y={(height - h) / 2}
              width={barW}
              height={h}
              rx={barW / 2}
              fill={accent && i % 3 === 1 ? accent : color}
              opacity={accent && i % 3 === 1 ? 1 : 0.85}
            />
          );
        })}
      </svg>
    );
  }

  if (variant === 'blob') {
    // Layered radial blob — three offset circles morphing
    const cx = width / 2, cy = height / 2;
    const r1 = height * 0.32 + Math.sin(t * 1.8) * 6;
    const r2 = height * 0.36 + Math.sin(t * 2.3 + 1) * 8;
    const r3 = height * 0.40 + Math.sin(t * 1.4 + 2) * 5;
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <radialGradient id={`g-${variant}-${color.replace('#','')}`} cx="50%" cy="50%">
            <stop offset="0%" stopColor={accent || color} stopOpacity="0.9"/>
            <stop offset="60%" stopColor={color} stopOpacity="0.5"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </radialGradient>
        </defs>
        <circle cx={cx + Math.sin(t*0.9)*4} cy={cy + Math.cos(t*1.1)*3} r={r3} fill={color} opacity="0.15"/>
        <circle cx={cx + Math.sin(t*1.3+1)*3} cy={cy + Math.cos(t*0.8+2)*4} r={r2} fill={color} opacity="0.25"/>
        <circle cx={cx} cy={cy} r={r1} fill={`url(#g-${variant}-${color.replace('#','')})`}/>
      </svg>
    );
  }

  if (variant === 'lines') {
    // Thin precision lines — symmetric around center, like an oscilloscope
    const cx = width / 2;
    const segW = width / samples;
    const top = amps.map((i) => {
      const a = amp(i);
      const x = i * segW + segW / 2;
      const y = height / 2 - a * height * 0.42;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const bot = amps.map((i) => {
      const a = amp(i);
      const x = i * segW + segW / 2;
      const y = height / 2 + a * height * 0.42;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1="0" y1={height/2} x2={width} y2={height/2} stroke={color} strokeWidth="0.5" opacity="0.2"/>
        <path d={top} fill="none" stroke={color} strokeWidth="1.2"/>
        <path d={bot} fill="none" stroke={color} strokeWidth="1.2"/>
        {accent && <circle cx={cx} cy={height/2} r="3" fill={accent}/>}
      </svg>
    );
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// ThinkingDots — three-dot indicator while LLM "thinks"
// ─────────────────────────────────────────────────────────────
function ThinkingDots({ color = '#888', size = 6 }) {
  return (
    <div style={{ display: 'inline-flex', gap: size * 0.7, alignItems: 'center' }}>
      {[0,1,2].map((i) => (
        <span key={i} style={{
          width: size, height: size, borderRadius: '50%', background: color,
          animation: `td-bounce 1.2s ${i * 0.15}s infinite ease-in-out`,
        }}/>
      ))}
      <style>{`@keyframes td-bounce { 0%,80%,100% { opacity:.3; transform:translateY(0); } 40% { opacity:1; transform:translateY(-3px); } }`}</style>
    </div>
  );
}

Object.assign(window, { useTime, useConversation, Waveform, ThinkingDots, SCRIPT });
