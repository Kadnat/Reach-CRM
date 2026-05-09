import { Mistral } from "@mistralai/mistralai";

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
const model = process.env.MISTRAL_MODEL || "mistral-small-latest";

export async function mistralJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const res = await mistral.chat.complete({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    responseFormat: { type: "json_object" },
  });
  const content = res.choices?.[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(typeof content === "string" ? content : JSON.stringify(content)) as T;
  } catch {
    throw new Error("Mistral returned invalid JSON: " + content);
  }
}
