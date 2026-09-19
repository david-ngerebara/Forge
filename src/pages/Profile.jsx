import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings as SettingsIcon, LogOut, Scale, ChevronRight, Edit3, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Profile() {
  const { profile, loading, refresh } = useProfile();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState([]);
  const [form, setForm] = useState(null);
  const [showWeight, setShowWeight] = useState(false);

  useEffect(() => { if (profile) setForm({ ...profile }); supabase.from('body_measurements').select('*').order('date', { ascending: false }).limit(20).then(({ data }) => setBody(data || [])); }, [profile]);

  if (loading || !profile) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>;

  const save = async () => {
    const { id, user_id, created_at, ...changes } = form;
    await supabase.from('profiles').update(changes).eq('id', profile.id);
    await refresh();
    setEditing(false);
  };

  const addWeight = async (weight) => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = body.find(b => b.date === today);
    if (existing) await supabase.from('body_measurements').update({ weight }).eq('id', existing.id);
    else await supabase.from('body_measurements').insert({ date: today, weight });
    const { data } = await supabase.from('body_measurements').select('*').order('date', { ascending: false }).limit(20);
    setBody(data || []);
    setShowWeight(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center">{(profile.first_name?.[0] || 'F').toUpperCase()}</div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-heading">{profile.first_name}</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
        <button onClick={() => setEditing(e => !e)} className="w-10 h-10 rounded-xl border border-border flex items-center justify-center">{editing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}</button>
      </div>

      {editing && form && (
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Age</Label><Input type="number" value={form.age || ''} onChange={e => setForm(f => ({ ...f, age: +e.target.value }))} className="mt-1.5" /></div>
            <div><Label>Weight</Label><Input type="number" value={form.weight || ''} onChange={e => setForm(f => ({ ...f, weight: +e.target.value }))} className="mt-1.5" /></div>
          </div>
          <div><Label>Daily calorie target</Label><Input type="number" value={form.daily_calorie_target || ''} onChange={e => setForm(f => ({ ...f, daily_calorie_target: +e.target.value || null }))} className="mt-1.5" /></div>
          <div><Label>Protein target (g)</Label><Input type="number" value={form.protein_target || ''} onChange={e => setForm(f => ({ ...f, protein_target: +e.target.value || null }))} className="mt-1.5" /></div>
          <Button onClick={save} className="w-full rounded-xl h-11"><Check className="w-4 h-4 mr-1.5" /> Save changes</Button>
        </div>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Experience" value={profile.experience} />
        <StatCard label="Days/week" value={profile.days_per_week} />
        <StatCard label="Duration" value={`${profile.workout_duration}m`} />
      </div>

      {/* Goals */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Goals (priority)</p>
        {(profile.goal_priority || []).length ? (
          <ol className="space-y-1.5">
            {profile.goal_priority.map((g, i) => <li key={g} className="flex items-center gap-2 text-sm"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">{i + 1}</span>{g}</li>)}
          </ol>
        ) : <p className="text-sm text-muted-foreground">No goals set</p>}
      </div>

      {/* Equipment */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Equipment</p>
        <div className="flex flex-wrap gap-1.5">
          {(profile.equipment || []).map(e => <span key={e} className="text-xs bg-muted px-2.5 py-1 rounded-full">{e}</span>)}
        </div>
      </div>

      {/* Body weight tracking */}
      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2"><Scale className="w-4 h-4 text-primary" /><p className="font-bold text-sm">Body weight</p></div>
          <Button size="sm" variant="outline" onClick={() => setShowWeight(true)} className="rounded-lg h-8 text-xs">Log weight</Button>
        </div>
        {body.length > 0 ? (
          <div className="flex justify-between items-end">
            <div><p className="text-2xl font-bold">{body[0].weight} <span className="text-sm text-muted-foreground">{profile.units === 'metric' ? 'kg' : 'lb'}</span></p><p className="text-xs text-muted-foreground">Latest · {new Date(body[0].date).toLocaleDateString()}</p></div>
            {body.length > 1 && <p className={cn('text-sm font-semibold', body[0].weight < body[1].weight ? 'text-emerald-300' : body[0].weight > body[1].weight ? 'text-primary' : 'text-muted-foreground')}>{body[0].weight < body[1].weight ? '↓' : body[0].weight > body[1].weight ? '↑' : '—'} {Math.abs((body[0].weight - body[1].weight)).toFixed(1)}</p>}
          </div>
        ) : <p className="text-sm text-muted-foreground">No measurements logged yet.</p>}
      </div>

      {/* Menu */}
      <div className="rounded-2xl bg-card border border-border divide-y divide-border overflow-hidden">
        <button onClick={() => navigate('/settings')} className="w-full flex items-center gap-3 p-4 active:bg-muted transition"><SettingsIcon className="w-5 h-5 text-muted-foreground" /><span className="flex-1 text-left text-sm font-semibold">Settings</span><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
        <button onClick={() => navigate('/onboarding')} className="w-full flex items-center gap-3 p-4 active:bg-muted transition"><Edit3 className="w-5 h-5 text-muted-foreground" /><span className="flex-1 text-left text-sm font-semibold">Redo onboarding</span><ChevronRight className="w-4 h-4 text-muted-foreground" /></button>
        <button onClick={() => logout()} className="w-full flex items-center gap-3 p-4 active:bg-muted transition text-destructive"><LogOut className="w-5 h-5" /><span className="flex-1 text-left text-sm font-semibold">Log out</span></button>
      </div>

      {showWeight && <WeightModal onClose={() => setShowWeight(false)} onSave={addWeight} unit={profile.units} />}
    </div>
  );
}

function StatCard({ label, value }) {
  return <div className="rounded-2xl bg-card border border-border p-3 text-center"><p className="font-bold capitalize">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}

function WeightModal({ onClose, onSave, unit }) {
  const [w, setW] = useState('');
  return createPortal(
    // Portaled to document.body with an inline z-index so the sheet (and its Save button) always sits above the bottom nav.
    <div className="forge-overlay flex items-end sm:items-center justify-center" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }} onClick={onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-3">Log weight</h3>
        <Input type="number" autoFocus value={w} onChange={e => setW(e.target.value)} placeholder={`Weight in ${unit === 'metric' ? 'kg' : 'lb'}`} className="h-12" />
        <Button onClick={() => onSave(+w)} disabled={!w} className="w-full mt-3 rounded-xl h-12">Save</Button>
      </div>
    </div>,
    document.body
  );
}