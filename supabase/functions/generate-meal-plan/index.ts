// supabase/functions/generate-meal-plan/index.ts
// Deploy: supabase functions deploy generate-meal-plan

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildUserContext, todayStr } from "../_shared/fitness.ts";
import { invokeLLMStructured, corsHeaders } from "../_shared/openai.ts";
import { buildVarietyPrompt, getRecentMeals, repeatedMeals, shuffle } from "./variety.ts";
import { buildIdeasPrompt } from "./meal-ideas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function mapCategory(c: string) {
  const map: Record<string, string> = { produce: "produce", meat: "meat_protein", protein: "meat_protein", dairy: "dairy", grains: "grains", pantry: "pantry", frozen: "frozen", beverages: "beverages" };
  return map[(c || "").toLowerCase()] || "other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const authClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const targetDate = body.date || todayStr();

    const ctx = await buildUserContext(db, user);
    const profile = ctx.profile;

    // Variety: meals to avoid (sent by the app, else read from this user's recent plans)
    const sentAvoid: string[] = Array.isArray(body.avoid_meals)
      ? body.avoid_meals.filter((m: unknown) => typeof m === "string").map((m: string) => m.slice(0, 80)).slice(0, 60)
      : [];
    const recent = sentAvoid.length ? sentAvoid : await getRecentMeals(db, user.id);

    const { data: recipes } = await db.from("recipes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
    const { data: pantry } = await db.from("pantry_items").select("*").eq("user_id", user.id).eq("have", true);

    // buildUserContext only returns the 5 newest recipes, so pick 5 at random from the 30 fetched above
    // so the same few saved recipes don't dominate every plan.
    const recipePool = shuffle(recipes || []).slice(0, 5).map((r: any) => ({
      title: r.title, calories: r.nutrition?.calories, protein: r.nutrition?.protein, tags: r.dietary_tags,
    }));

    const prompt = `You are Forge's nutrition planner. Create a one-day meal plan as structured JSON for ${targetDate}.

User nutrition context:
- Goal: ${profile.nutrition_goal}
- Daily targets: ${profile.daily_calorie_target || "auto"} kcal, ${profile.protein_target || "auto"}g protein
- Dietary preferences: ${JSON.stringify(profile.dietary_preferences)}
- Allergies (HARD constraint — never include): ${JSON.stringify(profile.allergies)}
- Favorite foods: ${JSON.stringify(profile.favorite_foods)}
- Disliked foods: ${JSON.stringify(profile.disliked_foods)}
- Cooking preference: ${profile.cooking_preference}

Saved recipes (optional inspiration; use at most one, and only if it isn't in the recently planned list): ${JSON.stringify(recipePool)}
Pantry items available (prioritize using): ${JSON.stringify((pantry || []).map(p => p.name))}

Today's training: ${JSON.stringify(ctx.recentWorkouts[0])}
Recovery/readiness: ${ctx.readiness ?? "unknown"}

Plan 4 meals (breakfast, lunch, dinner, snack). Each meal should have a short description, estimated calories and protein. If a saved recipe fits, reference its title. Respect allergies strictly.

Return JSON:
{
  "meals": [
    {"meal_type":"breakfast","description":"string","recipe_title":"string or null","calories":number,"protein":number}
  ],
  "total_calories": number,
  "total_protein": number,
  "grocery_items": [{"name":"string","category":"string","quantity":"string"}],
  "coach_note": "one sentence connecting today's training and nutrition"
}

${buildVarietyPrompt(body, recent)}

${buildIdeasPrompt(recent)}`;

    const schema = {
      type: "object",
      properties: {
        meals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              meal_type: { type: "string" }, description: { type: "string" }, recipe_title: { type: "string" },
              calories: { type: "number" }, protein: { type: "number" }
            }
          }
        },
        total_calories: { type: "number" },
        total_protein: { type: "number" },
        grocery_items: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" }, category: { type: "string" }, quantity: { type: "string" } } }
        },
        coach_note: { type: "string" }
      }
    };

    let res = await invokeLLMStructured(prompt, schema);
    if (!Array.isArray(res?.meals) || res.meals.length === 0) throw new Error("Meal planner returned no meals");

    // If the model still repeated a recent meal, ask once for replacements
    const dupes = repeatedMeals(res.meals, recent);
    if (dupes.length) {
      const retry = await invokeLLMStructured(
        `${prompt}\n\nYour previous attempt repeated these recent meals: ${dupes.join("; ")}. Return the full plan again with those meals replaced by clearly different dishes.`,
        schema,
      );
      if (Array.isArray(retry?.meals) && retry.meals.length) res = retry;
    }

    // Save meal plan (upsert by date)
    const { data: existing } = await db.from("meal_plans").select("id").eq("user_id", user.id).eq("date", targetDate).limit(1);
    if (existing?.[0]) {
      await db.from("meal_plans").update({ meals: res.meals, total_calories: res.total_calories, total_protein: res.total_protein }).eq("id", existing[0].id);
    } else {
      await db.from("meal_plans").insert({ user_id: user.id, date: targetDate, meals: res.meals, total_calories: res.total_calories, total_protein: res.total_protein });
    }

    if (res.grocery_items?.length) {
      await db.from("grocery_items").insert(
        res.grocery_items.map((g: any) => ({ user_id: user.id, name: g.name, category: mapCategory(g.category), quantity: g.quantity, checked: false, source: "meal_plan" }))
      );
    }

    return Response.json({ plan: res, date: targetDate }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
