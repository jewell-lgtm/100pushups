// direction-b.jsx — "BREATH" — Calm wellness
// Warm cream, sage accent, serif headings, organic blob

const B = {
  bg: '#f5f0e8',
  surface: '#ffffff',
  surfaceAlt: '#ebe4d6',
  border: 'rgba(60,50,40,0.10)',
  ink: '#2a2520',
  inkDim: '#776a5a',
  inkFaint: '#a89e8d',
  sage: '#6b8a6e',
  sageSoft: '#a8c1a9',
  blush: '#d99878',
  serif: '"Fraunces", "Cormorant Garamond", Georgia, serif',
  sans: '"Inter", "Helvetica Neue", system-ui, sans-serif',
};

function B_WorkoutScreen() {
  const conv = useConversation();
  const inSet = conv.current?.state === 'set';
  const inRest = conv.current?.state === 'rest';

  return (
    <div style={{ width:'100%', height:'100%', background: B.bg, color: B.ink, fontFamily: B.sans, display:'flex', flexDirection:'column' }}>
      {/* Soft header */}
      <div style={{ padding:'18px 22px 6px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:13, color: B.inkDim, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:7, height:7, borderRadius:4, background: B.sage }}/>
          Day twenty-three
        </div>
        <div style={{ fontSize:12, color: B.inkFaint, letterSpacing:'0.06em' }}>9:30 am</div>
      </div>

      {/* Hero blob — voice indicator */}
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', padding:'8px 0 0', height: 220, position:'relative' }}>
        <Waveform variant="blob" active={conv.current?.who === 'coach' && (conv.streaming || conv.thinking)} color={B.sage} accent={B.sageSoft} width={260} height={220}/>
        {inSet && (
          <div style={{ position:'absolute', textAlign:'center', color:'#fff', mixBlendMode:'difference' }}>
            <div style={{ fontFamily: B.serif, fontSize: 80, fontWeight: 400, lineHeight: 1, letterSpacing:'-0.02em' }}>{conv.setReps}</div>
            <div style={{ fontSize: 11, letterSpacing:'0.2em', textTransform:'uppercase', marginTop: 4, opacity: 0.85 }}>of {conv.current.target}</div>
          </div>
        )}
        {inRest && (
          <div style={{ position:'absolute', textAlign:'center' }}>
            <div style={{ fontFamily: B.serif, fontSize: 56, fontWeight: 400, color: B.ink, fontVariantNumeric:'tabular-nums' }}>0:{String(conv.restLeft).padStart(2,'0')}</div>
            <div style={{ fontSize: 11, letterSpacing:'0.2em', color: B.inkDim, textTransform:'uppercase', marginTop: 2 }}>rest · breathe</div>
          </div>
        )}
      </div>

      {/* Transcript */}
      <div style={{ flex:1, padding:'14px 28px 8px', display:'flex', flexDirection:'column', justifyContent:'flex-end', gap:14, overflow:'hidden' }}>
        {conv.history.slice(-1).map((m, i) => (
          <div key={i} style={{ fontSize: 13, color: B.inkFaint, lineHeight:1.5, fontStyle: m.who === 'you' ? 'italic':'normal' }}>
            {m.who === 'you' ? '“' : ''}{m.text}{m.who === 'you' ? '”' : ''}
          </div>
        ))}
        {conv.current && (
          conv.current.who === 'coach' ? (
            <div style={{ fontFamily: B.serif, fontSize: 22, lineHeight: 1.35, color: B.ink, fontWeight: 400, letterSpacing:'-0.01em', minHeight: 30, textWrap:'pretty' }}>
              {conv.thinking ? <ThinkingDots color={B.sage} size={7}/> :
                <>{conv.streamed}{conv.streaming && <span style={{ opacity:0.4 }}>▍</span>}</>
              }
            </div>
          ) : (
            <div style={{ fontSize: 15, color: B.inkDim, fontStyle:'italic', lineHeight:1.45 }}>“{conv.current.text}”</div>
          )
        )}
      </div>

      {/* Voice control */}
      <div style={{ padding:'8px 22px 22px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:11, color: B.inkFaint, letterSpacing:'0.15em', textTransform:'uppercase' }}>
          {conv.current?.who === 'you' ? 'Listening' : conv.streaming || conv.thinking ? 'Coach is speaking' : 'Tap when ready'}
        </div>
        <button onClick={conv.advance} style={{
          width: 76, height: 76, borderRadius: '50%', border:'none',
          background: B.ink, color: B.bg, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:'0 10px 30px rgba(42,37,32,0.2)',
        }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="8" y="2" width="6" height="12" rx="3" fill="currentColor" stroke="none"/>
            <path d="M4 10v1a7 7 0 0 0 14 0v-1M11 18v3"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

function B_StatsScreen() {
  const week = [{d:'Mon',v:100},{d:'Tue',v:100},{d:'Wed',v:85},{d:'Thu',v:100},{d:'Fri',v:100},{d:'Sat',v:100},{d:'Sun',v:42}];
  return (
    <div style={{ width:'100%', height:'100%', background: B.bg, color: B.ink, fontFamily: B.sans, display:'flex', flexDirection:'column', overflow:'auto' }}>
      <div style={{ padding:'24px 26px 8px' }}>
        <div style={{ fontSize:12, color: B.inkFaint, letterSpacing:'0.15em', textTransform:'uppercase' }}>Your practice</div>
        <h1 style={{ fontFamily: B.serif, fontSize: 34, fontWeight: 400, margin:'4px 0 0', letterSpacing:'-0.02em' }}>Personal best</h1>
      </div>

      {/* PB card */}
      <div style={{ margin:'18px 22px', padding:'24px 24px 22px', background: B.surface, borderRadius: 22, border:`1px solid ${B.border}` }}>
        <div style={{ fontSize:11, color: B.inkFaint, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:6 }}>Single set, unbroken</div>
        <div style={{ display:'flex', alignItems:'baseline', gap: 10 }}>
          <div style={{ fontFamily: B.serif, fontSize: 96, fontWeight: 400, lineHeight: 0.95, color: B.ink, letterSpacing:'-0.04em' }}>42</div>
          <div style={{ fontFamily: B.serif, fontSize: 22, color: B.sage, fontStyle:'italic' }}>reps</div>
        </div>
        <div style={{ fontSize:13, color: B.inkDim, marginTop:10, lineHeight:1.5 }}>
          Set in one breath on April&nbsp;28. Up four from your previous mark.
        </div>
        <div style={{ marginTop:18, paddingTop:14, borderTop:`1px solid ${B.border}`, display:'flex', justifyContent:'space-between' }}>
          {[['Previous','38'],['Target','45'],['Streak','23 d']].map(([k,v])=> (
            <div key={k}>
              <div style={{ fontSize:10, color: B.inkFaint, letterSpacing:'0.12em', textTransform:'uppercase' }}>{k}</div>
              <div style={{ fontFamily: B.serif, fontSize: 22, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Week */}
      <div style={{ margin:'4px 22px 14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:14 }}>
          <div style={{ fontFamily: B.serif, fontSize: 20 }}>This week</div>
          <div style={{ fontSize:12, color: B.inkDim }}>627 of 700</div>
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:84 }}>
          {week.map((d,i)=>(
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ flex:1, width:'100%', display:'flex', alignItems:'flex-end' }}>
                <div style={{ width:'100%', height:`${d.v}%`, background: d.v===100?B.sage:B.sageSoft, borderRadius:'4px 4px 2px 2px', opacity: i===6?0.5:1 }}/>
              </div>
              <div style={{ fontSize:10, color: B.inkFaint, letterSpacing:'0.08em' }}>{d.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Today */}
      <div style={{ margin:'8px 22px 26px', padding:'18px 20px', background: B.surface, borderRadius:18, border:`1px solid ${B.border}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:12 }}>
          <div style={{ fontFamily: B.serif, fontSize: 18 }}>Today's sets</div>
          <div style={{ fontSize:12, color: B.inkDim }}>5 sets · 100 reps</div>
        </div>
        {[27,22,20,16,15].map((reps,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderTop: i?`1px solid ${B.border}`:'none' }}>
            <div style={{ fontFamily: B.serif, fontSize:16, color: B.inkFaint, width:18 }}>{i+1}</div>
            <div style={{ flex:1, height:5, background: B.surfaceAlt, borderRadius: 3 }}>
              <div style={{ width:`${(reps/42)*100}%`, height:'100%', background: B.sage, borderRadius:3 }}/>
            </div>
            <div style={{ fontFamily: B.serif, fontSize: 18, width: 30, textAlign:'right' }}>{reps}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// B_OnboardingScreen — first-run, voice-led baseline test
// ─────────────────────────────────────────────────────────────
function B_OnboardingScreen() {
  const [step, setStep] = React.useState(0);
  const steps = [
    { kicker: 'Welcome', title: 'Let\'s find where you are today.', body: 'Three short questions, then one easy test. The whole thing takes four minutes.' },
    { kicker: 'Step 1 of 3', title: 'What\'s your name?', body: 'I\'ll keep it short and use it now and then.', input: 'Sam' },
    { kicker: 'Step 2 of 3', title: 'When would you like to train?', body: 'I\'ll nudge you once, gently, around this time.', input: '7:30 am' },
    { kicker: 'Step 3 of 3', title: 'Do as many pushups as you can, in one set.', body: 'I\'ll count out loud and stop you when your form breaks. This sets your starting line.' },
  ];
  const s = steps[step];
  return (
    <div style={{ width:'100%', height:'100%', background: B.bg, color: B.ink, fontFamily: B.sans, display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'24px 26px 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', gap: 6 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 3, background: i <= step ? B.sage : B.surfaceAlt, transition:'all .3s' }}/>
          ))}
        </div>
        <button style={{ background:'transparent', border:'none', color: B.inkFaint, fontSize: 13, fontFamily:'inherit', cursor:'pointer' }}>Skip</button>
      </div>

      <div style={{ flex:1, padding:'40px 26px 20px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div style={{ fontSize:11, color: B.sage, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 12 }}>{s.kicker}</div>
        <h1 style={{ fontFamily: B.serif, fontSize: 36, fontWeight: 400, lineHeight: 1.15, letterSpacing:'-0.02em', margin: 0, textWrap:'balance' }}>{s.title}</h1>
        <p style={{ fontSize: 15, color: B.inkDim, lineHeight: 1.55, marginTop: 16, textWrap:'pretty' }}>{s.body}</p>

        {s.input && (
          <div style={{ marginTop: 28, padding:'14px 18px', background: B.surface, borderRadius: 14, border:`1px solid ${B.border}`, fontSize: 18, fontFamily: B.serif, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>{s.input}</span>
            <span style={{ width: 2, height: 22, background: B.sage, animation:'b-blink 1s infinite' }}/>
          </div>
        )}

        {step === 0 && (
          <div style={{ marginTop: 32, display:'flex', justifyContent:'center' }}>
            <Waveform variant="blob" active={true} color={B.sage} accent={B.sageSoft} width={200} height={140}/>
          </div>
        )}

        {step === 3 && (
          <div style={{ marginTop: 28, padding:'18px 20px', background: B.surface, borderRadius: 18, border:`1px solid ${B.border}`, display:'flex', alignItems:'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: B.sage, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 10l5 5 9-10"/></svg>
            </div>
            <div>
              <div style={{ fontFamily: B.serif, fontSize: 17 }}>Form over count</div>
              <div style={{ fontSize: 12, color: B.inkDim, marginTop: 2 }}>Stop the second your hips sag. I'll catch it on camera.</div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding:'12px 22px 26px', display:'flex', gap: 10 }}>
        {step > 0 && (
          <button onClick={()=>setStep(step-1)} style={{ width: 56, height: 56, borderRadius: 28, border:`1px solid ${B.border}`, background:'transparent', cursor:'pointer', color: B.ink, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M11 3L5 9l6 6"/></svg>
          </button>
        )}
        <button onClick={()=>setStep((step+1) % steps.length)} style={{ flex:1, height: 56, borderRadius: 28, border:'none', background: B.ink, color: B.bg, cursor:'pointer', fontFamily: B.sans, fontSize: 15, fontWeight: 500, letterSpacing:'0.02em', display:'flex', alignItems:'center', justifyContent:'center', gap: 10 }}>
          {step === 0 ? 'Get started' : step === 3 ? 'I\'m ready · start counting' : 'Continue'}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>
        </button>
      </div>
      <style>{`@keyframes b-blink { 50% { opacity:0 } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// B_HistoryScreen — calendar of streaks + recent days
// ─────────────────────────────────────────────────────────────
function B_HistoryScreen() {
  // Build a month grid; some days complete, some partial, some empty
  const days = Array.from({ length: 31 }, (_, i) => {
    const d = i + 1;
    if (d < 8) return { d, v: 100 };
    if (d === 10) return { d, v: 0 }; // rest day
    if (d === 11) return { d, v: 100 };
    if (d === 17) return { d, v: 62 }; // partial
    if (d === 24) return { d, v: 0 };
    if (d > 24) return null;
    return { d, v: 100 };
  });
  // Pad to start on a Wednesday (3)
  const grid = [...Array(3).fill(null), ...days];

  return (
    <div style={{ width:'100%', height:'100%', background: B.bg, color: B.ink, fontFamily: B.sans, display:'flex', flexDirection:'column', overflow:'auto' }}>
      <div style={{ padding:'22px 26px 8px', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:12, color: B.inkFaint, letterSpacing:'0.15em', textTransform:'uppercase' }}>History</div>
          <h1 style={{ fontFamily: B.serif, fontSize: 30, fontWeight: 400, margin:'4px 0 0', letterSpacing:'-0.02em' }}>May 2026</h1>
        </div>
        <div style={{ display:'flex', gap: 4 }}>
          <button style={{ width:34, height:34, borderRadius:'50%', border:`1px solid ${B.border}`, background:'transparent', color: B.ink, cursor:'pointer' }}>‹</button>
          <button style={{ width:34, height:34, borderRadius:'50%', border:`1px solid ${B.border}`, background:'transparent', color: B.ink, cursor:'pointer' }}>›</button>
        </div>
      </div>

      {/* Streak banner */}
      <div style={{ margin:'14px 22px', padding:'18px 20px', background: B.sage, color:'#fff', borderRadius: 18, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, letterSpacing:'0.15em', textTransform:'uppercase' }}>Current streak</div>
          <div style={{ display:'flex', alignItems:'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontFamily: B.serif, fontSize: 44, lineHeight: 1 }}>23</span>
            <span style={{ fontFamily: B.serif, fontSize: 18, opacity: 0.85, fontStyle:'italic' }}>days</span>
          </div>
        </div>
        <div style={{ textAlign:'right', fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
          Longest<br/>
          <span style={{ fontFamily: B.serif, fontSize: 22, color:'#fff' }}>31 d</span>
        </div>
      </div>

      {/* Calendar */}
      <div style={{ padding: '0 22px' }}>
        <div style={{ display:'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
          {['S','M','T','W','T','F','S'].map((d,i)=> (
            <div key={i} style={{ fontSize:10, color: B.inkFaint, textAlign:'center', letterSpacing:'0.1em' }}>{d}</div>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {grid.map((d, i) => {
            if (!d) return <div key={i}/>;
            const isToday = d.d === 11;
            return (
              <div key={i} style={{
                aspectRatio: '1', borderRadius: 10,
                background: d.v === 100 ? B.sage : d.v > 0 ? B.sageSoft : B.surfaceAlt,
                color: d.v === 100 ? '#fff' : B.ink,
                opacity: d.v === 0 ? 0.4 : 1,
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily: B.serif, fontSize: 14,
                border: isToday ? `2px solid ${B.ink}` : 'none',
                position:'relative',
              }}>
                {d.d}
                {d.v > 0 && d.v < 100 && (
                  <div style={{ position:'absolute', bottom: 3, left: '50%', transform:'translateX(-50%)', width: 4, height: 4, borderRadius: 2, background: B.ink, opacity: 0.4 }}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent days */}
      <div style={{ padding:'20px 22px 26px' }}>
        <div style={{ fontFamily: B.serif, fontSize: 18, marginBottom: 10 }}>Recent</div>
        {[
          { day: 'Today · Mon', reps: 100, sets: 5, time: '8 min', note: 'Bumped first set to 27.' },
          { day: 'Yesterday', reps: 100, sets: 5, time: '9 min', note: 'Held form through all sets.' },
          { day: 'Saturday', reps: 100, sets: 6, time: '11 min', note: 'Shoulders tight, slower today.' },
        ].map((d, i) => (
          <div key={i} style={{ padding:'14px 0', borderBottom: i < 2 ? `1px solid ${B.border}` : 'none' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{d.day}</div>
              <div style={{ fontFamily: B.serif, fontSize: 22 }}>{d.reps}</div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop: 4 }}>
              <div style={{ fontSize: 12, color: B.inkDim, fontStyle:'italic' }}>{d.note}</div>
              <div style={{ fontSize: 11, color: B.inkFaint }}>{d.sets} sets · {d.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// B_CompleteScreen — post-session reflection
// ─────────────────────────────────────────────────────────────
function B_CompleteScreen() {
  return (
    <div style={{ width:'100%', height:'100%', background: B.bg, color: B.ink, fontFamily: B.sans, display:'flex', flexDirection:'column' }}>
      {/* Soft top */}
      <div style={{ padding:'24px 26px 0', display:'flex', justifyContent:'space-between' }}>
        <div style={{ fontSize:12, color: B.inkFaint, letterSpacing:'0.15em', textTransform:'uppercase' }}>Session complete</div>
        <div style={{ fontSize:12, color: B.inkFaint }}>8 min 12 s</div>
      </div>

      <div style={{ padding:'18px 26px 8px', textAlign:'left' }}>
        <div style={{ display:'flex', alignItems:'baseline', gap: 14 }}>
          <div style={{ fontFamily: B.serif, fontSize: 132, fontWeight: 400, lineHeight: 0.9, letterSpacing:'-0.05em', color: B.ink }}>100</div>
          <div style={{ fontFamily: B.serif, fontSize: 22, color: B.sage, fontStyle:'italic' }}>done</div>
        </div>
        <div style={{ fontFamily: B.serif, fontSize: 22, color: B.inkDim, marginTop: 4, lineHeight: 1.3, textWrap:'balance' }}>
          Day twenty‑three. That's three weeks unbroken.
        </div>
      </div>

      {/* Sets summary */}
      <div style={{ margin:'18px 22px 12px', padding:'18px 20px', background: B.surface, borderRadius: 18, border:`1px solid ${B.border}` }}>
        <div style={{ display:'flex', alignItems:'flex-end', gap: 6, height: 64 }}>
          {[27,22,20,16,15].map((reps, i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap: 4 }}>
              <div style={{ flex:1, width:'100%', display:'flex', alignItems:'flex-end' }}>
                <div style={{ width:'100%', height:`${(reps/27)*100}%`, background: B.sage, borderRadius:'4px 4px 2px 2px' }}/>
              </div>
              <div style={{ fontFamily: B.serif, fontSize: 14, color: B.ink }}>{reps}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: B.inkDim, textAlign:'center' }}>5 sets · descending — typical for you</div>
      </div>

      {/* Coach reflection */}
      <div style={{ flex:1, margin:'4px 22px 12px', padding:'18px 20px 14px', background: B.sage, color:'#fff', borderRadius: 18, display:'flex', flexDirection:'column' }}>
        <div style={{ fontSize:11, opacity: 0.7, letterSpacing:'0.15em', textTransform:'uppercase', marginBottom: 8 }}>From your coach</div>
        <div style={{ fontFamily: B.serif, fontSize: 18, lineHeight: 1.4, flex: 1, textWrap:'pretty' }}>
          Your opening set was the strongest in a week. Tomorrow, we'll try 28 first — same warm‑up, half a minute longer rest between two and three.
        </div>
        <div style={{ marginTop: 12, display:'flex', justifyContent:'center' }}>
          <Waveform variant="blob" active={false} color="#fff" accent={B.sageSoft} width={180} height={50}/>
        </div>
      </div>

      <div style={{ padding:'4px 22px 24px', display:'flex', gap: 10 }}>
        <button style={{ flex:1, height: 52, borderRadius: 26, border:`1px solid ${B.border}`, background:'transparent', color: B.ink, cursor:'pointer', fontFamily: B.sans, fontSize: 14, fontWeight: 500 }}>
          Reflect by voice
        </button>
        <button style={{ flex:1, height: 52, borderRadius: 26, border:'none', background: B.ink, color: B.bg, cursor:'pointer', fontFamily: B.sans, fontSize: 14, fontWeight: 500 }}>
          Done for today
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// B_SettingsScreen — coach personality, daily target, voice
// ─────────────────────────────────────────────────────────────
function B_SettingsScreen() {
  const [persona, setPersona] = React.useState(1); // gym buddy
  const [voice, setVoice] = React.useState(0);
  const [target, setTarget] = React.useState(100);

  const personas = [
    { name: 'Calm teacher', desc: 'Soft, measured. Few words.' },
    { name: 'Gym buddy', desc: 'Friendly, encouraging. Counts along.' },
    { name: 'Drill sergeant', desc: 'Direct, no nonsense.' },
  ];
  const voices = ['River — warm, low', 'Sage — neutral, clear', 'Wren — bright, quick'];

  return (
    <div style={{ width:'100%', height:'100%', background: B.bg, color: B.ink, fontFamily: B.sans, display:'flex', flexDirection:'column', overflow:'auto' }}>
      <div style={{ padding:'22px 26px 4px' }}>
        <div style={{ fontSize:12, color: B.inkFaint, letterSpacing:'0.15em', textTransform:'uppercase' }}>Settings</div>
        <h1 style={{ fontFamily: B.serif, fontSize: 30, fontWeight: 400, margin:'4px 0 0', letterSpacing:'-0.02em' }}>Your coach</h1>
      </div>

      {/* Coach persona */}
      <div style={{ margin:'18px 22px 8px' }}>
        <div style={{ fontSize: 12, color: B.inkDim, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom: 10 }}>Personality</div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          {personas.map((p, i) => (
            <button key={i} onClick={()=>setPersona(i)} style={{
              textAlign:'left', padding:'14px 18px', borderRadius: 14,
              border: i === persona ? `1.5px solid ${B.sage}` : `1px solid ${B.border}`,
              background: i === persona ? '#fff' : B.surface,
              cursor:'pointer', fontFamily:'inherit', color: B.ink,
              display:'flex', justifyContent:'space-between', alignItems:'center', gap: 12,
            }}>
              <div>
                <div style={{ fontFamily: B.serif, fontSize: 17 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: B.inkDim, marginTop: 2 }}>{p.desc}</div>
              </div>
              <div style={{ width: 20, height: 20, borderRadius: 10, border: `1.5px solid ${i === persona ? B.sage : B.inkFaint}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                {i === persona && <div style={{ width: 10, height: 10, borderRadius: 5, background: B.sage }}/>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Voice */}
      <div style={{ margin:'14px 22px 8px' }}>
        <div style={{ fontSize: 12, color: B.inkDim, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom: 10 }}>Voice</div>
        <div style={{ background: B.surface, borderRadius: 14, border:`1px solid ${B.border}` }}>
          {voices.map((v, i) => (
            <button key={i} onClick={()=>setVoice(i)} style={{
              width:'100%', padding:'14px 18px', borderTop: i ? `1px solid ${B.border}`:'none',
              background: 'transparent', border:'none', textAlign:'left', cursor:'pointer',
              fontFamily: 'inherit', color: B.ink, display:'flex', alignItems:'center', gap: 12,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: i === voice ? B.sage : B.surfaceAlt, color: i === voice ? '#fff' : B.inkDim, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor"><path d="M3 4v5l4 2.5V1.5L3 4z"/><path d="M9 4.5a3 3 0 0 1 0 4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <div style={{ flex:1, fontSize: 14 }}>{v}</div>
              {i === voice && <div style={{ fontSize:11, color: B.sage, letterSpacing:'0.1em', textTransform:'uppercase' }}>Selected</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Daily target */}
      <div style={{ margin:'14px 22px 8px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: B.inkDim, letterSpacing:'0.1em', textTransform:'uppercase' }}>Daily target</div>
          <div style={{ fontFamily: B.serif, fontSize: 22 }}>{target}<span style={{ fontSize: 13, color: B.inkDim, fontStyle:'italic', marginLeft: 4 }}>reps</span></div>
        </div>
        <input type="range" min="20" max="200" step="5" value={target} onChange={(e)=>setTarget(+e.target.value)} style={{ width:'100%', accentColor: B.sage }}/>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize: 10, color: B.inkFaint, marginTop: 4, letterSpacing:'0.08em' }}>
          <span>20</span><span>100</span><span>200</span>
        </div>
      </div>

      {/* Toggles */}
      <div style={{ margin:'14px 22px 26px', background: B.surface, borderRadius: 14, border:`1px solid ${B.border}` }}>
        {[
          ['Morning reminder', '7:30 am'],
          ['Count out loud', 'On'],
          ['Form check with camera', 'On'],
          ['Haptic on rep', 'Off'],
        ].map(([k,v], i) => (
          <div key={i} style={{ padding:'14px 18px', borderTop: i?`1px solid ${B.border}`:'none', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize: 14 }}>{k}</div>
            <div style={{ fontSize: 13, color: v === 'Off' ? B.inkFaint : B.sage, fontStyle:'italic' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { B_WorkoutScreen, B_StatsScreen, B_OnboardingScreen, B_HistoryScreen, B_CompleteScreen, B_SettingsScreen });
