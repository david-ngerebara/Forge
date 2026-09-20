import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import ProgressRing from '@/components/ProgressRing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Plus, Trash2, ShoppingCart, ChefHat, Apple, ListChecks, X, Check, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

const todayStr = () => new Date().toISOString().slice(0, 10);
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];
const CATEGORIES = ['produce', 'meat_protein', 'dairy', 'grains', 'pantry', 'frozen', 'beverages', 'other'];
const CAT_LABELS = { produce: 'Produce', meat_protein: 'Meat / Protein', dairy: 'Dairy', grains: 'Grains', pantry: 'Pantry', frozen: 'Frozen', beverages: 'Beverages', other: 'Other' };

export default function Nutrition() {
  const { profile, loading } = useProfile();
  const [tab, setTab] = useState('dashboard');
  const [foodLogs, setFoodLogs] = useState([]);
  const [mealPlan, setMealPlan] = useState(null);
  const [grocery, setGrocery] = useState([]);
  const [pantry, setPantry] = useState([]);

  useEffect(() => {
    if (loading || !profile) return;
    loadAll();
  }, [loading, profile]);

  const loadAll = async () => {
    const [fl, mp, gl, pi] = await Promise.all([
      supabase.from('food_logs').select('*').eq('date', todayStr()).order('created_at'),
      supabase.from('meal_plans').select('*').eq('date', todayStr()).order('created_at', { ascending: false }).limit(1),
      supabase.from('grocery_items').select('*').order('created_at'),
      supabase.from('pantry_items').select('*').order('created_at'),
    ]);
    setFoodLogs(fl.data || []); setMealPlan(mp.data?.[0] || null); setGrocery(gl.data || []); setPantry(pi.data || []);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const macros = foodLogs.reduce((a, f) => {
    const m = Number(f.servings) || 1;
    a.cal += Number(f.calories) * m; a.protein += Number(f.protein) * m; a.carbs += Number(f.carbs) * m; a.fat += Number(f.fat) * m;
    return a;
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold font-heading">Fuel</h1>
        <p className="text-sm text-muted-foreground">Nutrition that works with your training</p>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto no-scrollbar">
        {[['dashboard', 'Today'], ['log', 'Food log'], ['plan', 'Meal plan'], ['grocery', 'Grocery'], ['pantry', 'Pantry']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition', tab === k ? 'bg-card shadow-sm' : 'text-muted-foreground')}>{l}</button>
        ))}
      </div>

      {tab === 'dashboard' && <Dashboard macros={macros} profile={profile} foodLogs={foodLogs} mealPlan={mealPlan} onLog={() => setTab('log')} onPlan={() => setTab('plan')} />}
      {tab === 'log' && <FoodLog foodLogs={foodLogs} onRefresh={loadAll} />}
      {tab === 'plan' && <MealPlan mealPlan={mealPlan} profile={profile} onRefresh={loadAll} />}
      {tab === 'grocery' && <Grocery items={grocery} onRefresh={loadAll} />}
      {tab === 'pantry' && <Pantry items={pantry} onRefresh={loadAll} />}
    </div>
  );
}

function Dashboard({ macros, profile, foodLogs, mealPlan, onLog, onPlan }) {
  const calTarget = profile?.daily_calorie_target || 2400;
  const proteinTarget = profile?.protein_target || 160;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card border border-border p-5 flex flex-col items-center">
        <ProgressRing value={macros.cal} max={calTarget} size={140} stroke={12} label={`${Math.round(macros.cal)}`} sublabel={`/ ${calTarget} kcal`} />
        <div className="grid grid-cols-3 gap-2 w-full mt-4">
          <MacroBar label="Protein" value={Math.round(macros.protein)} target={proteinTarget} color="hsl(var(--primary))" />
          <MacroBar label="Carbs" value={Math.round(macros.carbs)} target={Math.round(calTarget * 0.4 / 4)} color="hsl(var(--chart-3))" />
          <MacroBar label="Fat" value={Math.round(macros.fat)} target={Math.round(calTarget * 0.3 / 9)} color="hsl(var(--chart-5))" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onLog} className="rounded-2xl bg-card border border-border p-4 text-left active:scale-[0.98] transition">
          <Apple className="w-6 h-6 text-primary mb-2" />
          <p className="font-semibold text-sm">Log food</p>
          <p className="text-xs text-muted-foreground">{foodLogs.length} entries today</p>
        </button>
        <button onClick={onPlan} className="rounded-2xl bg-card border border-border p-4 text-left active:scale-[0.98] transition">
          <ChefHat className="w-6 h-6 text-primary mb-2" />
          <p className="font-semibold text-sm">Meal plan</p>
          <p className="text-xs text-muted-foreground">{mealPlan ? 'Today ready' : 'Generate one'}</p>
        </button>
      </div>

      {mealPlan && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Today's plan</p>
          {mealPlan.meals?.map((m, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-border last:border-0">
              <div><p className="text-sm font-semibold capitalize">{m.meal_type}</p><p className="text-xs text-muted-foreground">{m.description}</p></div>
              <p className="text-xs text-muted-foreground">{m.calories || 0} kcal</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MacroBar({ label, value, target, color }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} /></div>
      <p className="text-xs font-bold mt-1">{value}g</p>
      <p className="text-[10px] text-muted-foreground">{label} · {target}g</p>
    </div>
  );
}

function FoodLog({ foodLogs, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false);
  const grouped = MEAL_TYPES.reduce((acc, t) => { acc[t] = foodLogs.filter(f => f.meal_type === t); return acc; }, {});

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowAdd(true)} className="w-full rounded-xl h-12 font-semibold"><Plus className="w-4 h-4 mr-1.5" /> Add food</Button>
      {MEAL_TYPES.map(t => grouped[t]?.length > 0 && (
        <div key={t} className="rounded-2xl bg-card border border-border p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground capitalize mb-2">{t}</p>
          {grouped[t].map(f => (
            <div key={f.id} className="flex justify-between items-center py-2 border-b border-border last:border-0">
              <div><p className="text-sm font-semibold">{f.food_name}</p><p className="text-xs text-muted-foreground">{f.serving_size || `${f.servings || 1}×`} · {Math.round((f.calories || 0) * (f.servings || 1))} kcal · P{Math.round((f.protein || 0) * (f.servings || 1))}g</p></div>
              <button onClick={async () => { await supabase.from('food_logs').delete().eq('id', f.id); onRefresh(); }} className="text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      ))}
      {foodLogs.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">No food logged today. Tap "Add food".</p>}
      {showAdd && <AddFoodModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); onRefresh(); }} />}
    </div>
  );
}

function AddFoodModal({ onClose, onSaved }) {
  const [data, setData] = useState({ meal_type: 'breakfast', food_name: '', serving_size: '', servings: 1, calories: '', protein: '', carbs: '', fat: '', fiber: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const save = async () => {
    if (!data.food_name) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('food_logs').insert({ ...data, date: todayStr(), calories: +data.calories || 0, protein: +data.protein || 0, carbs: +data.carbs || 0, fat: +data.fat || 0, fiber: +data.fiber || 0, servings: +data.servings || 1 });
      if (error) throw error;
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return createPortal(
    // Portaled to document.body with an inline z-index so the sheet (and its Save button) always sits above the bottom nav.
    <div className="forge-overlay flex items-end sm:items-center justify-center" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }} onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4"><h3 className="font-bold">Add food</h3><button onClick={onClose}><X className="w-5 h-5" /></button></div>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {MEAL_TYPES.map(t => <button key={t} onClick={() => set('meal_type', t)} className={cn('flex-1 py-2 rounded-lg text-xs font-semibold capitalize border', data.meal_type === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>{t}</button>)}
          </div>
          <Input placeholder="Food name" value={data.food_name} onChange={e => set('food_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Serving size" value={data.serving_size} onChange={e => set('serving_size', e.target.value)} />
            <Input type="number" placeholder="Servings" value={data.servings} onChange={e => set('servings', e.target.value)} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Input type="number" placeholder="Cal" value={data.calories} onChange={e => set('calories', e.target.value)} />
            <Input type="number" placeholder="Protein" value={data.protein} onChange={e => set('protein', e.target.value)} />
            <Input type="number" placeholder="Carbs" value={data.carbs} onChange={e => set('carbs', e.target.value)} />
            <Input type="number" placeholder="Fat" value={data.fat} onChange={e => set('fat', e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Enter nutrition per serving — we multiply by servings.</p>
        </div>
        <Button onClick={save} disabled={saving || !data.food_name} className="w-full mt-4 rounded-xl h-12 font-semibold">{saving ? 'Saving...' : 'Add'}</Button>
      </div>
    </div>,
    document.body
  );
}

// ---- Meal plan variety ----
const CUISINES = ['Mediterranean', 'Mexican', 'Thai', 'Japanese', 'Indian', 'Korean', 'Middle Eastern', 'Greek', 'Vietnamese', 'Italian', 'Moroccan', 'Caribbean', 'Ethiopian', 'Peruvian', 'Lebanese', 'Spanish', 'Chinese (home-style)', 'Southern US (lightened)'];
const PROTEINS = ['chicken', 'turkey', 'salmon', 'white fish (cod or tilapia)', 'shrimp', 'tuna', 'eggs', 'tofu', 'tempeh', 'lentils', 'chickpeas', 'black beans', 'lean beef', 'pork tenderloin', 'Greek yogurt or cottage cheese', 'edamame'];
const BREAKFAST_STYLES = ['egg-based', 'oats or overnight oats', 'yogurt bowl', 'smoothie bowl', 'savory breakfast bowl', 'protein pancakes or waffles', 'breakfast wrap or burrito', 'chia pudding', 'toast with a protein topping'];
const SNACK_STYLES = ['fruit and protein', 'veggies with a dip', 'nuts and seeds', 'yogurt-based', 'roasted chickpeas or edamame', 'cheese and whole-grain crackers', 'homemade energy bites', 'protein shake'];

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Random constraints per meal slot. Lunch and dinner always get different cuisines and proteins.
function buildVariety() {
  const cuisines = shuffle(CUISINES);
  const proteins = shuffle(PROTEINS);
  return {
    seed: Math.random().toString(36).slice(2, 10),
    slots: {
      breakfast: { style: shuffle(BREAKFAST_STYLES)[0] },
      lunch: { cuisine: cuisines[0], protein: proteins[0] },
      dinner: { cuisine: cuisines[1], protein: proteins[1] },
      snack: { style: shuffle(SNACK_STYLES)[0] },
    },
  };
}

// Titles of meals from the last 10 days of plans (including today's current plan) so the planner can skip them.
async function loadRecentMeals() {
  try {
    const since = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const { data } = await supabase.from('meal_plans').select('meals').gte('date', since).order('created_at', { ascending: false }).limit(30);
    const seen = new Set();
    (data || []).forEach(p => (p.meals || []).forEach(m => {
      const t = (m.recipe_title || m.description || '').trim().slice(0, 80);
      if (t) seen.add(t);
    }));
    return [...seen].slice(0, 60);
  } catch { return []; }
}

function MealPlan({ mealPlan, profile, onRefresh }) {
  const [generating, setGenerating] = useState(false);
  const generate = async () => {
    setGenerating(true);
    try {
      // Send the last ~10 days of meals plus fresh random cuisine/protein picks so every click starts from different inputs.
      const avoid_meals = await loadRecentMeals();
      const { data, error } = await supabase.functions.invoke('generate-meal-plan', { body: { date: todayStr(), avoid_meals, variety: buildVariety() } });
      if (error) throw error;
      if (data?.error) alert(data.error);
      await onRefresh();
    } catch (e) { alert(e.message); }
    finally { setGenerating(false); }
  };
  return (
    <div className="space-y-4">
      <Button onClick={generate} disabled={generating} className="w-full rounded-xl h-12 font-semibold"><Sparkles className="w-4 h-4 mr-1.5" /> {generating ? 'Planning...' : mealPlan ? 'Regenerate plan' : 'Generate meal plan'}</Button>
      {mealPlan ? (
        <>
          {mealPlan.coach_note && <div className="rounded-2xl bg-accent border border-border p-3 text-sm flex gap-2"><Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" /><p className="text-accent-foreground">{mealPlan.coach_note}</p></div>}
          {mealPlan.meals?.map((m, i) => (
            <div key={i} className="rounded-2xl bg-card border border-border p-4">
              <p className="text-xs font-bold uppercase text-primary capitalize">{m.meal_type}</p>
              <p className="font-semibold mt-0.5">{m.recipe_title || m.description}</p>
              {m.recipe_title && m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
              <p className="text-xs text-muted-foreground mt-1">{m.calories || 0} kcal · {m.protein || 0}g protein</p>
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center">Grocery items were auto-added to your list.</p>
        </>
      ) : (
        <div className="text-center py-10 text-muted-foreground"><ChefHat className="w-10 h-10 mx-auto mb-3 opacity-40" /><p className="text-sm">Generate a plan tailored to your goals, pantry, and today's training.</p></div>
      )}
    </div>
  );
}

function Grocery({ items, onRefresh }) {
  const [newName, setNewName] = useState('');
  const grouped = CATEGORIES.reduce((acc, c) => { acc[c] = items.filter(i => i.category === c); return acc; }, {});

  const toggle = async (item) => { await supabase.from('grocery_items').update({ checked: !item.checked }).eq('id', item.id); onRefresh(); };
  const remove = async (id) => { await supabase.from('grocery_items').delete().eq('id', id); onRefresh(); };
  const add = async () => { if (!newName) return; await supabase.from('grocery_items').insert({ name: newName, category: 'other', quantity: '1', checked: false, source: 'manual' }); setNewName(''); onRefresh(); };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Add item..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <Button onClick={add} className="rounded-xl px-4"><Plus className="w-4 h-4" /></Button>
      </div>
      {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-10">Your grocery list is empty. Generate a meal plan or add items.</p>}
      {CATEGORIES.map(c => grouped[c]?.length > 0 && (
        <div key={c} className="rounded-2xl bg-card border border-border p-4">
          <p className="text-xs font-bold uppercase text-muted-foreground mb-2">{CAT_LABELS[c]}</p>
          {grouped[c].map(item => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <button onClick={() => toggle(item)} className={cn('w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0', item.checked ? 'bg-primary border-primary text-primary-foreground' : 'border-border')}>{item.checked && <Check className="w-4 h-4" />}</button>
              <span className={cn('flex-1 text-sm', item.checked && 'line-through text-muted-foreground')}>{item.name} <span className="text-xs text-muted-foreground">{item.quantity}</span></span>
              <button onClick={() => remove(item.id)} className="text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Pantry({ items, onRefresh }) {
  const [newName, setNewName] = useState('');
  const add = async () => { if (!newName) return; await supabase.from('pantry_items').insert({ name: newName, category: 'other', quantity: '1', have: true }); setNewName(''); onRefresh(); };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Track what you have — the AI meal planner prioritizes recipes using these.</p>
      <div className="flex gap-2">
        <Input placeholder="Add ingredient..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <Button onClick={add} className="rounded-xl px-4"><Plus className="w-4 h-4" /></Button>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">No pantry items yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-1.5 bg-card border border-border rounded-full pl-3 pr-1 py-1">
              <span className={cn('text-sm', !item.have && 'line-through text-muted-foreground')}>{item.name}</span>
              <button onClick={async () => { await supabase.from('pantry_items').update({ have: !item.have }).eq('id', item.id); onRefresh(); }} className={cn('w-6 h-6 rounded-full flex items-center justify-center', item.have ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}><Check className="w-3.5 h-3.5" /></button>
              <button onClick={async () => { await supabase.from('pantry_items').delete().eq('id', item.id); onRefresh(); }} className="text-muted-foreground pl-0.5"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}