// supabase/functions/import-recipe/index.ts
// Deploy: supabase functions deploy import-recipe

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invokeLLMStructured, corsHeaders } from "../_shared/openai.ts";

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

    const body = await req.json().catch(() => ({}));
    const { text, sourceUrl } = body;
    const input = text || sourceUrl;
    if (!input) return Response.json({ error: "Recipe text or URL required" }, { status: 400, headers: corsHeaders });

    const { data: profiles } = await db.from("profiles").select("allergies").eq("user_id", user.id).limit(1);
    const allergies = profiles?.[0]?.allergies || [];

    const prompt = `Extract a structured recipe from the following text or URL. If a URL is provided and you cannot fetch it, do your best with the URL text itself.

Input:
${input}

${allergies.length ? `User allergies (flag if any ingredient matches): ${JSON.stringify(allergies)}` : ""}

Extract: title, servings, prep_time_min, cook_time_min, ingredients (name, quantity, unit, category), instructions (array of steps), and nutrition per serving if reliably available. If nutrition is not explicitly stated, estimate it and set nutrition_estimated true. Never fabricate nutrition as verified.

Return JSON:
{
  "title": "string",
  "servings": number,
  "prep_time_min": number,
  "cook_time_min": number,
  "ingredients": [{"name":"string","quantity":number,"unit":"string","category":"string"}],
  "instructions": ["string"],
  "nutrition": {"calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number},
  "nutrition_estimated": boolean,
  "dietary_tags": ["string"],
  "allergy_warning": "string or null"
}`;

    const res = await invokeLLMStructured(prompt, {
      type: "object",
      properties: {
        title: { type: "string" },
        servings: { type: "number" },
        prep_time_min: { type: "number" },
        cook_time_min: { type: "number" },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string" }, category: { type: "string" }
            }
          }
        },
        instructions: { type: "array", items: { type: "string" } },
        nutrition: {
          type: "object",
          properties: { calories: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" }, fiber: { type: "number" } }
        },
        nutrition_estimated: { type: "boolean" },
        dietary_tags: { type: "array", items: { type: "string" } },
        allergy_warning: { type: "string" }
      }
    });

    const recipe = { ...res, source: sourceUrl ? "url" : "text", source_url: sourceUrl || "" };
    return Response.json({ recipe }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
