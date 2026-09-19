import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Sparkles, History, TrendingUp, Calendar, Dumbbell, Plus, ChevronRight, Trophy, Trash2, RefreshCw, ClipboardList, Play, Flame, HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import WorkoutBuilder from '@/components/WorkoutBuilder';
import { estimateWorkout, toKg } from '@/lib/calorieEstimate';
import { buildWarmup, buildCooldown, parseItemTiming, fmtItemDuration, estimateRoutineMinutes } from '@/lib/warmupCooldown';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Timed exercises (planks, holds) are prescribed in seconds.
const TIMED_NAME = /plank|wall sit|dead hang|hollow hold|l-sit|isometric|\bhold\b/i;
const isTimed = (ex) => ex.is_timed === true || (ex.is_timed == null && TIMED_NAME.test(ex.exercise_name || ''));
function repsLabel(ex) {
  if (!isTimed(ex)) return `${ex.target_reps_min}-${ex.target_reps_max}`;
  // Older workouts may list a plank as "8-12 reps"; the workout screen treats that as a 30-45 second hold.
  if ((Number(ex.target_reps_max) || 0) < 15) return '30-45 sec';
  return `${ex.target_reps_min}-${ex.target_reps_max} sec`;
}

// Pre-/post-workout routine for a workout: the saved one if it has one, otherwise the same picks the
// active workout screen will build (they're seeded by the workout id, so both screens agree).
function routineFor(w, kind) {
  const saved = w?.[kind];
  if (Array.isArray(saved) && saved.length) return saved;
  return kind === 'warmup' ? buildWarmup(w?.exercises, w?.id) : buildCooldown(w?.exercises, w?.id);
}

// Compact preview of a pre- or post-workout routine. Timers run from the active workout screen.
function RoutinePreview({ icon: Icon, title, items }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-3xl bg-card border border-border p-5">
      <div className="flex items-center justify-between">
        <p className="forge-eyebrow text-primary flex items-center gap-1.5"><Icon className="w-4 h-4" /> {title}</p>
        <p className="text-xs text-muted-foreground tabular-nums">~{estimateRoutineMinutes(items)} min</p>
      </div>
      <div className="mt-3 divide-y divide-border">
        {items.map((it, i) => {
          const timing = parseItemTiming(it);
          return (
            <div key={i} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{it.name}</p>
                {it.detail && <p className="text-xs text-muted-foreground truncate">{it.detail}</p>}
              </div>
              {timing && <span className="text-xs font-semibold text-primary tabular-nums flex-shrink-0">{fmtItemDuration(timing)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Workouts() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const [tab, setTab] = useState('today');
  const [todayWorkout, setTodayWorkout] = useState(null);
  const [history, setHistory] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [confirm, setConfirm] = useState(null); // null | 'delete' | 'replace'
  const [working, setWorking] = useState(false);
  const [avoid, setAvoid] = useState([]); // exercises from a workout you just deleted, so the next one is different
  const [historyTarget, setHistoryTarget] = useState(null); // the history workout pending deletion
  const [historyWorking, setHistoryWorking] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [templateTarget, setTemplateTarget] = useState(null); // template pending deletion
  const [templateWorking, setTemplateWorking] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState(null); // template waiting on "replace today?" confirm
  const [startingTemplate, setStartingTemplate] = useState(false);
  const [weightKg, setWeightKg] = useState(null); // latest logged body weight, for calorie estimates

  useEffect(() => {
    if (loading) return;
    if (!profile) { navigate('/onboarding', { replace: true }); return; }
    load();
  }, [loading, profile]);

  const load = async () => {
    const [today, hist, tmpl, weight] = await Promise.all([
      supabase.from('workouts').select('*').eq('date', todayStr()).order('created_at', { ascending: false }).limit(1),
      supabase.from('workouts').select('*').eq('status', 'completed').order('date', { ascending: false }).limit(50),
      supabase.from('workout_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('body_measurements').select('weight').order('date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setTodayWorkout(today.data?.[0] || null);
    setHistory(hist.data || []);
    setTemplates(tmpl.data || []);
    setWeightKg(weight.data?.weight ? toKg(weight.data.weight, profile?.units) : null);
  };

  // Calorie estimate is a rough guide (see calorieEstimate.js), not a precise measurement.
  const calEstimate = (exercises) => estimateWorkout(exercises, weightKg || undefined);

  const generate = async (exclude = avoid) => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-workout', { body: { exclude_exercises: exclude, profile } });
      if (error) throw error;
      if (data?.workout) { setAvoid([]); await load(); }
      else alert(data?.error || 'Could not generate workout');
    } catch (e) { alert(e.message); }
    finally { setGenerating(false); }
  };

  // Deletes today's workout. Returns the exercise names so the next workout can be different.
  const removeToday = async () => {
    const { data, error } = await supabase.from('workouts').delete().eq('id', todayWorkout.id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Couldn't delete this workout. Your database may be missing a delete permission for the workouts table.");
    return (todayWorkout.exercises || []).map(e => e.exercise_name);
  };

  const confirmAction = async () => {
    const mode = confirm;
    setWorking(true);
    try {
      const names = await removeToday();
      setTodayWorkout(null);
      setConfirm(null);
      if (mode === 'replace') await generate(names);
      else setAvoid(names);
      await load();
    } catch (e) { alert(e.message); setConfirm(null); }
    finally { setWorking(false); }
  };

  // Deletes a completed workout from History. Doesn't undo any personal records it already set.
  const deleteHistoryItem = async () => {
    if (!historyTarget) return;
    setHistoryWorking(true);
    try {
      const { data, error } = await supabase.from('workouts').delete().eq('id', historyTarget.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Couldn't delete this workout. Your database may be missing a delete permission for the workouts table.");
      setHistory(h => h.filter(w => w.id !== historyTarget.id));
      setHistoryTarget(null);
    } catch (e) { alert(e.message); }
    finally { setHistoryWorking(false); }
  };

  // A saved template's `exercises` already has the same shape workouts.exercises uses
  // (sets pre-built), so starting one is just copying that array into a new workout row,
  // reset to unlogged. Today/ActiveWorkout render it exactly like a generated workout.
  const startTemplate = async (template) => {
    setStartingTemplate(true);
    try {
      const exercises = (template.exercises || []).map(ex => ({
        ...ex,
        skipped: false,
        sets: (ex.sets || []).map((s, i) => ({ set_number: i + 1, weight: s.weight, reps: s.reps, rpe: null, rir: null, completed: false })),
      }));
      const { data: created, error } = await supabase.from('workouts').insert({
        date: todayStr(),
        name: template.name,
        focus: template.focus,
        type: template.focus,
        status: 'planned',
        exercises,
        ai_explanation: null,
      }).select().single();
      if (error) throw error;
      setPendingTemplate(null);
      navigate(`/workout/active/${created.id}`);
    } catch (e) { alert(e.message); }
    finally { setStartingTemplate(false); }
  };

  const handleStartTemplate = (template) => {
    if (todayWorkout) setPendingTemplate(template);
    else startTemplate(template);
  };

  const confirmReplaceWithTemplate = async () => {
    setStartingTemplate(true);
    try {
      await removeToday();
      setTodayWorkout(null);
      await startTemplate(pendingTemplate);
    } catch (e) { alert(e.message); setPendingTemplate(null); setStartingTemplate(false); }
  };

  const deleteTemplate = async () => {
    if (!templateTarget) return;
    setTemplateWorking(true);
    try {
      const { data, error } = await supabase.from('workout_templates').delete().eq('id', templateTarget.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Couldn't delete this workout. Your database may be missing a delete permission for the workout_templates table.");
      setTemplates(t => t.filter(w => w.id !== templateTarget.id));
      setTemplateTarget(null);
    } catch (e) { alert(e.message); }
    finally { setTemplateWorking(false); }
  };

  const confirmCopy = () => {
    const base = confirm === 'replace'
      ? "This deletes today's workout and builds a different one."
      : "This deletes today's workout. You can generate a new one afterward.";
    if (todayWorkout?.status === 'completed') return base + ' It will also be removed from your history.';
    if (todayWorkout?.status === 'in_progress') return base + " Any sets you've already logged will be lost.";
    return base;
  };

  const todayEstimate = useMemo(() => todayWorkout ? calEstimate(todayWorkout.exercises) : null, [todayWorkout, weightKg]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="pt-1">
        <h1 className="text-[28px] leading-9 font-semibold font-heading">Train</h1>
        <p className="text-sm text-muted-foreground">Your programming, history, and progress</p>
      </div>

      <div className="forge-tabs">
        {[['today', 'Today'], ['templates', 'My Workouts'], ['history', 'History'], ['progress', 'Progress']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex-1 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition', tab === k ? 'forge-tab-active' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>

      {tab === 'today' && (
        <div className="space-y-4">
          {todayWorkout ? (
            <>
              <div className="forge-hero rounded-3xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="forge-chip">{todayWorkout.focus}</span>
                    <h2 className="text-2xl font-semibold mt-3 leading-tight">{todayWorkout.name}</h2>
                    {todayEstimate && (
                      <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1.5 tabular-nums">
                        <Flame className="w-4 h-4 text-primary" /> ≈ {todayEstimate.calories} kcal · ~{todayEstimate.minutes} min
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {todayWorkout.status === 'completed' && <span className="forge-chip forge-chip-success">Done</span>}
                    <button onClick={() => setConfirm('delete')} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground" title="Delete workout"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {todayWorkout.ai_explanation && (
                  <div className="forge-well mt-4 p-4 text-sm flex gap-3">
                    <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="forge-eyebrow text-primary mb-1">AI rationale</p>
                      <p className="text-foreground leading-relaxed">{todayWorkout.ai_explanation}</p>
                    </div>
                  </div>
                )}
              </div>

              <RoutinePreview icon={Flame} title="Pre-workout" items={routineFor(todayWorkout, 'warmup')} />

              <div className="space-y-2.5">
                {todayWorkout.exercises?.map((ex, i) => (
                  <div key={i} className="rounded-3xl bg-card border border-border p-5">
                    <p className="forge-eyebrow text-primary">{ex.muscle_group?.replace(/_/g, ' ')}</p>
                    <h3 className="text-lg font-semibold mt-1 leading-snug">{ex.exercise_name}</h3>
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      <div>
                        <p className="forge-eyebrow text-muted-foreground">Volume</p>
                        <p className="text-sm font-semibold mt-1 tabular-nums">{ex.target_sets} × {repsLabel(ex)}</p>
                      </div>
                      <div>
                        <p className="forge-eyebrow text-muted-foreground">Load</p>
                        <p className="text-sm font-semibold mt-1 tabular-nums">{ex.target_weight ? `${ex.target_weight} ${profile?.units === 'metric' ? 'kg' : 'lb'}` : 'Bodyweight'}</p>
                      </div>
                      <div>
                        <p className="forge-eyebrow text-muted-foreground">Strain buffer</p>
                        <p className="text-sm font-semibold mt-1 text-primary tabular-nums">RIR {ex.rir_target ?? '-'}</p>
                      </div>
                    </div>
                    {ex.progression_note && <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border leading-relaxed">{ex.progression_note}</p>}
                  </div>
                ))}
              </div>

              <RoutinePreview icon={HeartPulse} title="Post-workout" items={routineFor(todayWorkout, 'cooldown')} />

              {todayWorkout.status !== 'completed' ? (
                <div className="space-y-2">
                  <Button className="w-full rounded-xl h-12 font-semibold" onClick={() => navigate(`/workout/active/${todayWorkout.id}`)}>
                    {todayWorkout.status === 'in_progress' ? 'Resume workout' : 'Start workout'}
                  </Button>
                  <Button variant="secondary" className="w-full rounded-xl h-11 font-semibold" disabled={generating || working} onClick={() => setConfirm('replace')}>
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Replace with a new workout
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" className="w-full rounded-xl h-11 font-semibold" disabled={generating} onClick={() => generate([])}>
                  <Sparkles className="w-4 h-4 mr-1.5" /> {generating ? 'Generating...' : 'Generate another workout'}
                </Button>
              )}
            </>
          ) : (
            <div className="forge-hero rounded-3xl p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-accent forge-orb flex items-center justify-center mx-auto mb-4"><Dumbbell className="w-7 h-7 text-primary" /></div>
              <h3 className="font-bold text-lg">No workout planned yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-5">Let your AI coach build today's session, or put one together yourself.</p>
              <div className="space-y-2 max-w-xs mx-auto">
                <Button onClick={() => generate()} disabled={generating} className="w-full rounded-xl h-12 font-semibold">
                  <Sparkles className="w-4 h-4 mr-1.5" /> {generating ? 'Generating...' : 'Generate workout'}
                </Button>
                <Button variant="secondary" onClick={() => setBuilderOpen(true)} className="w-full rounded-xl h-11 font-semibold">
                  <Plus className="w-4 h-4 mr-1.5" /> New empty workout
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="space-y-2.5">
          <Button variant="secondary" onClick={() => setBuilderOpen(true)} className="w-full rounded-xl h-11 font-semibold">
            <Plus className="w-4 h-4 mr-1.5" /> New empty workout
          </Button>

          {templates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No saved workouts yet</p>
              <p className="text-sm">Build one from the exercise bank and it'll show up here</p>
            </div>
          ) : templates.map(t => {
            const est = calEstimate(t.exercises);
            return (
              <div key={t.id} className="w-full rounded-3xl bg-card border border-border p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-accent flex items-center justify-center flex-shrink-0"><Dumbbell className="w-5 h-5 text-primary" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.focus} · {t.exercises?.length || 0} exercises</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Flame className="w-3 h-3 text-primary" /> ≈ {est.calories} kcal · ~{est.minutes} min</p>
                </div>
                <button onClick={() => handleStartTemplate(t)} disabled={startingTemplate} className="w-9 h-9 rounded-full border-2 border-primary text-primary flex items-center justify-center flex-shrink-0" title="Start workout">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => setTemplateTarget(t)} className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground flex-shrink-0" title="Delete workout">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2.5">
          {history.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No completed workouts yet</p>
              <p className="text-sm">Finish your first session to see it here</p>
            </div>
          ) : history.map(w => {
            const est = calEstimate(w.exercises);
            return (
              <div key={w.id} className="w-full rounded-3xl bg-card border border-border p-4 flex items-center gap-3">
                <button onClick={() => navigate(`/workout/active/${w.id}`)} className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition">
                  <div className="w-11 h-11 rounded-full bg-accent flex items-center justify-center flex-shrink-0"><Dumbbell className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {w.duration_min || 0}min · {w.total_sets || 0} sets</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Flame className="w-3 h-3 text-primary" /> ≈ {est.calories} kcal</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{Math.round(w.total_volume || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">vol {profile?.units === 'metric' ? 'kg' : 'lb'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setHistoryTarget(w); }} className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground flex-shrink-0" title="Delete workout">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'progress' && <ProgressView history={history} profile={profile} />}

      {confirm && (
        <div className="fixed inset-0 z-50 forge-overlay flex items-end sm:items-center justify-center" onClick={() => !working && setConfirm(null)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">{confirm === 'replace' ? 'Replace this workout?' : 'Delete this workout?'}</h3>
            <p className="text-sm text-muted-foreground mt-1">{confirmCopy()}</p>
            <div className="flex gap-2 mt-5">
              <Button variant="secondary" className="flex-1 rounded-xl h-12" disabled={working} onClick={() => setConfirm(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl h-12 font-semibold bg-red-600 hover:bg-red-700 text-white" disabled={working} onClick={confirmAction}>
                {working ? (confirm === 'replace' ? 'Replacing...' : 'Deleting...') : (confirm === 'replace' ? 'Replace' : 'Delete')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {historyTarget && (
        <div className="fixed inset-0 z-50 forge-overlay flex items-end sm:items-center justify-center" onClick={() => !historyWorking && setHistoryTarget(null)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Delete this workout?</h3>
            <p className="text-sm text-muted-foreground mt-1">This removes "{historyTarget.name}" from your history for good. Any personal records it already set will stay on the books.</p>
            <div className="flex gap-2 mt-5">
              <Button variant="secondary" className="flex-1 rounded-xl h-12" disabled={historyWorking} onClick={() => setHistoryTarget(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl h-12 font-semibold bg-red-600 hover:bg-red-700 text-white" disabled={historyWorking} onClick={deleteHistoryItem}>
                {historyWorking ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {templateTarget && (
        <div className="fixed inset-0 z-50 forge-overlay flex items-end sm:items-center justify-center" onClick={() => !templateWorking && setTemplateTarget(null)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Delete this saved workout?</h3>
            <p className="text-sm text-muted-foreground mt-1">This removes "{templateTarget.name}" from My Workouts for good.</p>
            <div className="flex gap-2 mt-5">
              <Button variant="secondary" className="flex-1 rounded-xl h-12" disabled={templateWorking} onClick={() => setTemplateTarget(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl h-12 font-semibold bg-red-600 hover:bg-red-700 text-white" disabled={templateWorking} onClick={deleteTemplate}>
                {templateWorking ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pendingTemplate && (
        <div className="fixed inset-0 z-50 forge-overlay flex items-end sm:items-center justify-center" onClick={() => !startingTemplate && setPendingTemplate(null)}>
          <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Replace today's workout?</h3>
            <p className="text-sm text-muted-foreground mt-1">This deletes today's current workout and starts "{pendingTemplate.name}" instead.{todayWorkout?.status === 'in_progress' ? " Any sets you've already logged will be lost." : ''}</p>
            <div className="flex gap-2 mt-5">
              <Button variant="secondary" className="flex-1 rounded-xl h-12" disabled={startingTemplate} onClick={() => setPendingTemplate(null)}>Cancel</Button>
              <Button className="flex-1 rounded-xl h-12 font-semibold bg-red-600 hover:bg-red-700 text-white" disabled={startingTemplate} onClick={confirmReplaceWithTemplate}>
                {startingTemplate ? 'Starting...' : 'Replace & start'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {builderOpen && (
        <WorkoutBuilder
          onClose={() => setBuilderOpen(false)}
          onSaved={async (template) => {
            setBuilderOpen(false);
            setTemplates(t => [template, ...t]);
            setTab('templates');
          }}
        />
      )}
    </div>
  );
}

function ProgressView({ history, profile }) {
  const [prs, setPrs] = useState([]);
  const [body, setBody] = useState([]);
  const unit = profile?.units === 'metric' ? 'kg' : 'lb';

  useEffect(() => {
    supabase.from('personal_records').select('*').order('date', { ascending: false }).limit(20)
      .then(({ data }) => setPrs(data || []));
    // newest 50 entries, flipped to oldest -> newest for the chart
    supabase.from('body_measurements').select('*').order('date', { ascending: false }).limit(50)
      .then(({ data }) => setBody((data || []).reverse()));
  }, []);

  // Build strength trend: estimated 1RM for a tracked exercise over time
  const strengthData = buildStrengthTrend(history);

  const bodyData = body.map(b => ({ date: new Date(b.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), weight: b.weight }));

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-card border border-border p-5">
        <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-primary" /><h3 className="font-bold">Strength trend</h3></div>
        {strengthData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={strengthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12, background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }} />
              <Line type="monotone" dataKey="e1rm" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} name={`Est. 1RM (${unit})`} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">Log a few workouts with weight & reps to see your strength trend.</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">Estimated 1RM (Epley) — labeled as an estimate.</p>
      </div>

      {bodyData.length >= 2 && (
        <div className="rounded-3xl bg-card border border-border p-5">
          <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-primary" /><h3 className="font-bold">Body weight</h3></div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={bodyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12, background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }} />
              <Line type="monotone" dataKey="weight" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={{ r: 3 }} name={`Weight (${unit})`} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-3xl bg-card border border-border p-5">
        <div className="flex items-center gap-2 mb-3"><Trophy className="w-4 h-4 text-primary" /><h3 className="font-bold">Personal records</h3></div>
        {prs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">PRs are recorded automatically as you log workouts.</p>
        ) : (
          <div className="space-y-2">
            {prs.slice(0, 8).map(pr => (
              <div key={pr.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                <div><p className="font-semibold text-sm">{pr.exercise_name}</p><p className="text-[10px] text-muted-foreground">{new Date(pr.date).toLocaleDateString()}</p></div>
                <p className="font-bold text-primary">{pr.value} <span className="text-xs text-muted-foreground">{unit}</span></p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function buildStrengthTrend(history) {
  // Pick the exercise with the most logged top-set data
  const byExercise = {};
  for (const w of [...history].reverse()) {
    for (const ex of w.exercises || []) {
      if (ex.skipped) continue;
      const top = (ex.sets || []).filter(s => s.completed && s.weight && s.reps).sort((a, b) => (b.weight * b.reps) - (a.weight * a.reps))[0];
      if (!top) continue;
      (byExercise[ex.exercise_name] ||= []).push({ date: new Date(w.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), e1rm: Math.round(top.weight * (1 + top.reps / 30)) });
    }
  }
  const entries = Object.entries(byExercise).sort((a, b) => b[1].length - a[1].length);
  return entries[0]?.[1] || [];
}