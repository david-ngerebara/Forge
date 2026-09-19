// src/components/CoachWorkoutCard.jsx
// Interactive workout shown inside the AI Coach chat: pre-workout, exercises with
// loggable sets, and post-workout. Saves to the same `workouts` table as the Train tab.
//
// Timed exercises (planks, wall sits, holds) run a guided flow:
//   rest ends -> 5 second "get ready" -> hold countdown -> set is logged automatically
//   -> rest -> next set. For timed exercises the "Reps" value is seconds.
//
// Pre-/post-workout items (child's pose, stretches...) that state a time get the same flow:
//   tap the timer button -> 5 second "get ready" -> countdown -> item is checked off automatically.
//   "each side" items run twice with a "switch sides" get-ready in between.
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Check, Plus, Timer, X, SkipForward, Trophy, Flame, Dumbbell, HeartPulse, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const READY_SECONDS = 5;
const TIMED_NAME = /plank|wall sit|dead hang|hollow hold|l-sit|isometric|\bhold\b/i;

const todayStr = () => new Date().toISOString().slice(0, 10);

// Uses the is_timed flag when present; falls back to the name for older cards.
const isTimedExercise = (ex) => ex.is_timed === true || (ex.is_timed == null && TIMED_NAME.test(ex.exercise_name || ''));

// ---------- timed pre-/post-workout items ----------
// Warm-up and cool-down items look like { name, detail, done }. If the detail (or name) states a time
// ("Hold 30 seconds each side", "1-2 minutes", "30s") the item gets a timer button. An explicit
// `seconds` (and optional `sides`) on the item wins over the text. Rep-based items ("10 slow reps",
// "5 per side") stay plain checkboxes. Static holds with no stated time (child's pose, "... stretch")
// default to 30 seconds. For a range like "30-45 seconds" the lower number is used; +15s extends it.
const TIME_RE = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?)?\s*-?\s*(seconds?|secs?|minutes?|mins?)\b/i;
const SHORT_SEC_RE = /\b(\d+)s\b/i;
const REPS_RE = /\b\d+\s*(?:reps?|repetitions?|times)\b|\b\d+\s*(?:per|each|every|\/)\s*(?:side|leg|arm)\b/i; // "10 reps", "5 per side"
const SIDES_RE = /\b(?:each|per|every)\s+(?:side|leg|arm|direction|foot|hand)\b|\/\s*(?:side|leg|arm)\b|\bboth\s+(?:sides|legs|arms)\b/i;
const STATIC_HOLD_NAME = /child'?s pose|\bpose\b|pigeon|stretch\b|\bhold\b/i;
const DEFAULT_ITEM_HOLD = 30;
const EXTEND_SECONDS = 15;

function parseItemTiming(item) {
  if (!item) return null;
  const text = `${item.detail || ''} ${item.name || ''}`;
  const sides = Number(item.sides) > 1 ? Number(item.sides) : (SIDES_RE.test(text) ? 2 : 1);
  const direct = Number(item.seconds ?? item.duration_sec);
  if (direct >= 5) return { seconds: Math.round(direct), sides };
  if (REPS_RE.test(text)) return null;
  let seconds = 0;
  const m = text.match(TIME_RE);
  if (m) {
    const n = parseFloat(m[1]);
    seconds = Math.round(/^m/i.test(m[2]) ? n * 60 : n);
  } else {
    const sh = text.match(SHORT_SEC_RE);
    if (sh) seconds = parseInt(sh[1], 10);
    else if (STATIC_HOLD_NAME.test(item.name || '')) seconds = DEFAULT_ITEM_HOLD;
  }
  if (seconds < 5 || seconds > 1800) return null;
  return { seconds, sides };
}

const fmtClock = (sec) => sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
const fmtItemDuration = ({ seconds, sides }) =>
  `${seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : seconds >= 60 ? fmtClock(seconds) : `${seconds}s`}${sides > 1 ? ' ×2' : ''}`;

// The next set that isn't done yet, in workout order, starting right after the set
// that was just finished (`after`). Only wraps back to earlier sets if nothing is left
// after it, so skipping around the workout doesn't send you back to the top.
function findNextSet(exercises, after = null) {
  const order = [];
  exercises.forEach((ex, exIdx) => {
    if (ex.skipped) return;
    ex.sets.forEach((s, setIdx) => order.push({ exIdx, setIdx, done: !!s.completed }));
  });
  if (order.length === 0) return null;
  const anchor = after ? order.findIndex(o => o.exIdx === after.exIdx && o.setIdx === after.setIdx) : -1;
  for (let k = 1; k <= order.length; k++) {
    const o = order[(anchor + k + order.length) % order.length];
    if (!o.done) return { exIdx: o.exIdx, setIdx: o.setIdx };
  }
  return null;
}

async function checkPRs(exercises, date) {
  const { data: existingRows } = await supabase.from('personal_records').select('*').order('date', { ascending: false }).limit(100);
  const existing = existingRows || [];
  const newPRs = [];
  for (const ex of exercises) {
    if (ex.skipped) continue;
    const top = (ex.sets || []).filter(s => s.completed && s.weight && s.reps).sort((a, b) => (b.weight * (1 + b.reps / 30)) - (a.weight * (1 + a.reps / 30)))[0];
    if (!top) continue;
    const e1rm = top.weight * (1 + top.reps / 30);
    const prev = existing.find(p => p.exercise_name === ex.exercise_name);
    if (!prev || e1rm > prev.value) {
      if (prev) await supabase.from('personal_records').update({ value: Math.round(e1rm), weight: top.weight, reps: top.reps, date }).eq('id', prev.id);
      else newPRs.push({ exercise_name: ex.exercise_name, record_type: 'estimated_1rm', value: Math.round(e1rm), weight: top.weight, reps: top.reps, date });
    }
  }
  if (newPRs.length) await supabase.from('personal_records').insert(newPRs);
}

export default function CoachWorkoutCard({ workout, unit = 'lb', onChange }) {
  // phase = { type: 'rest' | 'ready' | 'hold', exIdx, setIdx, total, startAt, endAt } or null.
  // A pre-/post-workout item timer instead carries { list: 'warmup' | 'cooldown', itemIdx, side, sides, seconds, switching }.
  const [phase, setPhase] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const audioRef = useRef(null);
  const lastBeepRef = useRef(null);

  const exercises = workout.exercises || [];
  const saved = !!workout.saved;

  // ---------- sound ----------
  // Browsers only allow sound after a tap, so this is called from tap handlers.
  const unlockAudio = () => {
    try {
      if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (audioRef.current.state === 'suspended') audioRef.current.resume();
    } catch (e) { /* sound is optional */ }
  };
  const beep = (freq = 880, ms = 150) => {
    try {
      const ctx = audioRef.current;
      if (ctx && ctx.state === 'running') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        gain.gain.value = 0.15;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + ms / 1000);
      }
    } catch (e) { /* sound is optional */ }
    try { navigator.vibrate?.(ms); } catch (e) { /* not supported on iPhone */ }
  };

  // ---------- timer engine ----------
  // Uses timestamps instead of counting ticks, so it stays accurate if the screen sleeps.
  useEffect(() => {
    if (!phase) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase && now >= phase.endAt) advance();
  }, [now, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Beeps for the last 3 seconds of "get ready".
  useEffect(() => {
    if (!phase || phase.type !== 'ready') { lastBeepRef.current = null; return; }
    const left = Math.ceil((phase.endAt - now) / 1000);
    if (left >= 1 && left <= 3 && lastBeepRef.current !== left) { lastBeepRef.current = left; beep(880, 120); }
  }, [now, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginReady = (exIdx, setIdx) => {
    const t = Date.now();
    setPhase({ type: 'ready', exIdx, setIdx, total: READY_SECONDS, startAt: t, endAt: t + READY_SECONDS * 1000 });
    setNow(t);
  };

  const beginHold = (exIdx, setIdx) => {
    const ex = exercises[exIdx];
    const seconds = Math.max(1, Number(ex.sets[setIdx]?.reps) || ex.target_reps_min || 30);
    const t = Date.now();
    setPhase({ type: 'hold', exIdx, setIdx, total: seconds, startAt: t, endAt: t + seconds * 1000 });
    setNow(t);
  };

  // Rest after a finished set. No rest if that was the last set of the workout.
  const beginRest = (exList, doneExIdx, doneSetIdx) => {
    const from = { exIdx: doneExIdx, setIdx: doneSetIdx };
    const next = findNextSet(exList, from);
    if (!next) { setPhase(null); return; }
    const total = exList[doneExIdx]?.rest_sec || 90;
    const t = Date.now();
    setPhase({ type: 'rest', exIdx: next.exIdx, setIdx: next.setIdx, from, total, startAt: t, endAt: t + total * 1000 });
    setNow(t);
  };

  // ----- pre-/post-workout item timers -----
  const setItemDone = (list, idx, done) => {
    onChange({ ...workout, [list]: (workout[list] || []).map((it, i) => i === idx ? { ...it, done } : it) }, true);
  };

  const beginItemReady = (list, itemIdx, side, timing, switching = false) => {
    const t = Date.now();
    setPhase({ type: 'ready', list, itemIdx, side, sides: timing.sides, seconds: timing.seconds, switching, total: READY_SECONDS, startAt: t, endAt: t + READY_SECONDS * 1000 });
    setNow(t);
  };

  const beginItemHold = (p) => {
    const t = Date.now();
    setPhase({ ...p, type: 'hold', switching: false, total: p.seconds, startAt: t, endAt: t + p.seconds * 1000 });
    setNow(t);
  };

  // End of a hold: go on to the other side if there is one, otherwise check the item off.
  const finishItem = (p) => {
    beep(1320, 500);
    if (p.side < p.sides) { beginItemReady(p.list, p.itemIdx, p.side + 1, { seconds: p.seconds, sides: p.sides }, true); return; }
    setItemDone(p.list, p.itemIdx, true);
    setPhase(null);
  };

  const startItemTimer = (list, idx) => {
    unlockAudio();
    const timing = parseItemTiming((workout[list] || [])[idx]);
    if (timing) beginItemReady(list, idx, 1, timing);
  };

  const extendHold = () => setPhase(p => p && { ...p, total: p.total + EXTEND_SECONDS, endAt: p.endAt + EXTEND_SECONDS * 1000 });

  const advance = () => {
    if (!phase) return;
    if (phase.list) {
      if (phase.type === 'ready') { beep(1320, 300); beginItemHold(phase); }
      else if (phase.type === 'hold') finishItem(phase);
      return;
    }
    if (phase.type === 'rest') {
      // If the next set is timed, go straight into the get-ready countdown.
      const next = findNextSet(exercises, phase.from);
      if (next && isTimedExercise(exercises[next.exIdx])) beginReady(next.exIdx, next.setIdx);
      else setPhase(null);
    } else if (phase.type === 'ready') {
      beep(1320, 300);
      beginHold(phase.exIdx, phase.setIdx);
    } else if (phase.type === 'hold') {
      finishHold(phase.total);
    }
  };

  const finishHold = (seconds) => {
    beep(1320, 500);
    const { exIdx, setIdx } = phase;
    const next = markSet(exIdx, setIdx, true, { reps: seconds });
    beginRest(next, exIdx, setIdx);
  };

  const skipRest = () => {
    const t = Date.now();
    setPhase(p => p && { ...p, endAt: t });
    setNow(t);
  };

  // ---------- editing ----------
  // `persist` = also save the card state to the conversation (skipped while typing).
  const setExercises = (next, persist = false, extra = {}) => onChange({ ...workout, ...extra, exercises: next }, persist);

  // Marks a set done/undone and returns the updated exercise list.
  const markSet = (exIdx, setIdx, completed, fields = {}) => {
    const next = exercises.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, ...fields, completed }),
    });
    setExercises(next, true, { started_at: workout.started_at || new Date().toISOString() });
    return next;
  };

  const updateSet = (exIdx, setIdx, field, value) => {
    const next = exercises.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value === '' ? null : Number(value) }),
    });
    setExercises(next, false);
  };

  const toggleSet = (exIdx, setIdx) => {
    unlockAudio();
    const willComplete = !exercises[exIdx].sets[setIdx].completed;
    const next = markSet(exIdx, setIdx, willComplete);
    if (willComplete) beginRest(next, exIdx, setIdx);
  };

  const startTimedSet = (exIdx, setIdx) => {
    unlockAudio();
    beginReady(exIdx, setIdx);
  };

  const addSet = (exIdx) => {
    const next = exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, weight: last?.weight ?? ex.target_weight, reps: last?.reps ?? ex.target_reps_min, rpe: null, rir: null, completed: false }] };
    });
    setExercises(next, true);
  };

  const toggleSkip = (exIdx) => {
    setExercises(exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, skipped: !ex.skipped }), true);
  };

  const toggleItem = (kind, idx) => {
    onChange({ ...workout, [kind]: (workout[kind] || []).map((it, i) => i === idx ? { ...it, done: !it.done } : it) }, true);
  };

  const active = exercises.filter(e => !e.skipped);
  const completedSets = active.flatMap(e => e.sets.filter(s => s.completed)).length;
  const totalSets = active.reduce((a, e) => a + e.sets.length, 0);

  const finish = async () => {
    if (completedSets === 0) { setError('Log at least one set first.'); return; }
    setPhase(null);
    setSaving(true); setError('');
    try {
      let totalVolume = 0, totalRepsDone = 0, totalSetsDone = 0;
      for (const ex of active) {
        for (const s of ex.sets) {
          if (s.completed) {
            totalVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
            totalRepsDone += Number(s.reps) || 0;
            totalSetsDone += 1;
          }
        }
      }
      const started = workout.started_at ? new Date(workout.started_at).getTime() : Date.now();
      const stats = {
        duration_min: Math.max(1, Math.round((Date.now() - started) / 60000)),
        total_volume: totalVolume, total_sets: totalSetsDone, total_reps: totalRepsDone,
      };
      const date = todayStr();
      const { data, error: insertError } = await supabase.from('workouts').insert({
        name: workout.name, focus: workout.focus || '', date, status: 'completed', exercises, ...stats,
      }).select().single();
      if (insertError) throw insertError;
      await checkPRs(exercises, date);
      onChange({ ...workout, ...stats, saved: true, workout_id: data.id }, true);
    } catch (e) {
      setError(e.message || 'Could not save the workout.');
    } finally { setSaving(false); }
  };

  // ---------- render ----------
  const remaining = phase ? Math.max(0, Math.ceil((phase.endAt - now) / 1000)) : 0;
  const itemInPhase = phase?.list ? (workout[phase.list] || [])[phase.itemIdx] : null;
  const overlayEx = phase && phase.type !== 'rest' && !phase.list ? exercises[phase.exIdx] : null;
  const showOverlay = !!(overlayEx || itemInPhase);
  const isReady = phase?.type === 'ready';
  const clockText = itemInPhase ? fmtClock(remaining) : String(remaining);
  const overlayTitle = itemInPhase ? itemInPhase.name : overlayEx?.exercise_name;
  const overlayLabel = isReady
    ? (phase.switching ? 'Switch sides' : 'Get ready')
    : (itemInPhase && !STATIC_HOLD_NAME.test(itemInPhase.name || '') ? 'Go' : 'Hold');
  let overlaySub = '';
  if (itemInPhase) {
    overlaySub = phase.list === 'warmup' ? 'Pre-workout' : 'Post-workout';
    if (phase.sides > 1) overlaySub += ` · Side ${phase.side} of ${phase.sides}`;
    if (isReady) overlaySub += ` · ${phase.seconds >= 60 ? fmtClock(phase.seconds) : `${phase.seconds} sec`}`;
  } else if (overlayEx) {
    overlaySub = `Set ${phase.setIdx + 1} of ${overlayEx.sets.length}${isReady ? ` · ${overlayEx.sets[phase.setIdx]?.reps || overlayEx.target_reps_min} sec hold` : ''}`;
  }
  const restNextEx = phase?.type === 'rest' ? exercises[phase.exIdx] : null;
  const progressPct = phase && phase.startAt ? Math.min(100, ((now - phase.startAt) / (phase.endAt - phase.startAt)) * 100) : 0;

  return (
    <div className="w-full space-y-3">
      {/* Rest timer */}
      {phase?.type === 'rest' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground pl-4 pr-3 py-2 rounded-2xl shadow-lg flex items-center gap-3 max-w-[92vw]">
          <div className="min-w-0 text-left">
            <p className="flex items-center gap-2 text-sm font-bold"><Timer className="w-4 h-4" /> Rest {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
            {restNextEx && <p className="text-[11px] opacity-90 truncate">Next: {restNextEx.exercise_name} · Set {phase.setIdx + 1}</p>}
          </div>
          <button onClick={skipRest} className="flex-shrink-0" title="Skip rest"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Get ready / hold countdown (full screen so it's readable from the floor).
          Portaled to document.body with an inline z-index so it always sits above the bottom nav. */}
      {showOverlay && createPortal(
        <div className="bg-background flex flex-col items-center justify-center text-center px-6" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }}>
          <p className={cn('text-sm font-bold uppercase tracking-widest', isReady ? 'text-muted-foreground' : 'text-primary')}>{overlayLabel}</p>
          <h2 className="text-2xl font-bold font-heading mt-2">{overlayTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">{overlaySub}</p>
          <p className="font-bold tabular-nums my-8 leading-none" style={{ fontSize: clockText.length > 3 ? '6rem' : '9rem' }}>{clockText}</p>
          <div className="w-full max-w-xs h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex gap-3 mt-10 w-full max-w-xs">
            <Button variant="secondary" className="flex-1 rounded-xl h-12" onClick={() => setPhase(null)}>Cancel</Button>
            {itemInPhase && phase.type === 'hold' && (
              <Button variant="secondary" className="flex-1 rounded-xl h-12" onClick={extendHold}>+{EXTEND_SECONDS}s</Button>
            )}
            {phase.type === 'hold' && (
              <Button className="flex-1 rounded-xl h-12 font-semibold" onClick={() => itemInPhase ? finishItem(phase) : finishHold(Math.max(1, Math.round((Date.now() - phase.startAt) / 1000)))}>Done</Button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Header */}
      <div className="rounded-3xl bg-card border border-border p-4">
        {workout.focus && <p className="text-xs font-bold uppercase tracking-wide text-primary">{workout.focus}</p>}
        <h3 className="text-lg font-bold mt-0.5">{workout.name}</h3>
        <p className="text-xs text-muted-foreground mt-1">{completedSets}/{totalSets} sets done</p>
      </div>

      {/* Pre-workout */}
      {(workout.warmup?.length > 0 || workout.pre_tip) && (
        <div className="rounded-3xl bg-card border border-border p-4">
          <SectionLabel icon={Flame} text="Pre-workout" />
          {workout.pre_tip && <p className="text-sm mb-2">{workout.pre_tip}</p>}
          {(workout.warmup || []).map((item, i) => (
            <CheckItem key={i} item={item} disabled={saved} onToggle={() => toggleItem('warmup', i)} timing={parseItemTiming(item)} onStart={() => startItemTimer('warmup', i)} />
          ))}
        </div>
      )}

      {/* Workout */}
      <div className="px-1"><SectionLabel icon={Dumbbell} text="Workout" /></div>
      {exercises.map((ex, exIdx) => {
        if (ex.skipped) {
          return (
            <div key={exIdx} className="rounded-2xl border border-dashed border-border p-4 opacity-60">
              <div className="flex justify-between items-center">
                <p className="font-semibold line-through">{ex.exercise_name}</p>
                {!saved && <button onClick={() => toggleSkip(exIdx)} className="text-xs text-primary font-semibold">Unskip</button>}
              </div>
            </div>
          );
        }
        const timed = isTimedExercise(ex);
        return (
          <div key={exIdx} className="rounded-3xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold">{ex.exercise_name}</h4>
                  <p className="text-xs text-muted-foreground capitalize">{ex.muscle_group} · {ex.target_sets}×{ex.target_reps_min}-{ex.target_reps_max}{timed ? ' sec' : ''} · RIR {ex.rir_target}</p>
                </div>
                {!saved && (
                  <button onClick={() => toggleSkip(exIdx)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center flex-shrink-0" title="Skip"><SkipForward className="w-3.5 h-3.5" /></button>
                )}
              </div>
              {ex.instructions && <p className="text-xs text-muted-foreground mt-2">{ex.instructions}</p>}
              {ex.form_cues?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ex.form_cues.map((c, i) => <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{c}</span>)}
                </div>
              )}
              {timed && !saved && <p className="text-[11px] text-primary font-medium mt-2">Timed exercise: tap play and a 5 second countdown starts the hold.</p>}
            </div>

            <div className="grid grid-cols-12 gap-1 px-4 py-2 text-[10px] font-bold uppercase text-muted-foreground">
              <div className="col-span-1">Set</div>
              <div className="col-span-4 text-center">{unit}</div>
              <div className="col-span-3 text-center">{timed ? 'Sec' : 'Reps'}</div>
              <div className="col-span-2 text-center">RIR</div>
              <div className="col-span-2 text-center">Done</div>
            </div>

            {ex.sets.map((s, sIdx) => (
              <div key={sIdx} className={cn('grid grid-cols-12 gap-1 px-4 py-1.5 items-center border-t border-border', s.completed && 'forge-done')}>
                <div className="col-span-1 text-sm font-bold text-muted-foreground">{s.set_number}</div>
                <div className="col-span-4"><input type="number" inputMode="decimal" disabled={saved} value={s.weight ?? ''} onChange={e => updateSet(exIdx, sIdx, 'weight', e.target.value)} placeholder={ex.target_weight || 0} className="w-full h-9 rounded-lg border border-input bg-background text-center text-sm" /></div>
                <div className="col-span-3"><input type="number" inputMode="decimal" disabled={saved} value={s.reps ?? ''} onChange={e => updateSet(exIdx, sIdx, 'reps', e.target.value)} placeholder={ex.target_reps_min} className="w-full h-9 rounded-lg border border-input bg-background text-center text-sm" /></div>
                <div className="col-span-2"><input type="number" inputMode="decimal" disabled={saved} value={s.rir ?? ''} onChange={e => updateSet(exIdx, sIdx, 'rir', e.target.value)} placeholder={ex.rir_target ?? 2} className="w-full h-9 rounded-lg border border-input bg-background text-center text-sm" /></div>
                <div className="col-span-2 flex justify-center">
                  {timed && !s.completed ? (
                    <button disabled={saved} onClick={() => startTimedSet(exIdx, sIdx)} className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-primary text-primary" title="Start timer"><Play className="w-4 h-4" /></button>
                  ) : (
                    <button disabled={saved} onClick={() => toggleSet(exIdx, sIdx)} className={cn('w-9 h-9 rounded-full flex items-center justify-center border-2 transition', s.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border')}><Check className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}

            {!saved && (
              <button onClick={() => addSet(exIdx)} className="w-full py-2.5 border-t border-border text-sm font-semibold text-primary flex items-center justify-center gap-1 hover:bg-accent/50"><Plus className="w-4 h-4" /> Add set</button>
            )}
          </div>
        );
      })}

      {/* Post-workout */}
      {(workout.cooldown?.length > 0 || workout.post_tip) && (
        <div className="rounded-3xl bg-card border border-border p-4">
          <SectionLabel icon={HeartPulse} text="Post-workout" />
          {(workout.cooldown || []).map((item, i) => (
            <CheckItem key={i} item={item} disabled={saved} onToggle={() => toggleItem('cooldown', i)} timing={parseItemTiming(item)} onStart={() => startItemTimer('cooldown', i)} />
          ))}
          {workout.post_tip && <p className="text-sm mt-2">{workout.post_tip}</p>}
        </div>
      )}

      {/* Finish */}
      {saved ? (
        <div className="rounded-3xl bg-card border border-border p-4 text-center">
          <Trophy className="w-6 h-6 text-primary mx-auto mb-1" />
          <p className="font-bold">Workout saved</p>
          <div className="grid grid-cols-4 gap-2 mt-3">
            <Stat label="Min" value={workout.duration_min} />
            <Stat label="Sets" value={workout.total_sets} />
            <Stat label="Reps" value={workout.total_reps} />
            <Stat label={`Vol (${unit})`} value={Math.round(workout.total_volume || 0).toLocaleString()} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">It's in your Train history.</p>
        </div>
      ) : (
        <div>
          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
          <Button onClick={finish} disabled={saving} className="w-full rounded-xl h-12 font-semibold">{saving ? 'Saving...' : 'Finish & save workout'}</Button>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{text}</span>
    </div>
  );
}

function CheckItem({ item, onToggle, disabled, timing, onStart }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggle} disabled={disabled} className="flex-1 min-w-0 flex items-center gap-3 py-2 text-left">
        <span className={cn('w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition', item.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border')}>
          {item.done && <Check className="w-3.5 h-3.5" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className={cn('block text-sm font-medium', item.done && 'line-through text-muted-foreground')}>{item.name}</span>
          {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
        </span>
      </button>
      {timing && !item.done && !disabled && (
        <button onClick={onStart} className="flex-shrink-0 h-9 pl-2.5 pr-3 rounded-full border-2 border-primary text-primary flex items-center gap-1 text-xs font-bold" title="Start timer">
          <Play className="w-3.5 h-3.5" />{fmtItemDuration(timing)}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return <div><p className="font-bold text-sm">{value}</p><p className="text-muted-foreground text-[10px]">{label}</p></div>;
}
