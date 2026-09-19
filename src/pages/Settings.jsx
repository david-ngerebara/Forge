import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Bell, Shield, Info, ChevronRight, Heart, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [showErase, setShowErase] = useState(false);
  const [notifs, setNotifs] = useState({
    workout_reminder: true, meal_reminder: false, hydration_reminder: true,
    recovery_checkin: true, workout_completion: true, new_pr: true, meal_plan: false,
  });

  const toggle = (k) => setNotifs(n => ({ ...n, [k]: !n[k] }));

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground font-medium">← Back</button>
      <h1 className="text-2xl font-bold font-heading">Settings</h1>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border"><Bell className="w-4 h-4 text-primary" /><p className="font-bold text-sm">Notifications</p></div>
        {[
          ['workout_reminder', 'Workout reminder'],
          ['meal_reminder', 'Meal reminder'],
          ['hydration_reminder', 'Hydration reminder'],
          ['recovery_checkin', 'Recovery check-in'],
          ['workout_completion', 'Workout completion'],
          ['new_pr', 'New personal record'],
          ['meal_plan', 'Meal plan reminder'],
        ].map(([k, l]) => (
          <div key={k} className="flex items-center justify-between p-4 border-b border-border last:border-0">
            <span className="text-sm font-medium">{l}</span>
            <button onClick={() => toggle(k)} className={cn('w-11 h-6 rounded-full transition relative', notifs[k] ? 'bg-primary' : 'bg-muted')}>
              <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all', notifs[k] ? 'left-5.5' : 'left-0.5')} style={{ left: notifs[k] ? '22px' : '2px' }} />
            </button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground p-4">Notifications are stored on this device for now.</p>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border"><Shield className="w-4 h-4 text-primary" /><p className="font-bold text-sm">Privacy</p></div>
        <div className="p-4 space-y-2 text-sm text-muted-foreground">
          <p>• Your workout, nutrition, and health data is private to your account.</p>
          <p>• AI conversations are stored only in your account and can be deleted anytime.</p>
          <p>• We don't sell your data. Analytics are limited to product usage (workouts completed, recipes saved).</p>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border"><Heart className="w-4 h-4 text-primary" /><p className="font-bold text-sm">Safety</p></div>
        <div className="p-4 text-sm text-muted-foreground">
          <p>Forge provides general fitness and nutrition guidance, not medical advice. If you experience pain, dizziness, chest pain, or severe shortness of breath, stop and consult a qualified healthcare professional. We do not promote crash diets or extreme calorie restriction.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border"><Trash2 className="w-4 h-4 text-destructive" /><p className="font-bold text-sm">Your data</p></div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">Erase everything you've logged: workouts, records, weight, food, recipes, grocery and pantry lists, meal plans, and coach chats. Your login stays, and the exercise library isn't touched.</p>
          <Button variant="outline" onClick={() => setShowErase(true)} className="w-full rounded-xl h-11 font-semibold text-destructive border-destructive/40"><Trash2 className="w-4 h-4 mr-1.5" /> Erase my data</Button>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border"><Info className="w-4 h-4 text-primary" /><p className="font-bold text-sm">About</p></div>
        <div className="p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Forge</p>
          <p className="mt-1">Your AI fitness and nutrition coach. Version 1.0.</p>
        </div>
      </div>

      {showErase && <EraseModal onClose={() => setShowErase(false)} />}
    </div>
  );
}

// Confirmation sheet for erasing data. Asks you to type ERASE first, since this can't be undone.
// Runs the erase_my_data() database function (see erase_my_data.sql), which only ever deletes your own rows.
function EraseModal({ onClose }) {
  const [typed, setTyped] = useState('');
  const [includeProfile, setIncludeProfile] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const erase = async () => {
    setWorking(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('erase_my_data', { include_profile: includeProfile });
      if (rpcError) throw rpcError;
      // Water intake is kept on this device, so clear that too.
      try { Object.keys(localStorage).filter(k => k.startsWith('forge_water_')).forEach(k => localStorage.removeItem(k)); } catch (e) { /* not critical */ }
      setResult(data || {});
    } catch (e) {
      const missing = /erase_my_data|Could not find the function|schema cache/i.test(e.message || '');
      setError(missing ? "The erase function isn't set up in your database yet. Run erase_my_data.sql in the Supabase SQL Editor, then try again." : (e.message || 'Could not erase your data.'));
    } finally { setWorking(false); }
  };

  const done = () => { window.location.href = includeProfile ? '/onboarding' : '/'; }; // fresh load so every screen shows the empty state

  return createPortal(
    // Portaled to document.body with an inline z-index so the sheet (and its buttons) always sits above the bottom nav.
    <div className="forge-overlay flex items-end sm:items-center justify-center" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483000 }} onClick={working || result ? undefined : onClose}>
      <div className="bg-card w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }} onClick={e => e.stopPropagation()}>
        {result ? (
          <>
            <h3 className="font-bold">Data erased</h3>
            <p className="text-sm text-muted-foreground">Your logged data has been deleted.</p>
            {result.skipped?.length > 0 && (
              <div className="forge-warn p-3 rounded-2xl text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 mb-1" />
                Couldn't clear: {result.skipped.join(', ')}. Those tables don't have a user_id column, so they were left alone.
              </div>
            )}
            <Button onClick={done} className="w-full rounded-xl h-12 font-semibold">Done</Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" /><h3 className="font-bold">Erase all your data?</h3></div>
            <p className="text-sm text-muted-foreground">This permanently deletes your workouts, personal records, weight entries, food logs, recovery check-ins, recipes, grocery and pantry lists, meal plans, saved workouts, and coach chats. It can't be undone.</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={includeProfile} onChange={e => setIncludeProfile(e.target.checked)} className="w-4 h-4 mt-0.5 accent-primary" />
              <span>Also reset my profile and goals <span className="text-muted-foreground">(you'll go through onboarding again)</span></span>
            </label>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Type ERASE to confirm</p>
              <input value={typed} onChange={e => setTyped(e.target.value)} autoCapitalize="characters" autoCorrect="off" placeholder="ERASE" className="w-full h-12 rounded-xl border border-input bg-background px-3 text-sm" />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={working} className="flex-1 rounded-xl h-12">Cancel</Button>
              <Button onClick={erase} disabled={working || typed.trim().toUpperCase() !== 'ERASE'} className="flex-1 rounded-xl h-12 font-semibold bg-destructive text-white hover:bg-destructive/90">
                {working ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Erasing...</> : 'Erase'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}