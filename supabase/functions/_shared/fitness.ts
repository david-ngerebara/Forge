// supabase/functions/_shared/fitness.ts
//
// Shared deterministic fitness/nutrition calculations used across backend
// functions. Every function below except buildUserContext is untouched
// from the original — no Base44 dependency existed in them to begin with.
// buildUserContext is the only one that talked to Base44, so it's the only
// one rewritten (base44.entities.X.filter(...) -> supabase.from(...)).

export function calcVolume(sets) {
  if (!Array.isArray(sets)) return 0;
  return sets.reduce((sum, s) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
}

export function calcWorkoutStats(exercises) {
  let totalVolume = 0, totalSets = 0, totalReps = 0;
  for (const ex of exercises || []) {
    if (ex.skipped) continue;
    for (const s of ex.sets || []) {
      if (s.completed) {
        totalVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
        totalSets += 1;
        totalReps += Number(s.reps) || 0;
      }
    }
  }
  return { totalVolume, totalSets, totalReps };
}

// Epley estimated 1RM
export function estimate1rm(weight, reps) {
  weight = Number(weight) || 0;
  reps = Number(reps) || 0;
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// Double-progression decision. Returns next target weight + reason.
export function decideProgression(exercise, lastPerformance) {
  const target = {
    weight: exercise.target_weight,
    reps_min: exercise.target_reps_min,
    reps_max: exercise.target_reps_max
  };
  if (!lastPerformance || !lastPerformance.sets || lastPerformance.sets.length === 0) {
    return { ...target, action: "maintain", reason: "No previous performance data — keeping target the same." };
  }
  const completedSets = lastPerformance.sets.filter(s => s.completed);
  if (completedSets.length === 0) {
    return { ...target, action: "maintain", reason: "No completed sets last time — keeping target the same." };
  }
  const allAtTop = completedSets.every(s => Number(s.reps) >= exercise.target_reps_max);
  const avgRir = completedSets.reduce((sum, s) => sum + (Number(s.rir) ?? 3), 0) / completedSets.length;
  const pain = lastPerformance.pain;

  if (pain) {
    return { ...target, action: "reduce", weight: roundWeight(target.weight * 0.9), reason: "Pain was reported last session — reducing load by ~10% and consider an alternative movement." };
  }
  if (allAtTop && avgRir <= 3) {
    const inc = target.weight >= 100 ? 5 : 2.5;
    return { ...target, action: "increase", weight: roundWeight(target.weight + inc), reason: `You hit the top of the rep range with effort to spare — increasing target by ${inc} next session.` };
  }
  if (allAtTop && avgRir > 5) {
    return { ...target, action: "maintain", reason: "You hit the rep range but it felt easy (high RIR). Keep the weight and aim to push closer to failure." };
  }
  return { ...target, action: "maintain", reason: "Solid work — keep the same target and aim for the top of the rep range." };
}

function roundWeight(w) {
  return Math.round(w * 4) / 4;
}

export function scaleRecipe(recipe, newServings) {
  const original = Number(recipe.servings) || 1;
  const target = Number(newServings) || 1;
  if (original <= 0 || target <= 0) return recipe;
  const factor = target / original;
  return {
    ...recipe,
    servings: target,
    ingredients: (recipe.ingredients || []).map(i => ({
      ...i,
      quantity: roundQty((Number(i.quantity) || 0) * factor)
    })),
    nutrition: scaleNutrition(recipe.nutrition, factor)
  };
}

function scaleNutrition(n, factor) {
  if (!n) return n;
  return {
    calories: Math.round((Number(n.calories) || 0) * factor),
    protein: Math.round((Number(n.protein) || 0) * factor * 10) / 10,
    carbs: Math.round((Number(n.carbs) || 0) * factor * 10) / 10,
    fat: Math.round((Number(n.fat) || 0) * factor * 10) / 10,
    fiber: Math.round((Number(n.fiber) || 0) * factor * 10) / 10
  };
}

function roundQty(q) {
  if (q >= 10) return Math.round(q);
  return Math.round(q * 4) / 4;
}

export function sumMacros(foodLogs) {
  return (foodLogs || []).reduce((acc, f) => {
    const mult = Number(f.servings) || 1;
    acc.calories += Number(f.calories) * mult || 0;
    acc.protein += Number(f.protein) * mult || 0;
    acc.carbs += Number(f.carbs) * mult || 0;
    acc.fat += Number(f.fat) * mult || 0;
    acc.fiber += Number(f.fiber) * mult || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
}

export function calcReadiness(recovery) {
  if (!recovery) return null;
  const sleep = norm(recovery.sleep_quality, 1, 5);
  const energy = norm(recovery.energy, 1, 5);
  const sorenessInv = 1 - norm(recovery.soreness, 1, 5);
  const stressInv = 1 - norm(recovery.stress, 1, 5);
  const motivation = norm(recovery.motivation, 1, 5);
  const score = (sleep * 0.3 + energy * 0.2 + sorenessInv * 0.2 + stressInv * 0.1 + motivation * 0.2) * 100;
  return Math.round(score);
}

function norm(v, min, max) {
  if (v == null) return 0.5;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

// Build a compact context string for the AI from the user's data.
// Rewritten from base44.entities.X.filter(...) to supabase.from(...).
export async function buildUserContext(supabase, user) {
  const { data: profiles } = await supabase.from('profiles').select('*').eq('user_id', user.id).limit(1);
  const p = profiles?.[0] || {};

  const { data: recentWorkouts } = await supabase
    .from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(5);

  const today = todayStr();

  const { data: todayRecoveryRows } = await supabase
    .from('recovery_logs').select('*').eq('user_id', user.id).eq('date', today);
  const todayRecovery = todayRecoveryRows?.[0] || null;

  const { data: recipes } = await supabase
    .from('recipes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);

  const { data: foodLogs } = await supabase
    .from('food_logs').select('*').eq('user_id', user.id).eq('date', today);
  const macros = sumMacros(foodLogs);

  const { data: pantry } = await supabase
    .from('pantry_items').select('*').eq('user_id', user.id).eq('have', true);

  return {
    profile: {
      name: p.first_name, age: p.age, sex: p.sex, weight: p.weight, height: p.height, units: p.units,
      goals: p.goals, goal_priority: p.goal_priority, experience: p.experience,
      days_per_week: p.days_per_week, workout_duration: p.workout_duration, equipment: p.equipment,
      favorite_exercises: p.favorite_exercises, disliked_exercises: p.disliked_exercises, injuries: p.injuries,
      nutrition_goal: p.nutrition_goal, daily_calorie_target: p.daily_calorie_target,
      protein_target: p.protein_target, dietary_preferences: p.dietary_preferences,
      allergies: p.allergies, favorite_foods: p.favorite_foods, disliked_foods: p.disliked_foods,
      cooking_preference: p.cooking_preference
    },
    recentWorkouts: (recentWorkouts || []).map(w => ({
      date: w.date, name: w.name, focus: w.focus, status: w.status, duration_min: w.duration_min,
      total_volume: w.total_volume, perceived_difficulty: w.perceived_difficulty, pain_reported: w.pain_reported
    })),
    recovery: todayRecovery,
    readiness: calcReadiness(todayRecovery),
    todayMacros: macros,
    savedRecipes: (recipes || []).map(r => ({ title: r.title, protein: r.nutrition?.protein, calories: r.nutrition?.calories, tags: r.dietary_tags })),
    pantry: (pantry || []).map(i => i.name)
  };
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function safetyDisclaimer() {
  return "Note: Forge provides general fitness and nutrition guidance, not medical advice. If you experience pain, dizziness, chest pain, or severe shortness of breath, stop and consult a qualified healthcare professional.";
}
