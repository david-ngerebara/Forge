// supabase/functions/explain-exercise/index.ts
// Answers "explain this exercise" / "give me an easier version" for the How to sheet, without touching the coach chat history.
// Deploy: supabase functions deploy explain-exercise

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildUserContext } from "../_shared/fitness.ts";
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

    const body = await req.json().catch(() => ({}));
    const name = String(body.exercise_name ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 100);
    const mode = body.mode === "easier" ? "easier" : "explain";
    if (!name) return Response.json({ error: "exercise_name is required" }, { status: 400, headers: corsHeaders });

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const p = (await buildUserContext(db, user)).profile;

    const about = `About the person: experience level ${p.experience ?? "unknown"}; equipment available ${JSON.stringify(p.equipment ?? [])}; injuries or limitations ${JSON.stringify(p.injuries ?? [])}.`;
    const style = "Write plain text only: no markdown, no headings, no bullet symbols, no asterisks. Use short sentences. Be encouraging but practical.";
    const safety = "If the exercise could aggravate a listed injury, say so and suggest a safer alternative. If they feel sharp pain, tell them to stop.";

    const prompt = mode === "easier"
      ? `You are Forge's coach. The exercise is "${name}". Suggest ONE easier version (a regression) that suits this person and explain how to do it in under 90 words. Then add one sentence on when to move up to the full exercise.\n${about}\n${safety}\n${style}`
      : `You are Forge's coach. Explain the exercise "${name}" to someone who has never done it, in under 130 words. Cover in order: how to set up, how to do one rep, the most common mistake, and what they should feel working.\n${about}\n${safety}\n${style}`;

    const text = await invokeLLMText(prompt);
    if (!text) throw new Error("Empty response from the model");
    return Response.json({ text }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
