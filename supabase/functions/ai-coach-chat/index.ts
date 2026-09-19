// supabase/functions/ai-coach-chat/index.ts
// Deploy: supabase functions deploy ai-coach-chat
//
// The coach now answers in plain text (no markdown symbols). When the user asks for a workout,
// the reply also carries a structured workout (pre-workout, exercises, post-workout)
// that the app renders as an interactive card in the chat.
//
// Pre- and post-workout items now carry explicit `seconds` and `sides` so the app can run a
// countdown for them (child's pose, stretches, holds) without guessing from the wording.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildUserContext } from "../_shared/fitness.ts";
import { invokeLLMStructured, corsHeaders } from "../_shared/openai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const objectList = (props: Record<string, unknown>) => ({
  type: "array",
  items: { type: "object", properties: props },
});

// Warm-up and cool-down items. `seconds` = how long ONE side/round lasts (0 for rep-based items),
// `sides` = 2 when it is done on both sides one after the other, otherwise 1.
const ROUTINE_ITEM = {
  name: { type: "string" },
  detail: { type: "string" },
  seconds: { type: "number" },
  sides: { type: "number" },
};

const COACH_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    include_workout: { type: "boolean" },
    workout: {
      type: "object",
      properties: {
        name: { type: "string" },
        focus: { type: "string" },
        pre_tip: { type: "string" },
        warmup: objectList(ROUTINE_ITEM),
        exercises: objectList({
          exercise_name: { type: "string" },
          muscle_group: { type: "string" },
          is_timed: { type: "boolean" },
          target_sets: { type: "number" },
          target_reps_min: { type: "number" },
          target_reps_max: { type: "number" },
          target_weight: { type: "number" },
          rir_target: { type: "number" },
          rest_sec: { type: "number" },
          instructions: { type: "string" },
          form_cues: { type: "array", items: { type: "string" } },
        }),
        cooldown: objectList(ROUTINE_ITEM),
        post_tip: { type: "string" },
      },
    },
  },
};

// Safety net: strips markdown symbols if the model uses them anyway.
function cleanText(s: unknown): string {
  return String(s ?? "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*-]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Fallback in case the model forgets to flag a timed exercise.
const TIMED_NAME = /plank|wall sit|dead hang|hollow hold|l-sit|isometric|\bhold\b/i;

const num = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Rep-based wording ("10 reps") with no time in it: such an item should never get a countdown,
// even if the model filled in `seconds` by mistake.
const REP_WORDING = /\b\d+\s*(?:reps?|times)\b/i;
const TIME_WORDING = /\b(?:seconds?|secs?|minutes?|mins?)\b|\b\d+s\b/i;

// Warm-up / cool-down items: { name, detail, seconds?, sides?, done }.
// `seconds` and `sides` are only kept when they make sense. The app falls back to reading the
// wording of `detail` for items that don't have them.
function buildRoutineItems(list: any[]) {
  return (list || []).slice(0, 8).map((it: any) => {
    const name = cleanText(it?.name);
    const detail = cleanText(it?.detail);
    const item: Record<string, unknown> = { name, detail, done: false };
    const s = Number(it?.seconds);
    const repBased = REP_WORDING.test(detail) && !TIME_WORDING.test(detail);
    if (Number.isFinite(s) && s >= 5 && s <= 1800 && !repBased) {
      item.seconds = Math.round(s);
      item.sides = Number(it?.sides) >= 2 ? 2 : 1;
    }
    return item;
  });
}

// Converts the model's workout into the same shape the Train tab uses (workouts.exercises),
// with one pre-filled row per set so each set can be logged with a tap.
function buildWorkoutCard(w: any) {
  const exercises = (w.exercises || []).slice(0, 10).map((e: any) => {
    const name = cleanText(e.exercise_name) || "Exercise";
    const timed = e.is_timed === true || TIMED_NAME.test(name);
    // For timed exercises the "reps" fields hold seconds.
    const sets = Math.round(num(e.target_sets, 3, 1, 8));
    const repsMin = Math.round(num(e.target_reps_min, timed ? 30 : 8, 1, timed ? 300 : 50));
    const repsMax = Math.max(repsMin, Math.round(num(e.target_reps_max, repsMin, 1, timed ? 300 : 50)));
    const weight = num(e.target_weight, 0, 0, 1000);
    return {
      exercise_name: name,
      is_timed: timed,
      muscle_group: cleanText(e.muscle_group).toLowerCase(),
      target_sets: sets,
      target_reps_min: repsMin,
      target_reps_max: repsMax,
      target_weight: weight,
      rir_target: Math.round(num(e.rir_target, 2, 0, 5)),
      rest_sec: Math.round(num(e.rest_sec, 90, 15, 300)),
      instructions: cleanText(e.instructions),
      form_cues: (e.form_cues || []).slice(0, 4).map(cleanText),
      sets: Array.from({ length: sets }, (_, i) => ({
        set_number: i + 1, weight, reps: repsMin, rpe: null, rir: null, completed: false,
      })),
    };
  });

  return {
    name: cleanText(w.name) || "Today's Workout",
    focus: cleanText(w.focus),
    pre_tip: cleanText(w.pre_tip),
    warmup: buildRoutineItems(w.warmup),
    exercises,
    cooldown: buildRoutineItems(w.cooldown),
    post_tip: cleanText(w.post_tip),
    started_at: null,
    saved: false,
  };
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
    const { message, conversationId } = body;
    if (!message) return Response.json({ error: "Message required" }, { status: 400, headers: corsHeaders });

    const ctx = await buildUserContext(db, user);

    let conversation = null;
    if (conversationId) {
      const { data } = await db.from("ai_conversations").select("*").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
      conversation = data;
    }
    if (!conversation) {
      const { data, error } = await db.from("ai_conversations").insert({
        user_id: user.id, title: message.slice(0, 40), messages: []
      }).select().single();
      if (error) throw error;
      conversation = data;
    }

    const newMessages = [...(conversation.messages || []), { role: "user", content: message, created_date: new Date().toISOString() }];

    const systemContext = `You are Forge, an AI fitness and nutrition coach. Give practical, friendly, actionable advice in a knowledgeable-coach voice (not a medical textbook). Keep answers concise. Connect training, recovery, and nutrition when relevant.

User context:
${JSON.stringify(ctx)}

Formatting rules (very important):
- Write "reply" as plain conversational text. Do NOT use markdown: no asterisks, no pound signs, no backticks, no horizontal lines, no tables.
- If you need a list, put each item on its own line starting with "• ".

Workout rules:
- If the user asks for a workout, session, or training plan, set include_workout to true and fill in "workout". Keep "reply" to 1-3 short sentences introducing the session. Do NOT list the exercises in "reply", because they are shown to the user as an interactive card.
- For every other message, set include_workout to false and leave "workout" with empty strings and empty arrays.
- workout.warmup: 3-5 pre-workout warm-up items. Each has a short name and a detail such as "2 minutes" or "10 reps each side".
- workout.pre_tip: one or two sentences on what to eat or drink beforehand and roughly when.
- workout.exercises: 4-7 exercises that fit the user's equipment, goal, and session length. For each give target_sets, target_reps_min, target_reps_max, target_weight in the user's units (0 for bodyweight), rir_target (0-4), rest_sec, one sentence of instructions, and 2-3 short form_cues.
- Set is_timed to true for exercises performed for time (planks, wall sits, holds, dead hangs). For those, target_reps_min and target_reps_max are SECONDS (for example 30 and 45) and target_weight is 0 unless the hold is weighted. Set is_timed to false for every other exercise.
- Choose loads from the user's recent training in the context. If there is no history, choose conservative beginner loads.
- workout.cooldown: 3-4 post-workout items (stretches or breathing), each with a name and a detail such as "45 seconds per side".
- workout.post_tip: one or two sentences on post-workout food and recovery. If nutrition numbers are estimates, say so.

Timer fields for warm-up and cool-down items (the app runs a countdown from these, so fill them in for every item):
- seconds: how long ONE round of the item lasts, in whole seconds. Use 30 for child's pose or a typical stretch, 60 for "1 minute", 45 for "45 seconds". If the detail gives a range such as "30-45 seconds", use the lower number. Use 0 for rep-based items such as "10 reps" or "5 per side", which have no countdown.
- sides: 2 if the item is done on both sides one after the other (each side, each leg, each arm, both directions), otherwise 1. When sides is 2, seconds is the time for ONE side.
- Keep the detail consistent with these numbers, for example seconds 30 and sides 2 goes with "30 seconds each side". Every stretch or static hold must have seconds above 0.

Safety rules:
- Never diagnose injuries or medical conditions. If the user reports pain, dizziness, chest pain, or severe symptoms, recommend consulting a qualified healthcare professional and advise stopping if needed.
- Never promote crash diets, extreme calorie restriction, purging, or unsafe eating behaviors.
- Treat allergies as hard constraints — never recommend foods the user is allergic to.`;

    // Conversation history as text. Workout cards are summarized so the coach remembers what it prescribed.
    const conversationText = newMessages.map(m => {
      let text = m.content || "";
      if (m.workout?.exercises?.length) {
        text += `\n[Workout card shown: ${m.workout.name} — ${m.workout.exercises.map((e: any) => e.exercise_name).join(", ")}]`;
      }
      return `${m.role === "user" ? "User" : "Coach"}: ${text}`;
    }).join("\n\n");

    const result = await invokeLLMStructured(
      `${systemContext}\n\nConversation:\n${conversationText}\n\nWrite the coach's next reply as the JSON object.`,
      COACH_SCHEMA,
    );

    const reply = cleanText(result?.reply);
    const workout = result?.include_workout && result?.workout?.exercises?.length ? buildWorkoutCard(result.workout) : null;

    const assistantMessage: Record<string, unknown> = { role: "assistant", content: reply, created_date: new Date().toISOString() };
    if (workout) assistantMessage.workout = workout;

    const updatedMessages = [...newMessages, assistantMessage];

    const { data: updated, error: updateErr } = await db.from("ai_conversations")
      .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
      .eq("id", conversation.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return Response.json({ reply, conversation: updated }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
