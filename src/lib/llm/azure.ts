import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AZURE_KEY!,
  baseURL: `${process.env.AZURE_URI}/openai/v1`,
});

const model = process.env.AZURE_MODEL || "Kimi-K2.6";

export async function azureChat(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
