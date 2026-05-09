export interface TzafonEvent {
  type: string;
  result?: string;
  message?: string;
  content?: string;
  [key: string]: unknown;
}

export async function runCuaTask(instruction: string, timeoutMs = 180_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));

  if (!response.ok) {
    throw new Error(`Tzafon error ${response.status}: ${await response.text()}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data) as TzafonEvent;
        if (event.type === "completed" && event.result) {
          result = event.result;
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  return result;
}
