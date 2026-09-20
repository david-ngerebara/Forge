// supabase/functions/generate-meal-plan/variety.ts
// Drop this next to your generate-meal-plan/index.ts and import it there.

type Slot = { cuisine?: string; protein?: string; style?: string };
export type VarietyBody = {
  avoid_meals?: string[];
  variety?: { seed?: string; slots?: Record<string, Slot> };
};

// 1) Fallback: if the client didn't send avoid_meals, read them server-side.
//    The function uses a service-role client (bypasses RLS), so the user_id filter below is required.
export async function getRecentMeals(supabase: any, userId: string, days = 10): Promise<string[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('meal_plans')
    .select('meals')
    .eq('user_id', userId)
    .gte('date', since)
    .order('created_at', { ascending: false })
    .limit(30);
  const seen = new Set<string>();
  for (const p of data ?? []) {
    for (const m of p.meals ?? []) {
      const t = String(m.recipe_title || m.description || '').trim().slice(0, 80);
      if (t) seen.add(t);
    }
  }
  return [...seen].slice(0, 60);
}

// 2) Prompt block. Append this to the END of your existing user prompt (recency matters to the model).
export function buildVarietyPrompt(body: VarietyBody, recentMeals: string[]): string {
  const avoid = (body.avoid_meals?.length ? body.avoid_meals : recentMeals).slice(0, 60);
  const slots = body.variety?.slots ?? {};
  const lines: string[] = [
    'VARIETY RULES (high priority):',
    '- This is a brand-new plan. Do NOT reuse any meal in the "recently planned" list below, or a near-copy of one (the same dish with a different garnish counts as a repeat).',
    '- No two meals in this plan may share the same main protein or the same cuisine (snacks excepted).',
    '- Mix cooking methods across the day (roasted, grilled, stir-fried, slow-cooked, raw/bowl, soup, sheet-pan) and use a range of vegetables and whole grains or legumes.',
    '- Every meal must still be healthy, fit the calorie and protein targets, and respect all allergies and dietary restrictions.',
  ];

  const slotLines = Object.entries(slots).map(([meal, s]) => {
    const parts = [
      s.cuisine && `${s.cuisine} cuisine`,
      s.protein && `built around ${s.protein}`,
      s.style && `${s.style} style`,
    ].filter(Boolean);
    return parts.length ? `- ${meal}: ${parts.join(', ')}` : '';
  }).filter(Boolean);
  if (slotLines.length) {
    lines.push('', 'Use these directions for this plan (adapt to allergies, pantry, and targets if they conflict):', ...slotLines);
  }

  if (avoid.length) {
    lines.push('', 'Recently planned meals (do not repeat):', ...avoid.map((m) => `- ${m}`));
  }
  if (body.variety?.seed) lines.push('', `Variation seed: ${body.variety.seed}`);
  return lines.join('\n');
}

// 3) Optional safety net: after the model responds, check for repeats and retry once.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function repeatedMeals(planMeals: any[], avoid: string[]): string[] {
  const banned = new Set(avoid.map(norm));
  return planMeals
    .map((m) => String(m.recipe_title || m.description || ''))
    .filter((t) => banned.has(norm(t)));
}