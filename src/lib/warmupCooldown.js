// src/lib/warmupCooldown.js
//
// Pre-workout (warm-up) and post-workout (cool-down) routines for the Train tab.
//
// Each item looks like { name, detail, seconds?, sides?, done }.
//   seconds : how long to hold / do it. Items with `seconds` get a countdown timer.
//   sides   : 2 means "run it twice" (once per side) with a "switch sides" get-ready between.
// Items with no `seconds` (like "10 reps, slow and controlled") stay plain checkboxes.
//
// buildWarmup / buildCooldown pick items that match the muscle groups in the workout.
// The picks are seeded by the workout id, so the same workout always shows the same routine
// (Today preview, active workout, and after a reload) without having to save anything.

export const READY_SECONDS = 5;
export const EXTEND_SECONDS = 15;
export const DEFAULT_ITEM_HOLD = 30;

// ---------- reading a time out of an item ----------
// An explicit `seconds` (and optional `sides`) on the item wins over the text. Otherwise the detail
// or name is read for a time ("Hold 30 seconds each side", "1-2 minutes", "30s"). For a range like
// "30-45 seconds" the lower number is used, and +15s extends it. Rep-based items ("10 reps",
// "5 per side") stay plain checkboxes. Static holds with no stated time (child's pose,
// "... stretch") default to 30 seconds.
const TIME_RE = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?)?\s*-?\s*(seconds?|secs?|minutes?|mins?)\b/i;
const SHORT_SEC_RE = /\b(\d+)s\b/i;
const REPS_RE = /\b\d+\s*(?:reps?|repetitions?|times)\b|\b\d+\s*(?:per|each|every|\/)\s*(?:side|leg|arm)\b/i;
const SIDES_RE = /\b(?:each|per|every)\s+(?:side|leg|arm|direction|foot|hand)\b|\/\s*(?:side|leg|arm)\b|\bboth\s+(?:sides|legs|arms)\b/i;
export const STATIC_HOLD_NAME = /child'?s pose|\bpose\b|pigeon|stretch\b|\bhold\b/i;

export function parseItemTiming(item) {
  if (!item) return null;
  const text = `${item.detail || ''} ${item.name || ''}`;
  const sides = Number(item.sides) > 1 ? Number(item.sides) : (SIDES_RE.test(text) ? 2 : 1);
  const direct = Number(item.seconds ?? item.duration_sec);
  if (direct >= 5) return { seconds: Math.round(direct), sides };
  if (REPS_RE.test(text)) return null;
  let seconds = 0;
  const m = text.match(TIME_RE);
  if (m) {
    const n = parseFloat(m[1]);
    seconds = Math.round(/^m/i.test(m[2]) ? n * 60 : n);
  } else {
    const sh = text.match(SHORT_SEC_RE);
    if (sh) seconds = parseInt(sh[1], 10);
    else if (STATIC_HOLD_NAME.test(item.name || '')) seconds = DEFAULT_ITEM_HOLD;
  }
  if (seconds < 5 || seconds > 1800) return null;
  return { seconds, sides };
}

export const fmtClock = (sec) => sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
export const fmtItemDuration = ({ seconds, sides }) =>
  `${seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : seconds >= 60 ? fmtClock(seconds) : `${seconds}s`}${sides > 1 ? ' ×2' : ''}`;

// Rough total time for a routine: timed items plus their get-ready countdowns, ~15s for a plain item.
export function estimateRoutineMinutes(items) {
  const secs = (items || []).reduce((sum, it) => {
    const t = parseItemTiming(it);
    return sum + (t ? (t.seconds + READY_SECONDS) * t.sides : 15);
  }, 0);
  return Math.max(1, Math.round(secs / 60));
}

// ---------- the exercise library ----------
const t = (name, detail, seconds, sides = 1) => ({ name, detail, seconds, sides });
const r = (name, detail) => ({ name, detail }); // rep-based: no timer

const GENERAL_WARMUP = [
  t('Easy march in place', '1 minute, easy pace', 60),
  t('Jumping jacks', '45 seconds, steady pace', 45),
  t('Shadow boxing', '1 minute, loose and easy', 60),
  t('Step-back lunges with a reach', '45 seconds, alternate legs', 45),
];

const WARMUP = {
  chest: [
    t('Arm circles', '30 seconds each direction', 30, 2),
    r('Scapular push-ups', '10 reps, slow and controlled'),
    t('Open-book chest rotations', '30 seconds each side', 30, 2),
  ],
  back: [
    t('Cat-cow', '45 seconds, slow breathing', 45),
    t('Thread the needle', '30 seconds each side', 30, 2),
    r('Scapular retractions', '12 reps, squeeze the shoulder blades'),
  ],
  shoulders: [
    t('Arm circles', '30 seconds each direction', 30, 2),
    r('Wall slides', '10 reps, slow and controlled'),
    t('Cross-body arm swings', '30 seconds, loose and easy', 30),
  ],
  arms: [
    t('Wrist and elbow circles', '30 seconds each direction', 30, 2),
    t('Arm swings', '30 seconds, loose and easy', 30),
    r('Wall push-ups', '10 reps, slow and controlled'),
  ],
  legs: [
    t('Leg swings', '30 seconds each leg', 30, 2),
    r('Bodyweight squats', '10 reps, slow and controlled'),
    t('Walking hip openers', '45 seconds, alternate legs', 45),
  ],
  glutes: [
    r('Glute bridges', '12 reps, squeeze at the top'),
    t('Hip circles', '30 seconds each direction', 30, 2),
    t('Lateral leg swings', '30 seconds each leg', 30, 2),
  ],
  core: [
    r('Dead bugs', '8 reps per side, slow and controlled'),
    t('Cat-cow', '45 seconds, slow breathing', 45),
    t('Standing trunk rotations', '30 seconds, loose and easy', 30),
  ],
};

const COOLDOWN = {
  chest: [
    t('Doorway chest stretch', '30 seconds each side', 30, 2),
    t('Floor chest opener', '30 seconds each side', 30, 2),
  ],
  back: [
    t("Child's pose", 'Sink the hips back, breathe slowly', 30),
    t('Lat stretch on a rack or wall', '30 seconds each side', 30, 2),
  ],
  shoulders: [
    t('Cross-body shoulder stretch', '30 seconds each arm', 30, 2),
    t('Overhead reach and side bend', '30 seconds each side', 30, 2),
  ],
  arms: [
    t('Triceps overhead stretch', '30 seconds each arm', 30, 2),
    t('Wall biceps stretch', '30 seconds each arm', 30, 2),
    t('Wrist flexor stretch', '30 seconds each arm', 30, 2),
  ],
  legs: [
    t('Standing quad stretch', '30 seconds each leg', 30, 2),
    t('Standing hamstring stretch', '30 seconds each leg', 30, 2),
    t('Calf stretch at a wall', '30 seconds each leg', 30, 2),
  ],
  glutes: [
    t('Figure-four stretch', '30 seconds each side', 30, 2),
    t('Pigeon pose', '45 seconds each side', 45, 2),
    t('Kneeling hip flexor stretch', '30 seconds each side', 30, 2),
  ],
  core: [
    t('Cobra stretch', 'Press up gently, breathe slowly', 30),
    t("Child's pose", 'Sink the hips back, breathe slowly', 30),
  ],
};

const BREATHING = t('Slow breathing', '1 minute, in for 4 counts and out for 6', 60);

// ---------- picking ----------
const GROUP_ALIASES = {
  chest: 'chest', pecs: 'chest', pectorals: 'chest',
  back: 'back', lats: 'back', traps: 'back', upper_back: 'back', lower_back: 'back',
  shoulders: 'shoulders', delts: 'shoulders', deltoids: 'shoulders',
  arms: 'arms', biceps: 'arms', triceps: 'arms', forearms: 'arms',
  legs: 'legs', quads: 'legs', quadriceps: 'legs', hamstrings: 'legs', calves: 'legs',
  glutes: 'glutes', hips: 'glutes',
  core: 'core', abs: 'core', abdominals: 'core', obliques: 'core',
};
const normGroup = (g) => GROUP_ALIASES[String(g || '').toLowerCase().trim().replace(/[\s-]+/g, '_')] || null;

// Small seeded random generator so the same workout id always gives the same picks.
function seededRandom(seed) {
  let h = 1779033703 ^ String(seed ?? 'forge').length;
  for (const ch of String(seed ?? 'forge')) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// Muscle groups in the workout, most-worked first (skipped exercises are ignored).
function workedGroups(exercises) {
  const counts = new Map();
  (exercises || []).forEach(ex => {
    if (ex.skipped) return;
    const g = normGroup(ex.muscle_group);
    if (g) counts.set(g, (counts.get(g) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

const fresh = (item) => ({ ...item, done: false });

// Pre-workout: one general pulse-raiser, then moves for up to 3 of the muscle groups being trained.
export function buildWarmup(exercises, seed) {
  const rand = seededRandom(`${seed}:warmup`);
  const items = [fresh(pick(GENERAL_WARMUP, rand))];
  const used = new Set(items.map(i => i.name));
  for (const g of workedGroups(exercises).slice(0, 3)) {
    const options = (WARMUP[g] || []).filter(i => !used.has(i.name));
    if (options.length) { const it = pick(options, rand); used.add(it.name); items.push(fresh(it)); }
  }
  return items;
}

// Post-workout: a stretch for each of up to 3 trained muscle groups, then slow breathing.
export function buildCooldown(exercises, seed) {
  const rand = seededRandom(`${seed}:cooldown`);
  const items = [];
  const used = new Set();
  for (const g of workedGroups(exercises).slice(0, 3)) {
    const options = (COOLDOWN[g] || []).filter(i => !used.has(i.name));
    if (options.length) { const it = pick(options, rand); used.add(it.name); items.push(fresh(it)); }
  }
  if (items.length === 0) items.push(fresh(t("Child's pose", 'Sink the hips back, breathe slowly', 30)));
  items.push(fresh(BREATHING));
  return items;
}
