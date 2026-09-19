import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Check, Flame, Dumbbell, Apple, Heart } from 'lucide-react';

const GOALS = ['Build muscle', 'Gain strength', 'Lose body fat', 'Maintain weight', 'Improve endurance', 'Athletic performance', 'General health', 'Improve consistency'];
const EQUIPMENT = ['Full gym', 'Dumbbells', 'Barbells', 'Machines', 'Cable machine', 'Resistance bands', 'Bodyweight', 'Home gym'];
const DIETS = ['No preference', 'Vegetarian', 'Vegan', 'Pescatarian', 'Halal', 'Kosher', 'Gluten-free', 'Dairy-free'];
const COOKING = ['Minimal cooking', 'Easy meals', 'Normal cooking', 'Advanced cooking'];

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2.5 rounded-full text-sm font-semibold border transition-all active:scale-95',
        active ? 'bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/30' : 'bg-card text-foreground border-border hover:border-primary/40'
      )}
    >
      {children}
    </button>
  );
}

function StepShell({ title, subtitle, children }) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <h2 className="text-2xl font-bold font-heading">{title}</h2>
      {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [data, setData] = useState({
    first_name: (user?.user_metadata?.full_name || user?.full_name)?.split(' ')[0] || '',
    age: null, sex: 'prefer_not_to_say', height: null, weight: null, units: 'imperial',
    goals: [], goal_priority: [], experience: 'beginner', training_history: '',
    days_per_week: 4, workout_duration: 45, workout_time: 'morning',
    equipment: [], favorite_exercises: [], disliked_exercises: [], injuries: '',
    nutrition_goal: 'maintain', daily_calorie_target: null, protein_target: null,
    dietary_preferences: [], allergies: [], favorite_foods: [], disliked_foods: [],
    cooking_preference: 'easy', cook_time: 20,
  });

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));
  const toggle = (k, v) => setData(d => {
    const arr = d[k] || [];
    return { ...d, [k]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] };
  });

  const steps = ['Welcome', 'About you', 'Goals', 'Experience', 'Schedule', 'Equipment', 'Exercise prefs', 'Nutrition', 'Diet & allergies', 'Review'];

  const next = () => setStep(s => Math.min(s + 1, steps.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));

  const toggleGoalPriority = (g) => {
    setData(d => {
      const arr = d.goal_priority || [];
      return { ...d, goal_priority: arr.includes(g) ? arr.filter(x => x !== g) : [...arr, g], goals: Array.from(new Set([...(d.goals || []), g])) };
    });
  };

  const finish = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('profiles').select('id').limit(1);
      const payload = { ...data, completed_onboarding: true };
      const { error } = existing?.[0]
        ? await supabase.from('profiles').update(payload).eq('id', existing[0].id)
        : await supabase.from('profiles').insert(payload);
      if (error) throw error;
      navigate('/', { replace: true });
    } catch (e) {
      alert('Could not save profile: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return data.first_name && data.age && data.height && data.weight;
    if (step === 2) return (data.goal_priority || []).length > 0;
    if (step === 5) return (data.equipment || []).length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto px-4 pt-6 pb-32">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={cn('h-1.5 rounded-full flex-1 transition-all', i <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        {step === 0 && (
          <div className="text-center pt-12 animate-in fade-in duration-500">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary text-primary-foreground mb-6 shadow-lg shadow-primary/30">
              <Flame className="w-10 h-10" strokeWidth={2.5} />
            </div>
            <h1 className="text-3xl font-bold font-heading">Welcome to Forge</h1>
            <p className="text-muted-foreground mt-3 max-w-xs mx-auto">Your AI fitness and nutrition coach. Let's build a plan that actually fits your life — it takes about 2 minutes.</p>
            <div className="grid grid-cols-3 gap-3 mt-10 text-left">
              <div className="bg-card border border-border rounded-2xl p-3"><Dumbbell className="w-5 h-5 text-primary" /><p className="text-xs font-semibold mt-2">Smart workouts</p></div>
              <div className="bg-card border border-border rounded-2xl p-3"><Apple className="w-5 h-5 text-primary" /><p className="text-xs font-semibold mt-2">Nutrition plans</p></div>
              <div className="bg-card border border-border rounded-2xl p-3"><Heart className="w-5 h-5 text-primary" /><p className="text-xs font-semibold mt-2">Recovery</p></div>
            </div>
          </div>
        )}

        {step === 1 && (
          <StepShell title="About you" subtitle="This helps calibrate your plan.">
            <div className="space-y-4">
              <div>
                <Label>First name</Label>
                <Input value={data.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Your name" className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Age</Label><Input type="number" value={data.age || ''} onChange={e => set('age', +e.target.value)} className="mt-1.5" /></div>
                <div>
                  <Label>Sex (optional)</Label>
                  <select value={data.sex} onChange={e => set('sex', e.target.value)} className="mt-1.5 w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
                    <option value="prefer_not_to_say">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => set('units', 'imperial')} className={cn('flex-1 py-2.5 rounded-xl border text-sm font-semibold', data.units === 'imperial' ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>= lbs / in</button>
                <button onClick={() => set('units', 'metric')} className={cn('flex-1 py-2.5 rounded-xl border text-sm font-semibold', data.units === 'metric' ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>= kg / cm</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{data.units === 'metric' ? 'Height (cm)' : 'Height (in)'}</Label><Input type="number" value={data.height || ''} onChange={e => set('height', +e.target.value)} className="mt-1.5" /></div>
                <div><Label>{data.units === 'metric' ? 'Weight (kg)' : 'Weight (lbs)'}</Label><Input type="number" value={data.weight || ''} onChange={e => set('weight', +e.target.value)} className="mt-1.5" /></div>
              </div>
            </div>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell title="Your goals" subtitle="Pick and prioritize what matters most.">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tap in priority order</p>
            <div className="flex flex-wrap gap-2">
              {GOALS.map(g => (
                <Chip key={g} active={(data.goal_priority || []).includes(g)} onClick={() => toggleGoalPriority(g)}>{g}</Chip>
              ))}
            </div>
            {(data.goal_priority || []).length > 0 && (
              <div className="mt-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Your priority order</p>
                <ol className="space-y-1.5">
                  {data.goal_priority.map((g, i) => (
                    <li key={g} className="flex items-center gap-2 text-sm"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</span>{g}</li>
                  ))}
                </ol>
              </div>
            )}
          </StepShell>
        )}

        {step === 3 && (
          <StepShell title="Experience" subtitle="No judgment — we meet you where you are.">
            <div className="space-y-2.5">
              {[['new', 'New to training', 'First time lifting or exercising regularly'], ['beginner', 'Beginner', 'A few months of consistent training'], ['intermediate', 'Intermediate', '1-3 years of training'], ['advanced', 'Advanced', '3+ years, know your way around']].map(([v, t, d]) => (
                <button key={v} onClick={() => set('experience', v)} className={cn('w-full text-left p-4 rounded-2xl border-2 transition-all', data.experience === v ? 'border-primary bg-accent' : 'border-border')}>
                  <p className="font-semibold">{t}</p><p className="text-sm text-muted-foreground">{d}</p>
                </button>
              ))}
            </div>
            <div className="mt-5">
              <Label>Previous training experience (optional)</Label>
              <textarea value={data.training_history} onChange={e => set('training_history', e.target.value)} placeholder="e.g. Played sports in college, took a break..." className="mt-1.5 w-full min-h-20 rounded-lg border border-input bg-background p-3 text-sm resize-none" />
            </div>
          </StepShell>
        )}

        {step === 4 && (
          <StepShell title="Schedule" subtitle="When and how long can you train?">
            <div>
              <Label>Days per week</Label>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {[2, 3, 4, 5, 6].map(d => (
                  <button key={d} onClick={() => set('days_per_week', d)} className={cn('py-3 rounded-xl border text-sm font-bold', data.days_per_week === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{d}</button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <Label>Preferred workout duration</Label>
              <div className="grid grid-cols-5 gap-2 mt-1.5">
                {[20, 30, 45, 60, 75].map(d => (
                  <button key={d} onClick={() => set('workout_duration', d)} className={cn('py-3 rounded-xl border text-xs font-bold', data.workout_duration === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{d}{d === 75 ? '+' : ''}m</button>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <Label>Preferred time</Label>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                {['morning', 'afternoon', 'evening'].map(t => (
                  <button key={t} onClick={() => set('workout_time', t)} className={cn('py-3 rounded-xl border text-sm font-semibold capitalize', data.workout_time === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{t}</button>
                ))}
              </div>
            </div>
          </StepShell>
        )}

        {step === 5 && (
          <StepShell title="Equipment" subtitle="Select everything you have access to.">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map(e => <Chip key={e} active={(data.equipment || []).includes(e)} onClick={() => toggle('equipment', e)}>{e}</Chip>)}
            </div>
            <p className="text-xs text-muted-foreground mt-4">We'll never prescribe equipment you don't have.</p>
          </StepShell>
        )}

        {step === 6 && (
          <StepShell title="Exercise preferences" subtitle="Help us pick movements you'll actually enjoy.">
            <div className="space-y-4">
              <div><Label>Favorite exercises (comma separated)</Label><Input value={(data.favorite_exercises || []).join(', ')} onChange={e => set('favorite_exercises', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Squats, pull-ups..." className="mt-1.5" /></div>
              <div><Label>Exercises you dislike</Label><Input value={(data.disliked_exercises || []).join(', ')} onChange={e => set('disliked_exercises', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="Burpees..." className="mt-1.5" /></div>
              <div>
                <Label>Injuries or limitations (optional)</Label>
                <textarea value={data.injuries} onChange={e => set('injuries', e.target.value)} placeholder="e.g. Lower back gets sore, bad right knee..." className="mt-1.5 w-full min-h-20 rounded-lg border border-input bg-background p-3 text-sm resize-none" />
                <p className="text-xs text-muted-foreground mt-1.5">We won't diagnose — we'll just avoid aggravating movements. For medical concerns, consult a professional.</p>
              </div>
            </div>
          </StepShell>
        )}

        {step === 7 && (
          <StepShell title="Nutrition goals" subtitle="Let's dial in your targets.">
            <div className="space-y-4">
              <div>
                <Label>Primary nutrition goal</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {[['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain weight'], ['recomp', 'Recomposition']].map(([v, t]) => (
                    <button key={v} onClick={() => set('nutrition_goal', v)} className={cn('py-3 rounded-xl border text-sm font-semibold', data.nutrition_goal === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Daily calorie target</Label><Input type="number" value={data.daily_calorie_target || ''} onChange={e => set('daily_calorie_target', +e.target.value || null)} placeholder="e.g. 2400" className="mt-1.5" /></div>
                <div><Label>Protein target (g)</Label><Input type="number" value={data.protein_target || ''} onChange={e => set('protein_target', +e.target.value || null)} placeholder="e.g. 180" className="mt-1.5" /></div>
              </div>
              <p className="text-xs text-muted-foreground">Leave blank and the coach will suggest targets. Never follow extreme calorie restriction — we won't recommend it.</p>
            </div>
          </StepShell>
        )}

        {step === 8 && (
          <StepShell title="Diet & allergies" subtitle="These are hard constraints for your meal plans.">
            <div>
              <Label>Dietary preferences</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {DIETS.map(d => <Chip key={d} active={(data.dietary_preferences || []).includes(d)} onClick={() => toggle('dietary_preferences', d)}>{d}</Chip>)}
              </div>
            </div>
            <div className="mt-5">
              <Label>Allergies (comma separated)</Label>
              <Input value={(data.allergies || []).join(', ')} onChange={e => set('allergies', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="peanuts, shellfish..." className="mt-1.5" />
              <p className="text-xs text-destructive mt-1.5 font-medium">We treat allergies as hard limits — we'll never recommend meals containing them.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div><Label>Favorite foods</Label><Input value={(data.favorite_foods || []).join(', ')} onChange={e => set('favorite_foods', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="chicken, rice..." className="mt-1.5" /></div>
              <div><Label>Foods you avoid</Label><Input value={(data.disliked_foods || []).join(', ')} onChange={e => set('disliked_foods', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="cilantro..." className="mt-1.5" /></div>
            </div>
            <div className="mt-5">
              <Label>Cooking preference</Label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {COOKING.map(c => <button key={c} onClick={() => set('cooking_preference', c.toLowerCase().split(' ')[0])} className={cn('py-2.5 rounded-xl border text-sm font-semibold', data.cooking_preference === c.toLowerCase().split(' ')[0] ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{c}</button>)}
              </div>
            </div>
          </StepShell>
        )}

        {step === 9 && (
          <StepShell title="Ready to forge" subtitle="Here's your setup. You can change anything later.">
            <div className="space-y-2 text-sm">
              <Row label="Name" value={data.first_name} />
              <Row label="Goals" value={(data.goal_priority || []).join(' → ')} />
              <Row label="Experience" value={data.experience} />
              <Row label="Schedule" value={`${data.days_per_week}×/week · ${data.workout_duration}min`} />
              <Row label="Equipment" value={(data.equipment || []).join(', ')} />
              <Row label="Nutrition" value={`${data.nutrition_goal} · ${data.daily_calorie_target || 'auto'}kcal`} />
              <Row label="Diet" value={(data.dietary_preferences || []).join(', ') || 'No preference'} />
              <Row label="Allergies" value={(data.allergies || []).join(', ') || 'None'} />
            </div>
          </StepShell>
        )}

        {/* Nav buttons */}
        <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto px-4 pb-6 pt-4 bg-gradient-to-t from-background to-transparent">
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="outline" onClick={back} className="rounded-xl h-12 px-4"><ChevronLeft className="w-5 h-5" /></Button>
            )}
            {step < steps.length - 1 ? (
              <Button onClick={next} disabled={!canProceed()} className="flex-1 rounded-xl h-12 text-base font-semibold">
                Continue <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving} className="flex-1 rounded-xl h-12 text-base font-semibold">
                {saving ? 'Saving...' : <>Start training <Check className="w-5 h-5 ml-1" /></>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 border-b border-border">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-right capitalize">{value || '—'}</span>
    </div>
  );
}