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

// ---------- "How to" help for each routine item ----------
// Shown in the How to sheet when someone taps the info icon on a warm-up / cool-down row.
// `steps`: short numbered instructions. `demo`: optional [start, end] image paths in the exercise-demos bucket.
// Items are looked up by name (ignoring case and punctuation), so AI-written routines that reuse these names get help too.
export const ROUTINE_HELP = {
  // ----- general warm-up -----
  'Easy march in place': { steps: ['Stand tall with your feet hip-width apart.', 'March in place, lifting your knees to a comfortable height and swinging your arms.', 'Keep an easy pace where you could still hold a conversation.'] },
  'Jumping jacks': { steps: ['Stand tall with your feet together and your arms at your sides.', 'Jump your feet out wide while swinging your arms overhead.', 'Jump back to the start and repeat at a steady pace, landing softly on the balls of your feet.', 'For a lower-impact version, step one foot out at a time instead of jumping.'] },
  'Shadow boxing': { steps: ['Stand with your feet shoulder-width apart, knees slightly bent, hands up near your chin.', 'Throw light, relaxed punches into the air: a jab straight ahead, then a cross with the other hand.', 'Turn your hips and shoulders a little with each punch and shift your feet between combinations.', 'Keep it loose and easy. The goal is to raise your heart rate, not to punch hard.'] },
  'Step-back lunges with a reach': { steps: ['Stand tall with your feet hip-width apart.', 'Step one foot back and lower into a lunge, keeping your front knee over your ankle.', 'Reach both arms overhead as you lower.', 'Push through your front foot to stand, then alternate legs.'] },

  // ----- chest -----
  'Arm circles': { demo: ['Arm_Circles/0.jpg', 'Arm_Circles/1.jpg'], steps: ['Stand tall and lift your arms straight out to your sides, level with your shoulders.', 'Make small circles with both arms, about a foot across, then let them grow a little bigger.', 'After the first direction, reverse the circles.', 'Keep your shoulders relaxed and away from your ears.'] },
  'Scapular push-ups': { steps: ['Start in a plank position on your hands (or knees) with your arms straight.', 'Without bending your elbows, let your chest sink between your shoulder blades.', 'Then push the floor away so your shoulder blades spread apart and your upper back rounds slightly.', 'Move slowly. Only your shoulder blades should move.'] },
  'Open-book chest rotations': { steps: ['Lie on your side with your knees bent and stacked, arms straight out in front of you with palms together.', 'Lift your top arm and slowly rotate it up and back, opening your chest toward the ceiling. Follow your hand with your eyes.', 'Go only as far as feels comfortable and keep your knees together.', 'Return to the start and repeat, then switch sides.'] },

  // ----- back -----
  'Cat-cow': { demo: ['Cat_Stretch/0.jpg', 'Cat_Stretch/1.jpg'], steps: ['Start on your hands and knees, with your hands under your shoulders and your knees under your hips.', 'Breathe out and round your spine toward the ceiling, tucking your chin (the cat).', 'Breathe in and let your belly drop as you lift your chest and tailbone (the cow).', 'Move slowly, one movement per breath.'] },
  'Thread the needle': { steps: ['Start on your hands and knees.', 'Slide one arm along the floor under your other arm, palm facing up, and lower your shoulder and ear toward the floor.', 'Keep your hips over your knees and breathe slowly, feeling a gentle stretch across your upper back and shoulder.', 'Bring your arm back out and repeat, then switch sides.'] },
  'Scapular retractions': { steps: ['Stand or sit tall with your arms at your sides.', 'Squeeze your shoulder blades together and slightly down, as if pinching a pencil between them.', 'Hold for a second, then release slowly.', 'Keep your neck relaxed and avoid shrugging.'] },

  // ----- shoulders -----
  'Wall slides': { steps: ['Stand with your back against a wall, feet a step out, with your lower back, head, and hips lightly touching it.', 'Bring your arms up into a goalpost shape with your elbows and wrists against the wall.', 'Slowly slide your arms up as far as you can while keeping contact, then slide back down.', 'Stop before your back arches or your ribs flare out.'] },
  'Cross-body arm swings': { steps: ['Stand tall with your arms out to your sides.', 'Swing both arms across your chest, one over the other, then open them back out wide.', 'Alternate which arm goes on top.', 'Keep it loose and relaxed.'] },

  // ----- arms -----
  'Wrist and elbow circles': { steps: ['Hold your arms out in front of you and make slow circles with your wrists, then reverse.', 'Bend your elbows and make slow circles with your forearms, then reverse.', 'Keep the movements smooth and pain-free.'] },
  'Arm swings': { steps: ['Stand tall with your arms relaxed at your sides.', 'Swing both arms forward and up, then down and behind you, in a loose, easy rhythm.', 'Let the swing get a little bigger as you warm up, but keep your torso still.'] },
  'Wall push-ups': { steps: ["Stand facing a wall about an arm's length away and place your hands on it at chest height, slightly wider than your shoulders.", 'Bend your elbows and lean your chest toward the wall, keeping your body in a straight line.', 'Push back to the start, moving slowly.', 'Step your feet farther back to make it harder.'] },

  // ----- legs -----
  'Leg swings': { steps: ['Stand next to a wall or support and hold on with one hand.', 'Swing the outside leg forward and back like a pendulum, keeping your torso tall.', 'Start small and let the swing grow, only as far as feels comfortable.', 'Switch legs when the time is up.'] },
  'Bodyweight squats': { demo: ['Bodyweight_Squat/0.jpg', 'Bodyweight_Squat/1.jpg'], steps: ['Stand with your feet shoulder-width apart, toes turned out slightly.', 'Sit your hips back and bend your knees, keeping your chest up.', 'Lower as far as feels comfortable, with your knees tracking over your toes.', 'Push through your whole foot to stand back up.'] },
  'Walking hip openers': { steps: ['Stand tall and start walking forward slowly.', 'With each step, lift your knee up and rotate it out to the side, as if stepping over a low fence.', 'Alternate legs and keep your torso upright.', 'Hold on to a wall at first if your balance feels shaky.'] },

  // ----- glutes -----
  'Glute bridges': { demo: ['Butt_Lift_Bridge/0.jpg', 'Butt_Lift_Bridge/1.jpg'], steps: ['Lie on your back with your knees bent and your feet flat on the floor, hip-width apart.', 'Press through your heels and lift your hips until your body makes a straight line from your shoulders to your knees.', 'Squeeze your glutes at the top for a second.', 'Lower slowly and repeat.'] },
  'Hip circles': { demo: ['Standing_Hip_Circles/0.jpg', 'Standing_Hip_Circles/1.jpg'], steps: ['Stand tall next to a wall or support and hold on with one hand.', 'Lift the knee of your outside leg to about hip height.', 'Open your hip and draw a big circle with your knee, then reverse the direction.', 'Keep your standing leg steady and your torso still. Switch legs when the time is up.'] },
  'Lateral leg swings': { steps: ['Stand next to a wall or support and hold on.', 'Swing one leg out to the side and back across your body like a pendulum.', 'Keep your hips square and your torso upright.', 'Start small and let the swing grow. Switch legs when the time is up.'] },

  // ----- core -----
  'Dead bugs': { demo: ['Dead_Bug/0.jpg', 'Dead_Bug/1.jpg'], steps: ['Lie on your back with your arms straight up toward the ceiling and your knees bent at 90 degrees over your hips.', 'Press your lower back gently into the floor and keep it there.', 'Slowly lower one arm overhead and extend the opposite leg toward the floor, without letting your back arch.', 'Return to the start and switch sides.'] },
  'Standing trunk rotations': { steps: ['Stand with your feet shoulder-width apart, knees soft, and arms relaxed.', 'Gently rotate your torso to one side, letting your arms swing with you, then rotate to the other side.', 'Keep your hips mostly facing forward and your movement loose and smooth.'] },

  // ----- cool-down: chest -----
  'Doorway chest stretch': { steps: ['Stand in a doorway and place your forearm on the frame, elbow bent to about 90 degrees, just below shoulder height.', 'Step one foot forward and gently lean through the doorway until you feel a stretch across your chest and the front of your shoulder.', 'Breathe slowly and hold. Do not force it.', 'Switch sides.'] },
  'Floor chest opener': { steps: ['Lie on your stomach with one arm straight out to the side at shoulder height, palm down.', 'Press through your other hand and roll your body slowly toward the opposite side until you feel a stretch across your chest and the front of your shoulder.', 'Keep your arm on the floor and breathe slowly.', 'Roll back and switch sides.'] },

  // ----- cool-down: back -----
  "Child's pose": { demo: ['Childs_Pose/0.jpg', 'Childs_Pose/1.jpg'], steps: ['Kneel on the floor with your big toes together and your knees apart.', 'Sit your hips back toward your heels and walk your hands forward.', 'Rest your forehead on the floor and let your back relax.', 'Breathe slowly into your back. Ease off or skip this if it bothers your knees.'] },
  'Lat stretch on a rack or wall': { steps: ['Hold a rack, doorframe, or wall with one hand at about chest height.', 'Step back and hinge at your hips, letting your chest sink toward the floor.', 'Push your hips back until you feel a stretch along the side of your back and under your arm.', 'Breathe slowly and hold, then switch arms.'] },

  // ----- cool-down: shoulders -----
  'Cross-body shoulder stretch': { steps: ['Bring one arm across your chest at shoulder height.', 'Use your other hand to gently press it closer, holding above or below the elbow rather than on the joint.', 'Keep your shoulders relaxed and down, and breathe slowly.', 'Hold, then switch arms.'] },
  'Overhead reach and side bend': { steps: ['Stand tall, clasp your hands or hold one wrist overhead, and reach up.', 'Slowly lean to one side, keeping your hips still and your chest facing forward.', 'Feel the stretch along your side and breathe slowly.', 'Return to the center and lean to the other side.'] },

  // ----- cool-down: arms -----
  'Triceps overhead stretch': { demo: ['Triceps_Stretch/0.jpg', 'Triceps_Stretch/1.jpg'], steps: ['Reach one arm overhead, then bend your elbow so your hand drops behind your head.', 'Use your other hand to gently pull your elbow toward the opposite side.', 'Keep your neck long and your ribs down. You should feel it along the back of your upper arm.', 'Hold, then switch arms.'] },
  'Wall biceps stretch': { steps: ['Stand beside a wall and place your palm on it at shoulder height, fingers pointing behind you.', 'Slowly turn your body away from the wall until you feel a stretch in the front of your arm and shoulder.', 'Keep your arm straight but not locked, and breathe slowly.', 'Hold, then switch arms.'] },
  'Wrist flexor stretch': { demo: ['Kneeling_Forearm_Stretch/0.jpg', 'Kneeling_Forearm_Stretch/1.jpg'], steps: ['Kneel on a mat with your palms flat on the floor and your fingers pointing back toward your knees.', 'Slowly lean back until you feel a stretch in your wrists and forearms.', 'Hold and breathe. If it feels too intense, lean back less or lift your hands slightly.', 'Never stretch into pain.'] },

  // ----- cool-down: legs -----
  'Standing quad stretch': { steps: ['Stand tall next to a wall or support if you need balance.', 'Bend one knee and bring your heel toward your glute, holding your ankle or foot.', "Keep your knees close together and tuck your hips slightly under. Don't arch your lower back.", 'Hold, then switch legs.'] },
  'Standing hamstring stretch': { steps: ['Stand tall and place one heel forward on the floor, toes pointing up (or rest it on a low step).', 'Keep that leg straight but not locked.', 'Hinge forward from your hips with a flat back until you feel a stretch behind your thigh, resting your hands on your leg for support.', 'Hold, then switch legs.'] },
  'Calf stretch at a wall': { demo: ['Calf_Stretch_Hands_Against_Wall/0.jpg', 'Calf_Stretch_Hands_Against_Wall/1.jpg'], steps: ['Stand facing a wall a few feet away and step one foot back.', 'Lean forward with your hands on the wall, keeping your back heel on the floor and your back leg straight.', 'Feel the stretch in the calf of your back leg, keeping your heel, hip, and head in a line.', 'Hold, then switch legs.'] },

  // ----- cool-down: glutes -----
  'Figure-four stretch': { steps: ['Lie on your back with your knees bent and your feet flat.', 'Cross one ankle over the opposite thigh, just above the knee.', 'Pull that thigh toward your chest, holding behind the thigh or shin, until you feel a stretch in the glute of the crossed leg.', 'Keep your head and shoulders relaxed. Hold, then switch sides.'] },
  'Pigeon pose': { steps: ['Start on your hands and knees, then slide one knee forward toward the same-side hand, angling your shin across your body.', 'Stretch the other leg straight back behind you and lower your hips toward the floor.', 'Stay upright on your hands, or fold forward over your front leg for a deeper stretch.', 'Breathe slowly and ease off if you feel any knee pain. Hold, then switch sides.'] },
  'Kneeling hip flexor stretch': { demo: ['Kneeling_Hip_Flexor/0.jpg', 'Kneeling_Hip_Flexor/1.jpg'], steps: ['Kneel on a mat with one foot forward and your back knee on the floor (pad it if needed).', 'Tuck your tailbone slightly under and squeeze the glute of your back leg.', 'Shift your weight forward until you feel a stretch at the front of your back hip.', 'Keep your torso upright. Hold, then switch sides.'] },

  // ----- cool-down: core -----
  'Cobra stretch': { steps: ['Lie on your stomach with your hands under your shoulders and your legs extended.', 'Press gently through your hands to lift your chest, keeping your hips on the floor.', 'Stop where you feel a stretch through your stomach, without pinching in your lower back.', 'Breathe slowly and hold, then lower down.'] },

  // ----- cool-down: finish -----
  'Slow breathing': { steps: ['Sit or lie down comfortably and relax your shoulders.', 'Breathe in through your nose for 4 counts.', 'Breathe out slowly for 6 counts.', 'Keep going until the timer ends and let your heart rate come down.'] },
};

const helpKey = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const HELP_BY_KEY = new Map(Object.entries(ROUTINE_HELP).map(([k, v]) => [helpKey(k), v]));

// Help for a warm-up / cool-down item by name, or null if we don't have any.
export const routineHelp = (name) => HELP_BY_KEY.get(helpKey(name)) || null;
