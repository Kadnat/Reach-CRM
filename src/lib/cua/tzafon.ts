export interface TzafonDelta {
  type: string;
  content?: string;
  [key: string]: unknown;
}

export async function runCuaTask(instruction: string): Promise<string> {
  const response = await fetch("https://api.tzafon.ai/agent/tasks/stream", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LIGHTCONE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_type: "harness",
      instruction,
      stream_delta: true,
      mode: "tzafon.northstar-cua-fast-1.6",
    }),
  });

  if (!response.ok) {
    throw new Error(`Tzafon error ${response.status}: ${await response.text()}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as TzafonDelta;
          if (parsed.content && typeof parsed.content === "string") {
            fullText += parsed.content;
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
  }

  return fullText;
}
