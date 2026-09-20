import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Check, Plus, X, Timer, SkipForward, RefreshCw, ArrowLeft, Trophy, Flame, Dumbbell, AlertTriangle, Play, Search, Shuffle, HeartPulse, Info } from 'lucide-react';
import ExerciseHowTo from '@/components/ExerciseHowTo';
import { cn } from '@/lib/utils';
import { estimateWorkout, toKg } from '@/lib/calorieEstimate';
import { buildWarmup, buildCooldown, parseItemTiming, fmtClock, fmtItemDuration, estimateRoutineMinutes, STATIC_HOLD_NAME, EXTEND_SECONDS } from '@/lib/warmupCooldown';

// Timed exercises (planks, wall sits, holds) run a guided flow:
//   rest ends -> 5 second "get ready" -> hold countdown -> set is logged automatically
//   -> rest -> next set. For timed exercises the "Reps" value is seconds.
//
// Pre-workout (warm-up) and post-workout (cool-down) items use the same flow: tap the timer button ->
// 5 second "get ready" -> countdown -> the item checks itself off. "Each side" items run twice with a
// "switch sides" get-ready in between. The routines come from src/lib/warmupCooldown.js.
const READY_SECONDS = 5;
const DEFAULT_HOLD = 30;
const TIMED_NAME = /plank|wall sit|dead hang|hollow hold|l-sit|isometric|\bhold\b/i;

// Uses the is_timed flag when present; falls back to the name.
const isTimedExercise = (ex) => ex.is_timed === true || (ex.is_timed == null && TIMED_NAME.test(ex.exercise_name || ''));

// Workouts made before timed support may prescribe a plank as "8-12 reps".
// Treat those as a 30-45 second hold so the countdown makes sense.
function normalizeTimed(w) {
  if (!w?.exercises) return w;
  return {
    ...w,
    exercises: w.exercises.map(ex => {
      if (!isTimedExercise(ex)) return ex;
      const looksLikeReps = (Number(ex.target_reps_max) || 0) < 15;
      if (!looksLikeReps) return { ...ex, is_timed: true };
      return {
        ...ex, is_timed: true, target_reps_min: DEFAULT_HOLD, target_reps_max: 45,
        sets: ex.sets.map(s => s.completed ? s : { ...s, reps: DEFAULT_HOLD }),
      };
    }),
  };
}

// Rough calories for only the sets actually completed (skipped exercises and unfinished sets are left out).
// It's an estimate, not a measurement.
function estimateCompleted(exercises, weightKg) {
  const done = (exercises || [])
    .filter(ex => !ex.skipped)
    .map(ex => ({ ...ex, sets: (ex.sets || []).filter(s => s.completed) }))
    .filter(ex => ex.sets.length > 0);
  if (done.length === 0) return { calories: 0, minutes: 0 };
  return estimateWorkout(done, weightKg || undefined);
}

// The next set that isn't done yet, in workout order, starting right after the set
// that was just finished (`after`). Only wraps back to earlier sets if nothing is left after it.
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

export default function ActiveWorkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showComplete, setShowComplete] = useState(false);
  const [showReplace, setShowReplace] = useState(null);
  const [howTo, setHowTo] = useState(null); // exercise whose "How to" sheet is open
  const openRoutineHowTo = (item) => setHowTo({ exercise_name: item.name, note: item.detail, kind: 'routine' }); // warm-up / cool-down rows
  // phase = { type: 'rest' | 'ready' | 'hold', exIdx, setIdx, from?, total, startAt, endAt } or null
  const [phase, setPhase] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [weightKg, setWeightKg] = useState(null); // latest logged body weight, for calorie estimates
  // Pre-/post-workout routines. Kept out of `workout` on purpose so they never get written back by the
  // generic workout updates (the workouts table may not have these columns yet).
  const [warmup, setWarmup] = useState([]);
  const [cooldown, setCooldown] = useState([]);
  const extrasSaved = useRef(false); // true when the workouts table has warmup/cooldown columns
  const audioRef = useRef(null);
  const lastBeepRef = useRef(null);
  const unit = profile?.units === 'metric' ? 'kg' : 'lb';
  const exercises = workout?.exercises || [];

  useEffect(() => {
    supabase.from('workouts').select('*').eq('id', id).maybeSingle().then(({ data: w }) => {
      const wn = normalizeTimed(w);
      setWorkout(wn);
      if (wn) {
        // Use the saved routine if there is one; otherwise build it (same picks every time for this workout).
        extrasSaved.current = 'warmup' in wn;
        const wu = Array.isArray(wn.warmup) && wn.warmup.length ? wn.warmup : buildWarmup(wn.exercises, wn.id);
        const cd = Array.isArray(wn.cooldown) && wn.cooldown.length ? wn.cooldown : buildCooldown(wn.exercises, wn.id);
        setWarmup(wu); setCooldown(cd);
        if (extrasSaved.current && !(wn.warmup?.length && wn.cooldown?.length)) saveExtras(wu, cd);
      }
      setLoading(false);
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body weight makes the calorie estimate a bit more personal; a generic default is used if none is logged.
  useEffect(() => {
    supabase.from('body_measurements').select('weight').order('date', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setWeightKg(data?.weight ? toKg(data.weight, profile?.units) : null))
      .catch(() => setWeightKg(null));
  }, [profile?.units]);

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
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
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
    const seconds = Math.max(1, Number(ex.sets[setIdx]?.reps) || ex.target_reps_min || DEFAULT_HOLD);
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
  const saveExtras = async (wu, cd) => {
    if (!extrasSaved.current) return; // no columns yet: progress lasts until you leave this screen
    try { await supabase.from('workouts').update({ warmup: wu, cooldown: cd }).eq('id', id); } catch (e) { /* not critical */ }
  };

  const setItemDone = (list, idx, done) => {
    const mark = (arr) => arr.map((it, i) => i === idx ? { ...it, done } : it);
    if (list === 'warmup') { const next = mark(warmup); setWarmup(next); saveExtras(next, cooldown); }
    else { const next = mark(cooldown); setCooldown(next); saveExtras(warmup, next); }
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
    const timing = parseItemTiming((list === 'warmup' ? warmup : cooldown)[idx]);
    if (timing) beginItemReady(list, idx, 1, timing);
  };

  const toggleItem = (list, idx) => {
    const item = (list === 'warmup' ? warmup : cooldown)[idx];
    setItemDone(list, idx, !item.done);
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
  const persist = async (updated) => {
    setWorkout(updated);
    await supabase.from('workouts').update({ exercises: updated.exercises, status: updated.status }).eq('id', id);
  };

  // Marks a set done/undone, saves, and returns the updated exercise list.
  const markSet = (exIdx, setIdx, completed, fields = {}) => {
    const nextExercises = exercises.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, ...fields, completed }),
    });
    persist({ ...workout, exercises: nextExercises, status: workout.status === 'planned' ? 'in_progress' : workout.status });
    return nextExercises;
  };

  const updateSet = (exIdx, setIdx, field, value) => {
    setWorkout({
      ...workout,
      exercises: exercises.map((ex, i) => i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value === '' ? null : Number(value) }),
      }),
    });
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

  const addSet = async (exIdx) => {
    const nextExercises = exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const last = ex.sets[ex.sets.length - 1];
      return { ...ex, sets: [...ex.sets, { set_number: ex.sets.length + 1, weight: last?.weight ?? ex.target_weight, reps: last?.reps ?? ex.target_reps_min, rpe: null, rir: null, completed: false }] };
    });
    await persist({ ...workout, exercises: nextExercises });
  };

  const setSkipped = async (exIdx, skipped) => {
    await persist({ ...workout, exercises: exercises.map((ex, i) => i !== exIdx ? ex : { ...ex, skipped }) });
  };

  // `row` is a real exercise from the exercises table (picked in ReplaceModal), so the swapped-in
  // exercise gets its true name, muscle group, equipment, timed flag, cues and rest time.
  const replaceExercise = async (exIdx, row) => {
    const nextExercises = exercises.map((ex, i) => {
      if (i !== exIdx) return ex;
      const { alternatives, ...rest } = ex; // drop any stale AI-suggested alternatives
      const timed = !!row.is_timed;
      const sameKind = timed === isTimedExercise(ex); // keep the rep/second target if reps stay reps (or seconds stay seconds)
      const repsMin = (sameKind && ex.target_reps_min) || row.default_reps_min || (timed ? DEFAULT_HOLD : 10);
      const repsMax = (sameKind && ex.target_reps_max) || row.default_reps_max || (timed ? Math.max(repsMin, 45) : repsMin + 2);
      return {
        ...rest,
        exercise_name: row.name,
        muscle_group: row.muscle_group || ex.muscle_group,
        equipment: row.equipment || ex.equipment,
        is_timed: timed,
        target_reps_min: repsMin,
        target_reps_max: repsMax,
        target_weight: 0,
        rest_sec: row.default_rest_sec || ex.rest_sec || 90,
        instructions: row.instructions || '',
        form_cues: row.form_cues || [],
        progression_note: '',
        skipped: false,
        sets: Array.from({ length: ex.target_sets || 3 }, (_, k) => ({ set_number: k + 1, weight: 0, reps: repsMin, rpe: null, rir: null, completed: false })),
      };
    });
    await persist({ ...workout, exercises: nextExercises });
    setShowReplace(null);
  };

  const finish = async () => {
    setPhase(null);
    const w = { ...workout, status: 'completed', duration_min: Math.max(1, Math.round((Date.now() - new Date(workout.created_at).getTime()) / 60000)) };
    let totalVolume = 0, totalSets = 0, totalReps = 0;
    for (const ex of w.exercises) {
      if (ex.skipped) continue;
      for (const s of ex.sets) {
        if (s.completed) {
          totalVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
          totalSets += 1; totalReps += Number(s.reps) || 0;
        }
      }
    }
    w.total_volume = totalVolume; w.total_sets = totalSets; w.total_reps = totalReps;
    const { id: _id, user_id: _uid, created_at: _ca, warmup: _wu, cooldown: _cd, ...changes } = w; // routines are saved separately
    await supabase.from('workouts').update(changes).eq('id', id);
    await checkPRs(w);
    setWorkout(w);
    setShowComplete(true);
  };

  const checkPRs = async (w) => {
    const { data: existingRows } = await supabase.from('personal_records').select('*').order('date', { ascending: false }).limit(100);
    const existing = existingRows || [];
    const newPRs = [];
    for (const ex of w.exercises) {
      if (ex.skipped) continue;
      const top = (ex.sets || []).filter(s => s.completed && s.weight && s.reps).sort((a, b) => (b.weight * (1 + b.reps / 30)) - (a.weight * (1 + a.reps / 30)))[0];
      if (!top) continue;
      const e1rm = top.weight * (1 + top.reps / 30);
      const prev = existing.find(p => p.exercise_name === ex.exercise_name);
      if (!prev || e1rm > prev.value) {
        if (prev) await supabase.from('personal_records').update({ value: Math.round(e1rm), weight: top.weight, reps: top.reps, date: w.date }).eq('id', prev.id);
        else newPRs.push({ exercise_name: ex.exercise_name, record_type: 'estimated_1rm', value: Math.round(e1rm), weight: top.weight, reps: top.reps, date: w.date });
      }
    }
    if (newPRs.length) await supabase.from('personal_records').insert(newPRs);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;
  if (!workout) return <p className="text-center py-20 text-muted-foreground">Workout not found</p>;

  if (showComplete) return <CompleteScreen workout={workout} unit={unit} calories={estimateCompleted(workout.exercises, weightKg).calories} onDone={() => navigate('/workout')} onFinish={async (difficulty, pain, notes) => {
    await supabase.from('workouts').update({ perceived_difficulty: difficulty, pain_reported: pain, pain_notes: notes }).eq('id', id);
    navigate('/workout');
  }} />;

  const completedSets = workout.exercises.filter(e => !e.skipped).flatMap(e => e.sets.filter(s => s.completed)).length;
  const totalSets = workout.exercises.filter(e => !e.skipped).reduce((a, e) => a + (e.target_sets || e.sets.length), 0);

  const burned = estimateCompleted(workout.exercises, weightKg).calories;

  const remaining = phase ? Math.max(0, Math.ceil((phase.endAt - now) / 1000)) : 0;
  const itemInPhase = phase?.list ? (phase.list === 'warmup' ? warmup : cooldown)[phase.itemIdx] : null;
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
    <div className="space-y-4 -mx-4 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 sticky top-0 glass py-2 z-10 -mx-4 px-4">
        <button onClick={() => navigate('/workout')} className="w-9 h-9 rounded-full border border-border flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate">{workout.name}</h1>
          <p className="text-xs text-muted-foreground">{completedSets}/{totalSets} sets done{completedSets > 0 && <span className="inline-flex items-center gap-0.5 ml-2"><Flame className="w-3 h-3 text-primary" />≈ {burned} kcal</span>}</p>
        </div>
        <Button onClick={finish} size="sm" className="rounded-lg font-semibold">Finish</Button>
      </div>

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
        <div className="bg-background flex flex-col items-center justify-center text-center px-6" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000, backgroundImage: 'radial-gradient(60% 40% at 50% 45%, rgba(59,130,246,0.22) 0%, rgba(9,11,16,0) 70%)' }}>
          <p className={cn('forge-eyebrow', isReady ? 'text-muted-foreground' : 'text-primary')}>{overlayLabel}</p>
          <h2 className="text-2xl font-bold font-heading mt-2">{overlayTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">{overlaySub}</p>
          <p className="leading-none font-semibold tabular-nums my-8" style={{ fontSize: clockText.length > 3 ? '6rem' : '9rem', textShadow: '0 0 40px rgba(59,130,246,0.45)' }}>{clockText}</p>
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

      {/* Pre-workout */}
      <RoutineSection icon={Flame} title="Pre-workout" items={warmup} onToggle={(i) => toggleItem('warmup', i)} onStart={(i) => startItemTimer('warmup', i)} onInfo={openRoutineHowTo} />

      {workout.exercises.map((ex, exIdx) => {
        if (ex.skipped) {
          return (
            <div key={exIdx} className="rounded-2xl border border-dashed border-border p-4 opacity-60">
              <div className="flex justify-between items-center">
                <p className="font-semibold line-through">{ex.exercise_name}</p>
                <button onClick={() => setSkipped(exIdx, false)} className="text-xs text-primary font-semibold">Unskip</button>
              </div>
            </div>
          );
        }
        const timed = isTimedExercise(ex);
        return (
          <div key={exIdx} className="rounded-3xl bg-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold">{ex.exercise_name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{ex.muscle_group} · {ex.target_sets}×{ex.target_reps_min}-{ex.target_reps_max}{timed ? ' sec' : ''} · RIR {ex.rir_target}</p>
                  <button onClick={() => setHowTo(ex)} className="text-[11px] text-primary font-semibold mt-1 flex items-center gap-1"><Info className="w-3 h-3" /> How to do this</button>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowReplace(exIdx)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center" title="Replace"><RefreshCw className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setSkipped(exIdx, true)} className="w-8 h-8 rounded-full border border-border flex items-center justify-center" title="Skip"><SkipForward className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              {ex.instructions && <p className="text-xs text-muted-foreground mt-2">{ex.instructions}</p>}
              {ex.form_cues?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ex.form_cues.map((c, i) => <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{c}</span>)}
                </div>
              )}
              {timed && <p className="text-[11px] text-primary font-medium mt-2">Timed exercise: tap play and a 5 second countdown starts the hold.</p>}
            </div>

            {/* Sets header */}
            <div className="grid grid-cols-12 gap-1 px-4 py-2 text-[10px] font-bold uppercase text-muted-foreground">
              <div className="col-span-1">Set</div>
              <div className="col-span-4 text-center">Weight</div>
              <div className="col-span-3 text-center">{timed ? 'Sec' : 'Reps'}</div>
              <div className="col-span-2 text-center">RIR</div>
              <div className="col-span-2 text-center">Done</div>
            </div>

            {ex.sets.map((s, sIdx) => (
              <div key={sIdx} className={cn('grid grid-cols-12 gap-1 px-4 py-1.5 items-center border-t border-border', s.completed && 'forge-done')}>
                <div className="col-span-1 text-sm font-bold text-muted-foreground">{s.set_number}</div>
                <div className="col-span-4"><input type="number" inputMode="decimal" value={s.weight ?? ''} onChange={e => updateSet(exIdx, sIdx, 'weight', e.target.value)} placeholder={ex.target_weight || 0} className="w-full h-9 rounded-lg border border-input bg-background text-center text-sm" /></div>
                <div className="col-span-3"><input type="number" inputMode="decimal" value={s.reps ?? ''} onChange={e => updateSet(exIdx, sIdx, 'reps', e.target.value)} placeholder={ex.target_reps_min} className="w-full h-9 rounded-lg border border-input bg-background text-center text-sm" /></div>
                <div className="col-span-2"><input type="number" inputMode="decimal" value={s.rir ?? ''} onChange={e => updateSet(exIdx, sIdx, 'rir', e.target.value)} placeholder="2" className="w-full h-9 rounded-lg border border-input bg-background text-center text-sm" /></div>
                <div className="col-span-2 flex justify-center">
                  {timed && !s.completed ? (
                    <button onClick={() => startTimedSet(exIdx, sIdx)} className="w-9 h-9 rounded-full flex items-center justify-center border-2 border-primary text-primary" title="Start timer"><Play className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={() => toggleSet(exIdx, sIdx)} className={cn('w-9 h-9 rounded-full flex items-center justify-center border-2 transition', s.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border')}><Check className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}

            <button onClick={() => addSet(exIdx)} className="w-full py-2.5 border-t border-border text-sm font-semibold text-primary flex items-center justify-center gap-1 hover:bg-accent/50"><Plus className="w-4 h-4" /> Add set</button>
          </div>
        );
      })}

      {/* Post-workout */}
      <RoutineSection icon={HeartPulse} title="Post-workout" items={cooldown} onToggle={(i) => toggleItem('cooldown', i)} onStart={(i) => startItemTimer('cooldown', i)} onInfo={openRoutineHowTo} />

      {showReplace !== null && (
        <ReplaceModal exercise={workout.exercises[showReplace]} workoutExercises={workout.exercises} profile={profile} onClose={() => setShowReplace(null)} onReplace={(row) => replaceExercise(showReplace, row)} />
      )}
      {howTo && <ExerciseHowTo exercise={howTo} onClose={() => setHowTo(null)} />}
    </div>
  );
}

// A pre- or post-workout checklist. Items that state a time get a timer button.
function RoutineSection({ icon: Icon, title, items, onToggle, onStart, onInfo }) {
  if (!items?.length) return null;
  const doneCount = items.filter(it => it.done).length;
  return (
    <div className="rounded-3xl bg-card border border-border p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="forge-eyebrow text-primary flex items-center gap-1.5"><Icon className="w-4 h-4" /> {title}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{doneCount}/{items.length} · ~{estimateRoutineMinutes(items)} min</p>
      </div>
      {items.map((item, i) => (
        <CheckItem key={i} item={item} timing={parseItemTiming(item)} onToggle={() => onToggle(i)} onStart={() => onStart(i)} onInfo={() => onInfo(item)} />
      ))}
    </div>
  );
}

function CheckItem({ item, onToggle, timing, onStart, onInfo }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 flex items-center gap-3 py-2">
        <button onClick={onToggle} className="flex-shrink-0" aria-label={item.done ? 'Mark not done' : 'Mark done'}>
          <span className={cn('w-6 h-6 rounded-md border-2 flex items-center justify-center transition', item.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-border')}>
            {item.done && <Check className="w-3.5 h-3.5" />}
          </span>
        </button>
        <div className="flex-1 min-w-0">
          <button onClick={onToggle} className="block w-full text-left">
            <span className={cn('block text-sm font-medium', item.done && 'line-through text-muted-foreground')}>{item.name}</span>
            {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
          </button>
          <button onClick={onInfo} className="text-[11px] text-primary font-semibold mt-0.5 flex items-center gap-1"><Info className="w-3 h-3" /> How to do this</button>
        </div>
      </div>
      {timing && !item.done && (
        <button onClick={onStart} className="flex-shrink-0 h-9 pl-2.5 pr-3 rounded-full border-2 border-primary text-primary flex items-center gap-1 text-xs font-bold" title="Start timer">
          <Play className="w-3.5 h-3.5" />{fmtItemDuration(timing)}
        </button>
      )}
    </div>
  );
}

// Equipment names differ between profiles and the exercise bank ("dumbbells" vs "dumbbell",
// "body weight" vs "bodyweight"), so compare loosely.
const normEquip = (v) => String(v || '').toLowerCase().trim().replace(/[\s-]+/g, '_').replace(/s$/, '');
const BODYWEIGHT_LIKE = /^(none|bodyweight|body_weight|body_only|no_equipment|no_equipmen)$/;
function usableWithProfile(rowEquipment, profileEquipment) {
  if (!profileEquipment?.length) return true;
  const e = normEquip(rowEquipment);
  if (!e || BODYWEIGHT_LIKE.test(e)) return true;
  return profileEquipment.some(p => { const n = normEquip(p); return n === e || n.includes(e) || e.includes(n); });
}
const shuffled = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Replacements come from the real exercises table: same muscle group first, filtered to the
// equipment you have, or search the whole bank by name.
function ReplaceModal({ exercise, workoutExercises, profile, onClose, onReplace }) {
  const [bank, setBank] = useState(null); // null = loading
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    supabase.from('exercises').select('*').order('name').then(({ data, error }) => {
      if (error) { setLoadError(error.message); setBank([]); } else setBank(data || []);
    });
  }, []);

  const inWorkout = useMemo(() => new Set((workoutExercises || []).map(e => (e.exercise_name || '').toLowerCase())), [workoutExercises]);
  const available = useMemo(() => (bank || []).filter(r => !inWorkout.has((r.name || '').toLowerCase())), [bank, inWorkout]);

  // Older workouts may not store muscle_group, so fall back to looking the current exercise up by name.
  const muscle = exercise.muscle_group || (bank || []).find(r => (r.name || '').toLowerCase() === (exercise.exercise_name || '').toLowerCase())?.muscle_group;

  const suggestions = useMemo(() => {
    if (!muscle) return [];
    const pool = available.filter(r => r.muscle_group === muscle);
    const usable = pool.filter(r => usableWithProfile(r.equipment, profile?.equipment));
    return shuffled(usable.length >= 3 ? usable : pool).slice(0, 8); // if the equipment filter is too strict, don't starve the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, muscle, profile?.equipment, seed]);

  const q = query.trim().toLowerCase();
  const results = q ? available.filter(r => (r.name || '').toLowerCase().includes(q)).slice(0, 40) : suggestions;

  return createPortal(
    <div
      className="forge-overlay flex items-end sm:items-center justify-center"
      // Rendered on document.body with an inline z-index so it always sits above the bottom nav.
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }}
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 flex flex-col"
        style={{ maxHeight: '85vh', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold truncate">Replace {exercise.exercise_name}</h3>
            {muscle && <p className="text-xs text-muted-foreground capitalize">{muscle.replace(/_/g, ' ')}</p>}
          </div>
          <button onClick={onClose} className="flex-shrink-0 ml-3"><X className="w-5 h-5" /></button>
        </div>

        <div className="relative mb-3 flex-shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search all exercises..." className="w-full h-11 rounded-xl border border-input pl-9 pr-3 text-sm" />
        </div>

        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <p className="forge-eyebrow text-muted-foreground">{q ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Suggested for you'}</p>
          {!q && suggestions.length > 0 && (
            <button onClick={() => setSeed(n => n + 1)} className="text-xs font-semibold text-primary flex items-center gap-1"><Shuffle className="w-3.5 h-3.5" /> Shuffle</button>
          )}
        </div>

        <div className="space-y-2 overflow-y-auto no-scrollbar min-h-0">
          {bank === null ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading exercises...</p>
          ) : loadError ? (
            <p className="text-sm text-destructive text-center py-6">Couldn't load exercises: {loadError}</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{q ? 'No matching exercises.' : 'Search above to find a replacement.'}</p>
          ) : results.map(r => (
            <button key={r.id ?? r.name} onClick={() => onReplace(r)} className="w-full text-left p-3 rounded-xl border border-border hover:border-primary active:scale-[0.99] transition">
              <p className="font-semibold text-sm">{r.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{r.muscle_group?.replace(/_/g, ' ')} · {r.equipment?.replace(/_/g, ' ')}{r.is_timed ? ' · timed' : ''}</p>
            </button>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-3 flex-shrink-0">Suggestions match your equipment. For pain, consider a different movement pattern rather than pushing through.</p>
      </div>
    </div>,
    document.body
  );
}

function CompleteScreen({ workout, unit, calories, onDone, onFinish }) {
  const [difficulty, setDifficulty] = useState(null);
  const [pain, setPain] = useState(false);
  const [notes, setNotes] = useState('');
  const stats = [
    { label: 'Duration', value: `${workout.duration_min}m`, icon: Timer },
    { label: 'Sets', value: workout.total_sets, icon: Dumbbell },
    { label: 'Reps', value: workout.total_reps, icon: Dumbbell },
    { label: 'Volume', value: `${Math.round(workout.total_volume || 0).toLocaleString()}`, icon: Trophy },
    { label: 'Calories (est.)', value: `≈ ${calories}`, icon: Flame },
  ];
  const diffOptions = [['too_easy', 'Too easy'], ['good', 'Good'], ['hard', 'Hard'], ['very_hard', 'Very hard']];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center -mx-4 px-6 py-10">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-500" style={{ background: 'radial-gradient(circle at 50% 30%, #93c5fd 0%, #3b82f6 45%, #1e3a8a 100%)', boxShadow: '0 0 50px rgba(59,130,246,0.5), inset 0 0 18px rgba(255,255,255,0.25)' }}>
        <Trophy className="w-10 h-10 text-white" />
      </div>
      <p className="forge-eyebrow text-primary">Workout complete</p>
      <h1 className="text-3xl font-bold font-heading mt-1">{workout.name}</h1>

      <div className="grid grid-cols-2 gap-3 w-full max-w-xs mt-8">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={cn('rounded-3xl bg-card border border-border p-4', s.label.startsWith('Calories') && 'col-span-2')}>
              <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}{s.label === 'Volume' ? ` (${unit})` : ''}</p>
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-xs mt-8">
        <p className="font-semibold mb-3">How did that feel?</p>
        <div className="grid grid-cols-2 gap-2">
          {diffOptions.map(([v, l]) => (
            <button key={v} onClick={() => setDifficulty(v)} className={cn('py-3 rounded-xl border-2 text-sm font-semibold transition', difficulty === v ? 'border-primary bg-accent' : 'border-border')}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm font-medium mt-4 justify-center"><input type="checkbox" checked={pain} onChange={e => setPain(e.target.checked)} className="w-4 h-4 accent-primary" /> Any pain or discomfort?</label>
        {pain && (
          <div className="forge-warn mt-3 p-3 rounded-2xl text-left">
            <AlertTriangle className="w-4 h-4 text-amber-300 mb-1" />
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Where / what kind?" className="w-full h-9 rounded-lg border border-amber-400/40 bg-background px-3 text-sm" />
            <p className="text-[11px] text-amber-300 mt-1">If pain is sharp or severe, stop and consult a healthcare professional.</p>
          </div>
        )}
      </div>

      <Button onClick={() => difficulty ? onFinish(difficulty, pain, notes) : onDone()} className="w-full max-w-xs mt-8 rounded-xl h-12 font-semibold">
        {difficulty ? 'Save & finish' : 'Done'}
      </Button>
    </div>
  );
}
