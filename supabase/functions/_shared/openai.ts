// supabase/functions/_shared/openai.ts
// Shared by all Forge edge functions. Requires: supabase secrets set GEMINI_API_KEY=...
//
// Gemini exposes an OpenAI-compatible endpoint, so the request/response handling
// is the same shape as before. Exports are unchanged (invokeLLMStructured,
// invokeLLMText, corsHeaders), so the edge functions importing this file
// don't need to be edited.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Models are tried in this order. If one is overloaded (503) or rate limited (429),
// the helper retries once, then moves on to the next model. Check the current names
// in Google AI Studio and edit this list if any of them stop working.
const MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
const DEFAULT_MODEL = MODELS[0];
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sends the request, retrying briefly on temporary errors and falling back to
// the next model in the list. Returns the parsed JSON response.
async function callGemini(requestBody: Record<string, unknown>, preferredModel: string) {
  const order = [preferredModel, ...MODELS.filter((m) => m !== preferredModel)];
  let lastError = "";

  for (const model of order) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(GEMINI_BASE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${GEMINI_API_KEY}` },
        body: JSON.stringify({ ...requestBody, model }),
      });
      if (res.ok) return await res.json();

      const text = await res.text();
      lastError = `Gemini API error (${model}): ${res.status} ${text}`;
      // Errors like a bad key (401/403), bad schema (400) or unknown model (404)
      // won't fix themselves, so stop immediately instead of retrying.
      if (!RETRYABLE.has(res.status)) throw new Error(lastError);
      if (attempt === 0) await sleep(1000);
    }
  }
  throw new Error(lastError);
}

// Every property is marked required so the model always returns the full shape.
// (additionalProperties: false was removed: it's an OpenAI/xAI strict-mode
// requirement that Gemini's schema handling may reject.)
function toStrictSchema(schema: Record<string, any>) {
  function patch(node: any): any {
    if (node?.type === "object" && node.properties) {
      const properties: Record<string, any> = {};
      for (const key of Object.keys(node.properties)) properties[key] = patch(node.properties[key]);
      return { ...node, properties, required: Object.keys(node.properties) };
    }
    if (node?.type === "array" && node.items) return { ...node, items: patch(node.items) };
    return node;
  }
  return patch(schema);
}

// Models occasionally wrap JSON in ```json fences even when asked for pure JSON.
function parseJson(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

// Structured output - equivalent to base44's InvokeLLM({ prompt, response_json_schema })
export async function invokeLLMStructured(prompt: string, schema: Record<string, unknown>, model = DEFAULT_MODEL) {
  const data = await callGemini(
    {
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "structured_output", strict: true, schema: toStrictSchema(schema) } },
    },
    model,
  );
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No structured content returned by the model.");
  return parseJson(content);
}

// Plain text output - equivalent to base44's InvokeLLM({ prompt, model: "automatic" }) with no schema
export async function invokeLLMText(prompt: string, model = DEFAULT_MODEL) {
  const data = await callGemini({ messages: [{ role: "user", content: prompt }] }, model);
  return data.choices?.[0]?.message?.content || "";
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
