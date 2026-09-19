// supabase/functions/generate-workout/index.ts
//
// Builds today's workout from YOUR exercise bank (the `exercises` table) instead of letting
// the AI invent exercises from memory, which is why every workout looked the same.
//
// How variety works:
//   1. The server decides the split (Push / Pull / Legs / Upper / Full Body) from which muscle
//      groups you've trained least recently.
//   2. For each muscle group in that split it draws a RANDOM sample of exercises from the bank,
//      skipping anything from your last few workouts and anything in `exclude_exercises`.
//   3. Gemini may only choose from that sampled list (names must match exactly). Anything it
//      returns that isn't in the bank is discarded, and gaps are filled from the sample.
//   4. If Gemini fails, a bank-only fallback still builds a varied workout.
//
// Request : { exclude_exercises?: string[], profile?: object }
// Response: { workout }  or  { error }   (errors are returned with HTTP 200 so the app can show the message)
//
// Secrets: GEMINI_API_KEY (required for AI mode). Optional: GEMINI_MODEL (default gemini-2.5-flash).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------- small helpers ----------
const norm = (s: unknown) => String(s ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
const key = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};
function rand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000));

// ---------- splits ----------
// `slots` = how many exercises from each muscle group. `arms` slots can be steered to triceps or biceps by name.
const TRICEPS = /tricep|pushdown|skull|dip|overhead.*extension|kickback|close.?grip/i;
const BICEPS = /curl|bicep|hammer|chin/i;
type Slot = { group: string; hint?: RegExp };
const SPLITS: { key: string; label: string; slots: Slot[] }[] = [
  { key: 'push', label: 'Push', slots: [
    { group: 'chest' }, { group: 'chest' }, { group: 'shoulders' }, { group: 'shoulders' },
    { group: 'arms', hint: TRICEPS }, { group: 'arms', hint: TRICEPS } ] },
  { key: 'pull', label: 'Pull', slots: [
    { group: 'back' }, { group: 'back' }, { group: 'back' },
    { group: 'arms', hint: BICEPS }, { group: 'arms', hint: BICEPS }, { group: 'core' } ] },
  { key: 'legs', label: 'Legs', slots: [
    { group: 'legs' }, { group: 'legs' }, { group: 'legs' }, { group: 'glutes' }, { group: 'glutes' }, { group: 'core' } ] },
  { key: 'upper', label: 'Upper Body', slots: [
    { group: 'chest' }, { group: 'chest' }, { group: 'back' }, { group: 'back' }, { group: 'shoulders' }, { group: 'arms' } ] },
  { key: 'full', label: 'Full Body', slots: [
    { group: 'legs' }, { group: 'chest' }, { group: 'back' }, { group: 'shoulders' }, { group: 'glutes' }, { group: 'core' } ] },
];

function pickSplit(lastTrained: Record<string, number>, hasHistory: boolean) {
  if (!hasHistory) return SPLITS.find((s) => s.key === 'full')!;
  const scored = SPLITS.map((s) => {
    const groups = [...new Set(s.slots.map((x) => x.group))];
    const rest = groups.reduce((sum, g) => sum + Math.min(14, lastTrained[g] ?? 14), 0) / groups.length;
    // Full body is the "default" so it shouldn't win every time; small random jitter breaks ties.
    return { s, score: rest + rand() * 1.5 - (s.key === 'full' ? 1 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].s;
}

// ---------- profile helpers (tolerant of different column names) ----------
function goalInfo(profile: any) {
  const g = norm(profile?.goal ?? profile?.fitness_goal ?? profile?.primary_goal ?? profile?.goals);
  if (/strength|power/.test(g)) return { label: 'Strength', reps: [4, 6], sets: 4, rest: 150, rir: 2 };
  if (/muscle|hypertrophy|bulk|gain/.test(g)) return { label: 'Hypertrophy', reps: [8, 12], sets: 3, rest: 90, rir: 2 };
  if (/fat|loss|lean|cut|weight/.test(g)) return { label: 'Conditioning', reps: [10, 15], sets: 3, rest: 60, rir: 2 };
  return { label: 'Strength', reps: [8, 12], sets: 3, rest: 90, rir: 2 };
}
function experienceScale(profile: any): number {
  const e = norm(profile?.experience ?? profile?.experience_level ?? profile?.level);
  if (/begin|novice|new/.test(e)) return 0.6;
  if (/advanc|expert/.test(e)) return 1.4;
  return 1;
}
function userEquipment(profile: any): string[] | null {
  const raw = profile?.equipment ?? profile?.available_equipment ?? profile?.equipment_access ?? profile?.gym_equipment;
  if (!raw) return null;
  const list = (Array.isArray(raw) ? raw : String(raw).split(/[,;]/)).map(norm).filter(Boolean);
  return list.length ? list : null;
}
function equipmentOk(exEq: unknown, user: string[] | null): boolean {
  if (!user) return true;
  if (user.some((u) => u.includes('full') || u.includes('gym'))) return true;
  const e = norm(exEq);
  if (!e || e === 'none' || e.includes('bodyweight') || e === 'body_only') return true;
  const strip = (x: string) => x.replace(/s$/, '');
  return user.some((u) => e.includes(u) || u.includes(e) || strip(e) === strip(u));
}
function sessionSlots(profile: any, total: number): number {
  const m = Number(profile?.session_minutes ?? profile?.workout_duration ?? profile?.session_length);
  if (Number.isFinite(m) && m > 0) return m <= 30 ? Math.min(total, 4) : m <= 45 ? Math.min(total, 5) : total;
  return total;
}

// ---------- weights ----------
const BASE_KG: Record<string, number> = { barbell: 30, dumbbell: 8, cable: 15, machine: 20, kettlebell: 12, smith: 25, ez: 20 };
function startingWeight(equipment: unknown, metric: boolean, scale: number): number {
  const e = norm(equipment);
  if (!e || e.includes('bodyweight') || e === 'none' || e.includes('band')) return 0;
  const hit = Object.keys(BASE_KG).find((k) => e.includes(k));
  const kg = (hit ? BASE_KG[hit] : 10) * scale;
  if (metric) return Math.max(2.5, Math.round(kg / 2.5) * 2.5);
  return Math.max(5, Math.round((kg * 2.205) / 5) * 5);
}

// ---------- Gemini ----------
async function callGemini(system: string, prompt: string): Promise<string> {
  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('GOOGLE_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 40000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1, responseMimeType: 'application/json', maxOutputTokens: 8192 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  } finally {
    clearTimeout(timer);
  }
}
function parseJson(text: string): any {
  const t = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch { /* try to find the object */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('AI returned no JSON');
}

// ---------- main ----------
export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: userData } = await sb.auth.getUser();
    const user = userData?.user;
    if (!user) return reply({ error: 'Please sign in again.' });

    const body = await req.json().catch(() => ({}));
    const exclude = new Set<string>((body?.exclude_exercises ?? []).map(key));
    const profile = body?.profile ?? {};
    const metric = profile?.units === 'metric';
    const unit = metric ? 'kg' : 'lb';
    const goal = goalInfo(profile);
    const scale = experienceScale(profile);

    // 1) The exercise bank
    const { data: bank, error: bankErr } = await sb.from('exercises').select('*');
    if (bankErr) throw bankErr;
    if (!bank || bank.length === 0) return reply({ error: 'Your exercises table is empty.' });
    const byKey = new Map<string, any>(bank.map((e: any) => [key(e.name), e]));

    // 2) Recent training: recency per muscle group, recently used exercises, last weights
    const { data: recent } = await sb.from('workouts')
      .select('date,status,exercises,focus').order('date', { ascending: false }).limit(30);
    const lastTrained: Record<string, number> = {};
    const recentNames = new Set<string>();
    const lastLift = new Map<string, { weight: number; hitTop: boolean }>();
    (recent ?? []).forEach((w: any, idx: number) => {
      const d = daysBetween(today(), w.date);
      (w.exercises ?? []).forEach((ex: any) => {
        if (ex.skipped) return;
        const g = norm(ex.muscle_group);
        if (w.status !== 'planned' && lastTrained[g] === undefined) lastTrained[g] = d;
        if (idx < 4) recentNames.add(key(ex.exercise_name)); // avoid repeating the last few sessions
        if (w.status === 'completed') {
          const done = (ex.sets ?? []).filter((s: any) => s.completed && Number(s.weight) > 0);
          if (done.length && !lastLift.has(key(ex.exercise_name))) {
            const top = Math.max(...done.map((s: any) => Number(s.weight)));
            const max = Number(ex.target_reps_max) || 0;
            lastLift.set(key(ex.exercise_name), { weight: top, hitTop: max > 0 && done.every((s: any) => Number(s.reps) >= max) });
          }
        }
      });
    });

    // 3) Decide today's split and draw a random candidate pool for each slot
    const split = pickSplit(lastTrained, (recent ?? []).some((w: any) => w.status !== 'planned'));
    const slots = split.slots.slice(0, sessionSlots(profile, split.slots.length));
    const equip = userEquipment(profile);
    let eligible = bank.filter((e: any) => equipmentOk(e.equipment, equip));
    if (eligible.length < 60) eligible = bank; // don't over-filter if equipment names don't line up

    const used = new Set<string>();
    const pool: any[] = [];
    const slotPools: any[][] = [];
    for (const slot of slots) {
      const inGroup = eligible.filter((e: any) => norm(e.muscle_group) === slot.group && !exclude.has(key(e.name)));
      let fresh = inGroup.filter((e: any) => !recentNames.has(key(e.name)));
      if (fresh.length < 6) fresh = inGroup; // small groups: allow repeats rather than run dry
      let choices = shuffle(fresh);
      if (slot.hint) { // steer arms slots toward triceps / biceps, keep others as backup
        const hinted = choices.filter((e: any) => slot.hint!.test(e.name));
        choices = [...hinted, ...choices.filter((e: any) => !slot.hint!.test(e.name))];
      }
      const picks = choices.filter((e: any) => !used.has(key(e.name))).slice(0, 8);
      picks.forEach((e: any) => { used.add(key(e.name)); pool.push(e); });
      slotPools.push(picks);
    }
    if (pool.length < slots.length) return reply({ error: 'Not enough exercises in your bank for this split.' });

    // 4) Ask Gemini to choose from the pool (with a bank-only fallback)
    let aiPlan: any = null;
    let source: 'ai' | 'fallback' = 'fallback';
    try {
      const structure = slots.map((s, i) => `${i + 1}. ${s.group}${s.hint === TRICEPS ? ' (triceps)' : s.hint === BICEPS ? ' (biceps)' : ''}`).join('\n');
      const list = pool.map((e: any) => `${e.name} | ${norm(e.muscle_group)} | ${norm(e.equipment)} | ${norm(e.category)}${e.is_timed ? ' | timed' : ''}`).join('\n');
      const history = [...lastLift.entries()].slice(0, 25)
        .map(([k, v]) => `${byKey.get(k)?.name ?? k}: last top weight ${v.weight}${unit}${v.hitTop ? ' (hit top of rep range)' : ''}`).join('\n');
      const system = 'You are an experienced strength coach. You build workouts ONLY from the candidate exercise list you are given. Reply with a single JSON object and nothing else.';
      const prompt = `Build today's "${split.label}" workout.
Goal: ${goal.label}. Experience scale: ${scale < 1 ? 'beginner' : scale > 1 ? 'advanced' : 'intermediate'}. Units: ${unit}.
Profile (may include injuries/limits to respect): ${JSON.stringify(profile).slice(0, 900)}

Structure (one exercise per line, in this order of muscle groups):
${structure}

CANDIDATE EXERCISES (name | muscle group | equipment | category). Choose ONLY from this list, copy names EXACTLY:
${list}

Recent lifts:
${history || 'none yet - this is a new lifter or a new exercise set'}

Rules:
- Pick exactly ${slots.length} different exercises that fit the structure. Put heavy compound lifts first, isolation and core last.
- Prefer variety: don't default to the most famous exercise for a muscle.
- Timed exercises (marked timed) use seconds for reps (20-60).
- target_weight is in ${unit}; use 0 for bodyweight. For a lift with recent history, keep or slightly raise that weight; otherwise give a conservative starting weight.
- Sets ${goal.sets === 4 ? '3-4' : '3'}, reps around ${goal.reps[0]}-${goal.reps[1]} for compounds, 10-15 for isolation, rest_sec ${goal.rest} for heavy compounds and 45-75 otherwise, rir_target 1-3.

Return JSON:
{"name":"short creative title, 2-4 words","ai_explanation":"2-3 plain sentences on why this session today","exercises":[{"exercise_name":"...","target_sets":3,"target_reps_min":8,"target_reps_max":12,"target_weight":0,"rir_target":2,"rest_sec":90,"progression_note":"one short line"}]}`;
      aiPlan = parseJson(await callGemini(system, prompt));
      source = 'ai';
    } catch (e) {
      console.error('generate-workout: AI step failed, using bank fallback:', e instanceof Error ? e.message : e);
    }

    // 5) Validate: keep only real, non-excluded bank exercises; fill gaps from the sampled pool
    const chosen: { bank: any; ai: any }[] = [];
    const seen = new Set<string>();
    for (const item of aiPlan?.exercises ?? []) {
      const b = byKey.get(key(item?.exercise_name));
      if (!b || seen.has(key(b.name)) || exclude.has(key(b.name))) continue;
      if (!pool.some((p: any) => key(p.name) === key(b.name))) continue; // must come from today's sampled pool
      seen.add(key(b.name));
      chosen.push({ bank: b, ai: item });
      if (chosen.length >= slots.length) break;
    }
    if (chosen.length < slots.length) {
      for (const sp of slotPools) {
        if (chosen.length >= slots.length) break;
        const b = sp.find((e: any) => !seen.has(key(e.name)));
        if (b) { seen.add(key(b.name)); chosen.push({ bank: b, ai: null }); }
      }
    }

    // 6) Build exercises in the shape the rest of the app already uses
    const exercises = chosen.map(({ bank: b, ai }) => {
      const timed = b.is_timed === true;
      const isBody = norm(b.equipment).includes('bodyweight') || norm(b.category) === 'bodyweight' || !b.equipment;
      const compound = norm(b.category) === 'compound';
      const dRepsMin = timed ? 30 : compound ? goal.reps[0] : 10;
      const dRepsMax = timed ? 45 : compound ? goal.reps[1] : 15;

      const sets = clamp(ai?.target_sets, 2, 5, compound ? goal.sets : 3);
      const repsMin = timed ? clamp(ai?.target_reps_min, 15, 90, dRepsMin) : clamp(ai?.target_reps_min, 1, 30, dRepsMin);
      const repsMax = Math.max(repsMin, timed ? clamp(ai?.target_reps_max, 15, 120, dRepsMax) : clamp(ai?.target_reps_max, 1, 40, dRepsMax));
      const rir = clamp(ai?.rir_target, 0, 4, goal.rir);
      const rest = clamp(ai?.rest_sec, 20, 240, timed ? 45 : compound ? goal.rest : 60);

      // Weight: real history wins; otherwise the AI's guess; otherwise a rough starting estimate.
      let weight = 0;
      const hist = lastLift.get(key(b.name));
      let note: string | undefined = typeof ai?.progression_note === 'string' ? ai.progression_note : undefined;
      if (!timed && !isBody) {
        if (hist) {
          const step = metric ? 2.5 : 5;
          weight = hist.hitTop ? hist.weight + step : hist.weight;
          note = hist.hitTop ? `+${step}${unit} over last session (you hit the top of the range).` : `Same as last time: aim for the top of the rep range.`;
        } else if (Number(ai?.target_weight) > 0) {
          weight = Number(ai.target_weight);
        } else {
          weight = startingWeight(b.equipment, metric, scale);
          note = note ?? 'Starting estimate. Adjust to a weight that feels right.';
        }
      }
      return {
        exercise_name: b.name,
        muscle_group: norm(b.muscle_group),
        equipment: b.equipment ?? null,
        is_timed: timed,
        target_sets: sets,
        target_reps_min: repsMin,
        target_reps_max: repsMax,
        target_weight: weight,
        rest_sec: rest,
        rir_target: rir,
        instructions: b.instructions ?? undefined,
        form_cues: Array.isArray(b.form_cues) ? b.form_cues : undefined,
        progression_note: note,
        skipped: false,
        sets: Array.from({ length: sets }, (_, i) => ({
          set_number: i + 1, weight, reps: repsMin, rpe: null, rir: null, completed: false,
        })),
      };
    });

    const explanation = typeof aiPlan?.ai_explanation === 'string' && aiPlan.ai_explanation.trim()
      ? aiPlan.ai_explanation.trim()
      : `${split.label} day: these muscle groups have had the most rest, and the exercises were picked fresh from your bank so it isn't a repeat of recent sessions.`;
    const title = typeof aiPlan?.name === 'string' && aiPlan.name.trim() ? aiPlan.name.trim().slice(0, 60) : `${split.label} ${goal.label}`;
    const focus = `${split.label} ${goal.label}`;

    const { data: created, error: insErr } = await sb.from('workouts').insert({
      user_id: user.id,
      date: today(),
      name: title,
      focus,
      type: focus,
      status: 'planned',
      exercises,
      ai_explanation: explanation,
    }).select().single();
    if (insErr) throw insErr;

    return reply({ workout: created, meta: { source, split: split.key, pool_size: pool.length, bank_size: bank.length } });
  } catch (e) {
    console.error('generate-workout error:', e);
    return reply({ error: e instanceof Error ? e.message : String(e) });
  }
}

Deno.serve(handler);
