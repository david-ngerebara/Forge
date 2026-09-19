// supabase/functions/get-coach-insight/index.ts
// Deploy: supabase functions deploy get-coach-insight

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildUserContext, todayStr } from "../_shared/fitness.ts";
import { invokeLLMText, corsHeaders } from "../_shared/openai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const authClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader ?? "" } } });
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const ctx = await buildUserContext(db, user);
    const profile = ctx.profile;
    if (!profile || !profile.name) {
      return Response.json({ insight: "Complete onboarding to unlock your daily coach insight." }, { headers: corsHeaders });
    }

    const today = todayStr();
    const { data: todayWorkoutRows } = await db.from("workouts").select("*").eq("user_id", user.id).eq("date", today).order("created_at", { ascending: false }).limit(1);
    const { data: lastCompletedRows } = await db.from("workouts").select("*").eq("user_id", user.id).eq("status", "completed").order("date", { ascending: false }).limit(1);

    const todayWorkout = todayWorkoutRows?.[0];
    const yesterdayWorkout = lastCompletedRows?.[0];

    const prompt = `You are Forge. Write a single short coach insight (2-3 sentences, friendly, actionable) for the user's "Today" dashboard. Connect their training, recovery, and nutrition. Do not give medical advice.

Context:
- Name: ${profile.name}
- Goals: ${JSON.stringify(profile.goal_priority || profile.goals)}
- Today's planned workout: ${JSON.stringify(todayWorkout ? { name: todayWorkout.name, focus: todayWorkout.focus } : "none yet")}
- Last completed workout: ${JSON.stringify(yesterdayWorkout ? { name: yesterdayWorkout.name, focus: yesterdayWorkout.focus, difficulty: yesterdayWorkout.perceived_difficulty, pain: yesterdayWorkout.pain_reported } : "none")}
- Recovery today: ${JSON.stringify(ctx.recovery)}, readiness ${ctx.readiness ?? "unknown"}
- Today's nutrition so far: ${JSON.stringify(ctx.todayMacros)} vs targets ${profile.daily_calorie_target}kcal/${profile.protein_target}g protein

Write the insight directly, no preamble.`;

    const insight = await invokeLLMText(prompt);
    return Response.json({ insight }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
