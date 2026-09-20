// src/components/ExerciseDemo.jsx
// Looping start/end demo for an exercise. Both frames are stacked and cross-faded about once a second.
// Tap the pills to hold on one frame, or the play/pause button. Shows nothing if the images can't load.
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const BUCKET = 'exercise-demos';
const FRAME_MS = 1000;
const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

export default function ExerciseDemo({ start, end, name = 'exercise' }) {
  const [frame, setFrame] = useState(0); // 0 = start position, 1 = end position
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (paused || failed || reduceMotion) return;
    const t = setInterval(() => setFrame(f => 1 - f), FRAME_MS);
    return () => clearInterval(t);
  }, [paused, failed, reduceMotion]);

  if (!start || !end || failed) return null;
  const a = publicUrl(start);
  const b = publicUrl(end);

  // People who prefer reduced motion get both positions side by side instead of an animation.
  if (reduceMotion) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {[['Start', a], ['End', b]].map(([label, src]) => (
          <div key={label} className="relative aspect-[3/2] rounded-2xl overflow-hidden bg-muted">
            <img src={src} alt={`${name}, ${label.toLowerCase()} position`} onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-contain" />
            <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold uppercase bg-black/60 text-white px-2 py-0.5 rounded-full">{label}</span>
          </div>
        ))}
      </div>
    );
  }

  const hold = (f) => { setFrame(f); setPaused(true); };

  return (
    <div className="relative aspect-[3/2] rounded-2xl overflow-hidden bg-muted">
      <img src={a} alt={`${name}, start position`} onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-contain" />
      <img src={b} alt={`${name}, end position`} onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-contain transition-opacity duration-300" style={{ opacity: frame }} />
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="flex gap-1">
          {[['Start', 0], ['End', 1]].map(([label, f]) => (
            <button key={label} type="button" onClick={() => hold(f)} className={cn('text-[10px] font-bold uppercase px-2.5 py-1 rounded-full backdrop-blur', frame === f ? 'bg-primary text-primary-foreground' : 'bg-black/60 text-white')}>{label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setPaused(p => !p)} className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center backdrop-blur" aria-label={paused ? 'Play demo' : 'Pause demo'}>
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
