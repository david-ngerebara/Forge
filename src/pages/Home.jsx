import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import ProgressRing from '@/components/ProgressRing';
import { Button } from '@/components/ui/button';
import { Dumbbell, Flame, Droplets, HeartPulse, Sparkles, Plus, ChevronRight, CheckCircle2, Circle, AlarmClock } from 'lucide-react';
import { cn } from '@/lib/utils';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Home() {
  const { profile, loading } = useProfile();
  const navigate = useNavigate();
  const [workout, setWorkout] = useState(null);
  const [foodLogs, setFoodLogs] = useState([]);
  const [recovery, setRecovery] = useState(null);
  const [insight, setInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [water, setWater] = useState(0);
  const [showCheckin, setShowCheckin] = useState(false);

  const waterKey = `forge_water_${todayStr()}`;

  useEffect(() => {
    if (loading) return;
    if (!profile) { navigate('/onboarding', { replace: true }); return; }
    loadAll();
    const w = localStorage.getItem(waterKey);
    if (w) setWater(parseInt(w));
  }, [loading, profile]);

  const loadAll = useCallback(async () => {
    const today = todayStr();
    // RLS already limits every query to the signed-in user
    const [wks, foods, rec] = await Promise.all([
      supabase.from('workouts').select('*').eq('date', today).order('created_at', { ascending: false }).limit(1),
      supabase.from('food_logs').select('*').eq('date', today),
      supabase.from('recovery_logs').select('*').eq('date', today).order('created_at', { ascending: false }).limit(1),
    ]);
    setWorkout(wks.data?.[0] || null);
    setFoodLogs(foods.data || []);
    setRecovery(rec.data?.[0] || null);
    fetchInsight();
  }, [profile]);

  const fetchInsight = async () => {
    setLoadingInsight(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-coach-insight', { body: {} });
      if (!error) setInsight(data?.insight || '');
    } catch (e) { /* non-critical */ }
    finally { setLoadingInsight(false); }
  };

  const macros = foodLogs.reduce((a, f) => {
    const m = Number(f.servings) || 1;
    a.cal += Number(f.calories) * m; a.protein += Number(f.protein) * m;
    a.carbs += Number(f.carbs) * m; a.fat += Number(f.fat) * m;
    return a;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const calTarget = profile?.daily_calorie_target || 2400;
  const proteinTarget = profile?.protein_target || 160;
  const waterTarget = 8;

  const addWater = () => {
    const n = water + 1;
    setWater(n);
    localStorage.setItem(waterKey, String(n));
  };
  const subWater = () => {
    const n = Math.max(0, water - 1);
    setWater(n);
    localStorage.setItem(waterKey, String(n));
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{greeting},</p>
          <h1 className="text-2xl font-bold font-heading">{profile?.first_name || 'Athlete'} 👋</h1>
        </div>
        <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center">
          {(profile?.first_name?.[0] || 'F').toUpperCase()}
        </button>
      </div>

      {/* Daily check-in prompt */}
      {!recovery && (
        <button onClick={() => setShowCheckin(true)} className="w-full p-4 rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-primary-foreground text-left flex items-center gap-3 shadow-lg shadow-primary/20 active:scale-[0.98] transition">
          <AlarmClock className="w-6 h-6 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Daily check-in</p>
            <p className="text-xs opacity-90">30 seconds — tunes today's plan</p>
          </div>
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* AI Coach insight */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center"><Sparkles className="w-4 h-4 text-primary" /></div>
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">AI Coach</span>
        </div>
        {loadingInsight ? (
          <div className="space-y-1.5">
            <div className="h-3 bg-muted rounded w-full animate-pulse" />
            <div className="h-3 bg-muted rounded w-4/5 animate-pulse" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed">{insight || 'Complete a workout or check in to get personalized coaching.'}</p>
        )}
      </div>

      {/* Today's workout */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Today's Workout</p>
            <h3 className="text-lg font-bold mt-0.5">{workout?.name || 'No workout yet'}</h3>
            <p className="text-sm text-muted-foreground">{workout?.focus || 'Generate one with your AI coach'}</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center"><Dumbbell className="w-5 h-5 text-primary" /></div>
        </div>
        {workout ? (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <span>{workout.exercises?.length || 0} exercises</span><span>·</span>
              <span>{profile?.workout_duration || 45} min</span>
              {workout.status === 'completed' && <><span>·</span><span className="text-emerald-300 font-semibold">Done</span></>}
            </div>
            {workout.status === 'completed' ? (
              <Button variant="secondary" className="w-full rounded-xl" onClick={() => navigate('/workout')}>View history</Button>
            ) : (
              <Button className="w-full rounded-xl h-11 font-semibold" onClick={() => navigate(`/workout/active/${workout.id}`)}>
                {workout.status === 'in_progress' ? 'Resume workout' : 'Start workout'}
              </Button>
            )}
          </div>
        ) : (
          <div className="px-4 pb-4">
            <Button className="w-full rounded-xl h-11 font-semibold" onClick={() => navigate('/workout')}>
              <Sparkles className="w-4 h-4 mr-1.5" /> Generate today's workout
            </Button>
          </div>
        )}
      </div>

      {/* Nutrition + Water row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card border border-border p-4 flex flex-col items-center">
          <div className="flex items-center gap-1.5 self-start mb-1"><Flame className="w-4 h-4 text-primary" /><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nutrition</span></div>
          <ProgressRing value={macros.cal} max={calTarget} size={104} label={`${Math.round(macros.cal)}`} sublabel={`/ ${calTarget} kcal`} />
          <div className="flex justify-between w-full mt-3 text-xs">
            <Macro label="Protein" value={Math.round(macros.protein)} target={proteinTarget} />
            <Macro label="Carbs" value={Math.round(macros.carbs)} target={Math.round(calTarget * 0.4 / 4)} />
            <Macro label="Fat" value={Math.round(macros.fat)} target={Math.round(calTarget * 0.3 / 9)} />
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => navigate('/nutrition')}>Log food <ChevronRight className="w-3 h-3" /></Button>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 flex flex-col">
          <div className="flex items-center gap-1.5 mb-2"><Droplets className="w-4 h-4 text-primary" /><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Water</span></div>
          <div className="flex-1 flex items-center justify-center gap-1.5 flex-wrap">
            {Array.from({ length: waterTarget }).map((_, i) => (
              <button key={i} onClick={() => i < water ? subWater() : addWater()} className="w-7 h-9 rounded-md border-2 flex items-center justify-center transition-all" style={{ borderColor: i < water ? 'hsl(var(--primary))' : 'hsl(var(--border))', background: i < water ? 'hsl(var(--primary) / 0.15)' : 'transparent' }}>
                <Droplets className="w-3.5 h-3.5" style={{ color: i < water ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
              </button>
            ))}
          </div>
          <p className="text-center text-sm font-semibold mt-2">{water} / {waterTarget} cups</p>
        </div>
      </div>

      {/* Recovery */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5"><HeartPulse className="w-4 h-4 text-primary" /><span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Recovery</span></div>
          {recovery && <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', readinessColor(recovery))}>{recoveryLabel(recovery)}</span>}
        </div>
        {recovery ? (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label="Sleep" value={`${recovery.sleep_hours || 0}h`} />
            <Stat label="Energy" value={`${recovery.energy || 0}/5`} />
            <Stat label="Soreness" value={`${recovery.soreness || 0}/5`} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No check-in yet today. <button onClick={() => setShowCheckin(true)} className="text-primary font-semibold">Check in</button></p>
        )}
      </div>

      {showCheckin && <CheckInModal onClose={() => { setShowCheckin(false); loadAll(); }} profile={profile} />}
    </div>
  );
}

function Macro({ label, value, target }) {
  return (
    <div className="text-center">
      <p className="font-bold">{value}</p>
      <p className="text-muted-foreground text-[10px]">{label} · {target}g</p>
    </div>
  );
}
function Stat({ label, value }) {
  return <div><p className="font-bold text-sm">{value}</p><p className="text-muted-foreground text-[10px]">{label}</p></div>;
}
function recoveryLabel(r) {
  const s = (r.sleep_quality || 3) + (r.energy || 3) - (r.soreness || 2) - (r.stress || 2);
  if (s >= 4) return 'Good';
  if (s >= 1) return 'Fair';
  return 'Low';
}
function readinessColor(r) {
  const l = recoveryLabel(r);
  return l === 'Good' ? 'bg-emerald-400/15 text-emerald-300' : l === 'Fair' ? 'bg-amber-400/15 text-amber-300' : 'bg-red-400/15 text-red-300';
}

function CheckInModal({ onClose, profile }) {
  const [data, setData] = useState({ sleep_hours: 7, sleep_quality: 4, energy: 4, soreness: 2, stress: 2, motivation: 4, pain: false, pain_notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('recovery_logs').select('id').eq('date', todayStr()).limit(1);
      const { error } = existing?.[0]
        ? await supabase.from('recovery_logs').update(data).eq('id', existing[0].id)
        : await supabase.from('recovery_logs').insert({ ...data, date: todayStr() });
      if (error) throw error;
      onClose();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return createPortal(
    // Portaled to document.body with an inline z-index so the sheet (and its Save button) always sits above the bottom nav.
    <div className="forge-overlay flex items-end sm:items-center justify-center" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }} onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">Daily check-in</h3>
          <button onClick={onClose} className="text-muted-foreground text-sm">Close</button>
        </div>
        <div className="space-y-4">
          <Slider label="Sleep hours" value={data.sleep_hours} min={0} max={12} step={0.5} onChange={v => set('sleep_hours', v)} suffix="h" />
          <Scale label="Sleep quality" value={data.sleep_quality} onChange={v => set('sleep_quality', v)} />
          <Scale label="Energy" value={data.energy} onChange={v => set('energy', v)} />
          <Scale label="Soreness" value={data.soreness} onChange={v => set('soreness', v)} reverse />
          <Scale label="Stress" value={data.stress} onChange={v => set('stress', v)} reverse />
          <Scale label="Motivation" value={data.motivation} onChange={v => set('motivation', v)} />
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={data.pain} onChange={e => set('pain', e.target.checked)} className="w-4 h-4 accent-primary" /> Any pain or discomfort?</label>
          {data.pain && <input value={data.pain_notes} onChange={e => set('pain_notes', e.target.value)} placeholder="Where / what kind?" className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm" />}
        </div>
        <Button onClick={save} disabled={saving} className="w-full mt-5 rounded-xl h-12 font-semibold">{saving ? 'Saving...' : 'Save check-in'}</Button>
      </div>
    </div>,
    document.body
  );
}

function Slider({ label, value, min, max, step, onChange, suffix }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1"><span className="font-medium">{label}</span><span className="font-bold text-primary">{value}{suffix}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} className="w-full accent-primary" />
    </div>
  );
}
function Scale({ label, value, onChange, reverse }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1.5">{label}</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)} className={cn('flex-1 py-2 rounded-lg text-sm font-bold border transition', value === n ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{n}</button>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>{reverse ? 'High' : 'Low'}</span><span>{reverse ? 'Low' : 'High'}</span></div>
    </div>
  );
}