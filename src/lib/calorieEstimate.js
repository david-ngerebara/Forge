// src/lib/calorieEstimate.js
// A rough MET-based calorie estimate. Not a precise measurement -- always label it as an estimate.
//
// Works off fields every workout.exercises[] item already has (exercise_name, is_timed,
// target_weight, target_sets, target_reps_min, rest_sec, sets[]), so it applies equally to
// AI-generated workouts, manually built ones, and older workouts saved before this existed.

const TIMED_NAME = /plank|wall sit|dead hang|hollow hold|l-sit|isometric|\bhold\b/i;
const REP_SECONDS = 3; // assumed seconds per controlled rep
const TRANSITION_SECONDS = 25; // assumed gap between exercises
const DEFAULT_WEIGHT_KG = 75; // used only if no body weight is on file

const isTimedExercise = (ex) => ex.is_timed === true || (ex.is_timed == null && TIMED_NAME.test(ex.exercise_name || ''));

// kcal/min = METs x 3.5 x weight(kg) / 200
const kcalPerMin = (met, weightKg) => (met * 3.5 * weightKg) / 200;

// Converts a stored body weight (in the user's display unit) to kg for the formula.
export function toKg(weight, units) {
  const n = Number(weight);
  if (!n) return DEFAULT_WEIGHT_KG;
  return units === 'metric' ? n : n * 0.453592;
}

// Estimates total calories burned and duration for a workout's exercise list.
// exercises: workout.exercises[] (skipped ones are ignored)
// weightKg: body weight in kg (defaults to a generic assumption if not known)
export function estimateWorkout(exercises = [], weightKg = DEFAULT_WEIGHT_KG) {
  const list = (exercises || []).filter(e => !e.skipped);
  let activeSec = 0, restSec = 0, kcal = 0;

  list.forEach((ex, idx) => {
    const timed = isTimedExercise(ex);
    const sets = ex.sets?.length ? ex.sets : Array.from({ length: ex.target_sets || 3 }, () => ({ reps: ex.target_reps_min || (timed ? 30 : 10) }));
    // Timed holds (planks) sit around 3 METs; loaded resistance work around 6; unloaded bodyweight reps around 5.
    const met = timed ? 3 : (Number(ex.target_weight) > 0 ? 6 : 5);

    let exActiveSec = 0;
    sets.forEach(s => {
      const val = Number(s.reps) || (timed ? (ex.target_reps_min || 30) : (ex.target_reps_min || 10));
      exActiveSec += timed ? val : val * REP_SECONDS;
    });
    const exRestSec = Math.max(0, sets.length - 1) * (ex.rest_sec || 60);

    activeSec += exActiveSec;
    restSec += exRestSec;
    kcal += kcalPerMin(met, weightKg) * (exActiveSec / 60);
    kcal += kcalPerMin(1.5, weightKg) * (exRestSec / 60); // resting between sets

    if (idx < list.length - 1) {
      restSec += TRANSITION_SECONDS;
      kcal += kcalPerMin(2, weightKg) * (TRANSITION_SECONDS / 60); // walking/setting up the next exercise
    }
  });

  return {
    calories: Math.round(kcal),
    minutes: Math.round((activeSec + restSec) / 60),
  };
}