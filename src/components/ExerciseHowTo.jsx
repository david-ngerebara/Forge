// src/components/ExerciseHowTo.jsx
// "How to do this" bottom sheet for an exercise: looping demo (when we have one), step-by-step
// instructions, form cues, and two coach buttons (explain simply / easier version) that answer
// inside the sheet, so nobody has to leave their workout.
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import ExerciseDemo from '@/components/ExerciseDemo';
import { routineHelp } from '@/lib/warmupCooldown';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Rows from the exercises table, cached by lowercase name so reopening a sheet is instant.
const cache = new Map();

async function loadExercise(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  const escaped = name.trim().replace(/[\\%_]/g, '\\$&'); // ilike treats % and _ as wildcards
  const { data, error } = await supabase
    .from('exercises')
    .select('name, muscle_group, equipment, instructions, form_cues, demo_start, demo_end, steps')
    .ilike('name', escaped)
    .limit(1);
  if (error) return null; // not cached, so a later open can retry
  const row = data?.[0] || null;
  cache.set(key, row);
  return row;
}

// Removes markdown symbols so coach answers read as plain text (same idea as the Coach tab).
function cleanText(s = '') {
  return String(s)
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const asList = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);

// `exercise` is the exercise object from the workout ({ exercise_name, muscle_group, instructions, form_cues, ... }).
export default function ExerciseHowTo({ exercise, onClose }) {
  const name = exercise?.exercise_name || exercise?.name || 'Exercise';
  const isRoutine = exercise?.kind === 'routine'; // a warm-up / cool-down item
  const help = isRoutine ? routineHelp(name) : null; // built-in steps (and sometimes a demo) for our own routine items
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(null); // 'explain' | 'easier' | null
  const [answer, setAnswer] = useState('');
  const [askError, setAskError] = useState('');

  useEffect(() => {
    let alive = true;
    if (help) { setRow(null); setLoading(false); return undefined; }
    setLoading(true);
    loadExercise(name).then(r => { if (alive) { setRow(r); setLoading(false); } });
    return () => { alive = false; };
  }, [name, help]);

  const steps = help?.steps?.length ? help.steps
    : asList(row?.steps).length ? asList(row.steps)
    : [exercise?.instructions || row?.instructions].filter(Boolean);
  const cues = asList(exercise?.form_cues).length ? asList(exercise.form_cues) : asList(row?.form_cues);
  const muscle = (exercise?.muscle_group || row?.muscle_group || '').replace(/_/g, ' ');
  const equipment = (exercise?.equipment || row?.equipment || '').replace(/_/g, ' ');
  const demoStart = help?.demo?.[0] || row?.demo_start;
  const demoEnd = help?.demo?.[1] || row?.demo_end;
  const hasDemo = !!(demoStart && demoEnd);

  const ask = async (mode) => {
    setAsking(mode); setAnswer(''); setAskError('');
    try {
      const { data, error } = await supabase.functions.invoke('explain-exercise', { body: { exercise_name: name, mode, kind: isRoutine ? 'routine' : 'exercise' } });
      if (error || data?.error || !data?.text) throw new Error(data?.error || error?.message || 'No answer');
      setAnswer(cleanText(data.text));
    } catch {
      setAskError("Couldn't reach the coach right now. Try again in a moment.");
    } finally { setAsking(null); }
  };

  return createPortal(
    // Portaled to document.body with an inline z-index so the sheet always sits above the bottom nav.
    <div className="forge-overlay flex items-end sm:items-center justify-center" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }} onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl flex flex-col" style={{ maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3 p-5 pb-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-lg leading-tight">{name}</h3>
            {(muscle || equipment) && <p className="text-xs text-muted-foreground capitalize mt-0.5">{[muscle, equipment].filter(Boolean).join(' · ')}</p>}
            {exercise?.note && <p className="text-xs text-primary font-medium mt-1">{exercise.note}</p>}
          </div>
          <button onClick={onClose} className="flex-shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto px-5 space-y-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : hasDemo ? (
            <ExerciseDemo start={demoStart} end={demoEnd} name={name} />
          ) : (
            <p className="text-xs text-muted-foreground rounded-xl bg-muted p-3">No demo image for this exercise yet. Follow the steps below, or ask the coach to walk you through it.</p>
          )}

          {steps.length > 0 && (
            <div>
              <p className="forge-eyebrow text-muted-foreground mb-2">{steps.length > 1 ? 'Steps' : 'How to'}</p>
              {steps.length > 1 ? (
                <ol className="space-y-2.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm">{steps[0]}</p>}
            </div>
          )}

          {cues.length > 0 && (
            <div>
              <p className="forge-eyebrow text-muted-foreground mb-2">Form cues</p>
              <div className="flex flex-wrap gap-1.5">{cues.map((c, i) => <span key={i} className="text-xs bg-muted px-2.5 py-1 rounded-full">{c}</span>)}</div>
            </div>
          )}

          <div className="rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center gap-2 text-primary"><Sparkles className="w-4 h-4" /><p className="font-semibold text-sm">Still not sure?</p></div>
            <div className={cn('grid gap-2', isRoutine ? 'grid-cols-1' : 'grid-cols-2')}>
              {[['explain', 'Explain it simply'], ...(isRoutine ? [] : [['easier', 'Easier version']])].map(([mode, label]) => (
                <button key={mode} onClick={() => ask(mode)} disabled={!!asking} className={cn('h-10 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition', asking === mode ? 'border-primary text-primary' : 'border-border', asking && asking !== mode && 'opacity-50')}>
                  {asking === mode && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{label}
                </button>
              ))}
            </div>
            {answer && <p className="text-sm whitespace-pre-wrap">{answer}</p>}
            {askError && <p className="text-xs text-red-400">{askError}</p>}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
