import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Search, X, Plus, Minus, Trash2, ChevronUp, ChevronDown, Check, ArrowLeft, Dumbbell, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { estimateWorkout, toKg } from '@/lib/calorieEstimate';

const MAX_LISTED = 200;

function defaultSetsFor(ex) {
  const count = ex.default_sets || 3;
  const val = ex.is_timed ? (ex.default_reps_min || 30) : (ex.default_reps_min || 10);
  return Array.from({ length: count }, () => ({ reps: val, weight: 0 }));
}

// Builds the same shape workouts.exercises[] already uses, sets included,
// so starting a template later is just a copy -- Today/ActiveWorkout need no changes.
function toWorkoutExercise(item) {
  const sets = item.sets.map((s, i) => ({
    set_number: i + 1,
    weight: Number(s.weight) || 0,
    reps: Number(s.reps) || 0,
    rpe: null,
    rir: null,
    completed: false,
  }));
  const repVals = sets.map(s => s.reps);
  return {
    exercise_name: item.name,
    muscle_group: item.muscle_group,
    equipment: item.equipment,
    is_timed: !!item.is_timed,
    target_sets: sets.length,
    target_reps_min: sets.length ? Math.min(...repVals) : 0,
    target_reps_max: sets.length ? Math.max(...repVals) : 0,
    target_weight: sets[0]?.weight || 0,
    rest_sec: item.default_rest_sec || 90,
    rir_target: null,
    instructions: item.instructions || '',
    form_cues: item.form_cues || [],
    progression_note: '',
    skipped: false,
    sets,
  };
}

export default function WorkoutBuilder({ onClose, onSaved }) {
  const { profile } = useProfile();
  const [step, setStep] = useState('pick'); // 'pick' | 'build'
  const [library, setLibrary] = useState([]);
  const [libLoading, setLibLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [built, setBuilt] = useState([]); // [{ name, muscle_group, equipment, is_timed, default_rest_sec, instructions, form_cues, sets: [{reps,weight}] }]
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [weightKg, setWeightKg] = useState(null);

  useEffect(() => {
    supabase.from('exercises').select('*').order('name').then(({ data, error }) => {
      if (!error) setLibrary(data || []);
      setLibLoading(false);
    });
  }, []);

  // Latest logged body weight, used to make the calorie estimate a bit more personal.
  // Falls back to a generic assumption inside estimateWorkout if none is on file.
  useEffect(() => {
    supabase.from('body_measurements').select('weight').order('date', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setWeightKg(data?.weight ? toKg(data.weight, profile?.units) : null))
      .catch(() => setWeightKg(null));
  }, [profile?.units]);

  const muscleGroups = useMemo(() => {
    const set = new Set(library.map(e => e.muscle_group).filter(Boolean));
    return ['all', ...Array.from(set).sort()];
  }, [library]);

  const selectedNames = useMemo(() => new Set(built.map(b => b.name)), [built]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = library;
    if (muscleFilter !== 'all') list = list.filter(e => e.muscle_group === muscleFilter);
    if (q) list = list.filter(e => e.name.toLowerCase().includes(q));
    return list;
  }, [library, search, muscleFilter]);

  // Live estimate as the sets are configured, using the exact same estimator the rest of the app uses.
  const estimate = useMemo(() => {
    if (built.length === 0) return { calories: 0, minutes: 0 };
    return estimateWorkout(built.map(toWorkoutExercise), weightKg || undefined);
  }, [built, weightKg]);

  const toggleExercise = (ex) => {
    setBuilt(b => {
      if (b.some(x => x.name === ex.name)) return b.filter(x => x.name !== ex.name);
      return [...b, { ...ex, sets: defaultSetsFor(ex) }];
    });
  };

  const removeExercise = (idx) => setBuilt(b => b.filter((_, i) => i !== idx));
  const moveExercise = (idx, dir) => setBuilt(b => {
    const next = [...b];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return b;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const addSetRow = (exIdx) => setBuilt(b => b.map((item, i) => {
    if (i !== exIdx) return item;
    const last = item.sets[item.sets.length - 1];
    return { ...item, sets: [...item.sets, { reps: last?.reps ?? 10, weight: last?.weight ?? 0 }] };
  }));
  const removeSetRow = (exIdx, setIdx) => setBuilt(b => b.map((item, i) => {
    if (i !== exIdx) return item;
    if (item.sets.length <= 1) return item;
    return { ...item, sets: item.sets.filter((_, j) => j !== setIdx) };
  }));
  const updateSetField = (exIdx, setIdx, field, value) => setBuilt(b => b.map((item, i) => {
    if (i !== exIdx) return item;
    return { ...item, sets: item.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value === '' ? '' : Number(value) }) };
  }));

  const deriveFocus = () => {
    const groups = Array.from(new Set(built.map(b => b.muscle_group).filter(Boolean)))
      .map(g => g.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    if (groups.length === 0) return 'Custom';
    if (groups.length <= 3) return groups.join(' · ');
    return `${groups.slice(0, 2).join(' · ')} +${groups.length - 2} more`;
  };

  const save = async () => {
    if (built.length === 0) { setError('Add at least one exercise.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You need to be signed in to save a workout.');
      const exercises = built.map(toWorkoutExercise);
      const { data, error: err } = await supabase.from('workout_templates').insert({
        user_id: user.id,
        name: name.trim() || 'My Workout',
        focus: deriveFocus(),
        exercises,
      }).select().single();
      if (err) throw err;
      onSaved?.(data);
    } catch (e) {
      setError(e.message || 'Could not save this workout.');
    } finally {
      setSaving(false);
    }
  };

  // Rendered in a portal on document.body so it always sits above the bottom nav bar,
  // no matter what stacking context the page layout creates.
  return createPortal(
    <div
      className="bg-background flex flex-col"
      // Inline style on purpose: guarantees this sits above the bottom nav (z-50 in Layout.jsx)
      // even if arbitrary Tailwind z-index classes aren't generated in this build.
      style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        {step === 'build' ? (
          <button onClick={() => setStep('pick')} className="w-9 h-9 rounded-full border border-border flex items-center justify-center flex-shrink-0"><ArrowLeft className="w-4 h-4" /></button>
        ) : (
          <button onClick={onClose} className="w-9 h-9 rounded-full border border-border flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-lg truncate">{step === 'pick' ? 'Choose exercises' : 'Build your sets'}</h1>
          <p className="text-xs text-muted-foreground">{built.length} exercise{built.length === 1 ? '' : 's'} selected</p>
        </div>
        {step === 'pick' && built.length > 0 && (
          <Button size="sm" className="font-semibold flex-shrink-0" onClick={() => setStep('build')}>Next</Button>
        )}
      </div>

      {step === 'pick' ? (
        <>
          {/* Search + filters */}
          <div className="px-4 pt-3 pb-2 space-y-2 flex-shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search exercises..."
                className="w-full h-11 pl-10 pr-4 rounded-full border border-input bg-background text-sm"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
              {muscleGroups.map(g => (
                <button
                  key={g}
                  onClick={() => setMuscleFilter(g)}
                  className={cn(
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold capitalize border transition',
                    muscleFilter === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                  )}
                >
                  {g === 'all' ? 'All' : g.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className={cn('flex-1 overflow-y-auto px-4', 'pb-4')}>
            {libLoading ? (
              <div className="flex justify-center py-16"><div className="w-6 h-6 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-16">No exercises match that search.</p>
            ) : (
              <div className="space-y-1.5">
                {filtered.slice(0, MAX_LISTED).map(ex => {
                  const isSel = selectedNames.has(ex.name);
                  return (
                    <button
                      key={ex.name}
                      onClick={() => toggleExercise(ex)}
                      className={cn(
                        'w-full text-left p-3.5 rounded-2xl border flex items-center gap-3 transition active:scale-[0.99]',
                        isSel ? 'border-primary bg-accent' : 'border-border'
                      )}
                    >
                      <div className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border-2', isSel ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>
                        {isSel && <Check className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{ex.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{ex.muscle_group?.replace(/_/g, ' ')} · {ex.equipment?.replace(/_/g, ' ')}{ex.is_timed ? ' · timed' : ''}</p>
                      </div>
                    </button>
                  );
                })}
                {filtered.length > MAX_LISTED && (
                  <p className="text-center text-xs text-muted-foreground py-3">Showing first {MAX_LISTED} results — refine your search for more.</p>
                )}
              </div>
            )}
          </div>

          {built.length > 0 && (
            <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] glass border-t border-border">
              <Button className="w-full rounded-xl h-12 font-semibold" onClick={() => setStep('build')}>
                Continue with {built.length} exercise{built.length === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 space-y-3">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Name this workout (e.g. Push Day)"
              className="w-full h-12 px-4 rounded-full border border-input bg-background text-sm font-semibold"
            />

            {built.length > 0 && (
              <div className="forge-well p-3.5 flex items-center gap-2">
                <Flame className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-sm text-accent-foreground">
                  <span className="font-bold">≈ {estimate.calories} kcal</span> · ~{estimate.minutes} min for this workout
                </p>
              </div>
            )}

            <button onClick={() => setStep('pick')} className="w-full text-sm font-semibold text-primary flex items-center justify-center gap-1 py-3 rounded-full border border-dashed border-border">
              <Plus className="w-4 h-4" /> Add more exercises
            </button>

            {built.map((item, exIdx) => (
              <div key={item.name} className="rounded-3xl bg-card border border-border overflow-hidden">
                <div className="p-3.5 border-b border-border flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm truncate">{item.name}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{item.muscle_group?.replace(/_/g, ' ')}{item.is_timed ? ' · timed' : ''}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => moveExercise(exIdx, -1)} disabled={exIdx === 0} className="w-7 h-7 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => moveExercise(exIdx, 1)} disabled={exIdx === built.length - 1} className="w-7 h-7 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeExercise(exIdx)} className="w-7 h-7 rounded-full border border-border flex items-center justify-center text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-1 px-3.5 py-2 text-[10px] font-bold uppercase text-muted-foreground">
                  <div className="col-span-1">Set</div>
                  <div className="col-span-4 text-center">Weight</div>
                  <div className="col-span-4 text-center">{item.is_timed ? 'Sec' : 'Reps'}</div>
                  <div className="col-span-3 text-center">Remove</div>
                </div>
                {item.sets.map((s, setIdx) => (
                  <div key={setIdx} className="grid grid-cols-12 gap-1 px-3.5 py-1.5 items-center border-t border-border">
                    <div className="col-span-1 text-sm font-bold text-muted-foreground">{setIdx + 1}</div>
                    <div className="col-span-4"><input type="number" inputMode="decimal" value={s.weight} onChange={e => updateSetField(exIdx, setIdx, 'weight', e.target.value)} className="w-full h-10 rounded-xl border border-input bg-background text-center text-sm" /></div>
                    <div className="col-span-4"><input type="number" inputMode="decimal" value={s.reps} onChange={e => updateSetField(exIdx, setIdx, 'reps', e.target.value)} className="w-full h-10 rounded-xl border border-input bg-background text-center text-sm" /></div>
                    <div className="col-span-3 flex justify-center">
                      <button onClick={() => removeSetRow(exIdx, setIdx)} disabled={item.sets.length <= 1} className="w-9 h-9 rounded-full border border-border flex items-center justify-center disabled:opacity-30"><Minus className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
                <button onClick={() => addSetRow(exIdx)} className="w-full py-2.5 border-t border-border text-sm font-semibold text-primary flex items-center justify-center gap-1 hover:bg-accent/50"><Plus className="w-4 h-4" /> Add set</button>
              </div>
            ))}

            {built.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No exercises yet</p>
                <p className="text-sm">Go back and pick a few from the bank</p>
              </div>
            )}

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
          </div>

          <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] glass border-t border-border">
            <Button className="w-full rounded-xl h-12 font-semibold" disabled={saving || built.length === 0} onClick={save}>
              {saving ? 'Saving...' : 'Save to My Workouts'}
            </Button>
          </div>
        </>
      )}
    </div>,
    document.body
  );
}