import Kernel from "@onkernel/sdk";
import Lightcone from "@tzafon/lightcone";

const kernel = new Kernel({ apiKey: process.env.KERNEL_API });
const lightcone = new Lightcone({ apiKey: process.env.LIGHTCONE_API_KEY });

// Northstar retourne des coordonnées en espace 0-999 normalisé → pixels absolus Kernel
const W = 1280;
const H = 800;
const MAX_STEPS = 30;
const STEP_DELAY_MS = 800;

function denorm(v: number, dim: number): number {
  return Math.round((v / 1000) * dim);
}

export interface BrowserSession {
  sessionId: string;
  liveViewUrl: string;
}

export async function createSession(): Promise<BrowserSession> {
  const session = await kernel.browsers.create({
    stealth: true,
    timeout_seconds: 600,
    viewport: { width: W, height: H },
  });
  return {
    sessionId: session.session_id,
    liveViewUrl: session.browser_live_view_url ?? "",
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await kernel.browsers.deleteByID(sessionId);
}

export async function navigateTo(sessionId: string, url: string): Promise<void> {
  await kernel.browsers.playwright.execute(sessionId, {
    code: `await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 })`,
  });
}

async function takeScreenshot(sessionId: string): Promise<string> {
  const res = await kernel.browsers.computer.captureScreenshot(sessionId);
  // SDK retourne un Fetch Response binaire quand __binaryResponse: true
  const buf = Buffer.from(await (res as unknown as Response).arrayBuffer());
  return buf.toString("base64");
}

// Tool definition per Lightcone docs (type "computer_use", pas "computer_use_preview")
const TOOL = {
  type: "computer_use",
  display_width: W,
  display_height: H,
  environment: "browser",
} as never;

export async function runCuaOnKernel(
  sessionId: string,
  task: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.(`Taking initial screenshot...`);
  const b64_0 = await takeScreenshot(sessionId);
  onProgress?.(`Step 0: screenshot OK, calling Northstar...`);

  let response = await lightcone.responses.create({
    model: "tzafon.northstar-cua-fast",
    input: [{
      role: "user" as const,
      content: [
        { type: "input_text" as const, text: task },
        { type: "input_image" as const, image_url: `data:image/png;base64,${b64_0}`, detail: "auto" as const },
      ],
    }],
    tools: [TOOL],
  });

  let narratingStreak = 0;
  const MAX_NARRATING = 5;

  for (let step = 0; step < MAX_STEPS; step++) {
    const output = response.output as Array<Record<string, unknown>>;

    const computerCall = output?.find((o) => o.type === "computer_call") as Record<string, unknown> | undefined;

    if (!computerCall) {
      const msg = output?.find((o) => o.type === "message") as Record<string, unknown> | undefined;
      const content = msg?.content as Array<Record<string, unknown>> | undefined;
      const text = content?.find((c) => c.type === "output_text")?.text as string | undefined;

      // JSON trouvé → tâche terminée
      if (text && (text.includes('"summary"') || text.includes('"bot_detected"'))) {
        onProgress?.(`Done at step ${step}`);
        return text;
      }

      narratingStreak++;
      // Trop de narration sans action → on sort et retourne ce qu'on a
      if (narratingStreak >= MAX_NARRATING) {
        onProgress?.(`Exiting after ${narratingStreak} narration steps with no action`);
        return text ?? "";
      }

      // Renvoyer un screenshot pour relancer le modèle
      onProgress?.(`Step ${step}: narrating (${narratingStreak}/${MAX_NARRATING}), re-prompting...`);
      const b64cont = await takeScreenshot(sessionId);
      response = await lightcone.responses.create({
        model: "tzafon.northstar-cua-fast",
        previous_response_id: response.id,
        input: [{
          role: "user" as const,
          content: [
            { type: "input_text" as const, text: "Continue. Take the next action now." },
            { type: "input_image" as const, image_url: `data:image/png;base64,${b64cont}`, detail: "auto" as const },
          ],
        }],
        tools: [TOOL],
      });
      continue;
    }

    const action = computerCall.action as Record<string, unknown>;
    if (!action) break;

    const atype = action.type as string;
    if (["terminate", "done", "answer"].includes(atype)) {
      const result = (action.text ?? action.answer ?? action.result ?? "") as string;
      onProgress?.(`Terminate at step ${step}: ${result.slice(0, 100)}`);
      return result;
    }

    narratingStreak = 0;
    onProgress?.(`Step ${step + 1}: ${atype}`);
    await executeAction(sessionId, action);
    await new Promise((r) => setTimeout(r, STEP_DELAY_MS));

    const b64 = await takeScreenshot(sessionId);

    // Forcer la sortie JSON quand on approche de la limite
    const forceFinish = step >= MAX_STEPS - 5;
    const continuationInput = forceFinish
      ? [
          {
            type: "computer_call_output" as const,
            call_id: computerCall.call_id as string,
            output: { type: "input_image", image_url: `data:image/png;base64,${b64}`, detail: "auto" } as never,
          },
          {
            role: "user" as const,
            content: [{ type: "input_text" as const, text: "You are running out of steps. Stop browsing NOW and output the final JSON object with all the data you have gathered so far. No more actions." }],
          },
        ]
      : [{
          type: "computer_call_output" as const,
          call_id: computerCall.call_id as string,
          output: { type: "input_image", image_url: `data:image/png;base64,${b64}`, detail: "auto" } as never,
        }];

    response = await lightcone.responses.create({
      model: "tzafon.northstar-cua-fast",
      previous_response_id: response.id,
      input: continuationInput,
      tools: [TOOL],
    });
  }

  return "";
}

async function executeAction(sessionId: string, action: Record<string, unknown>) {
  const px = denorm(action.x as number, W);
  const py = denorm(action.y as number, H);

  switch (action.type as string) {
    case "click":
    case "left_click":
      await kernel.browsers.computer.clickMouse(sessionId, { x: px, y: py, button: "left", num_clicks: 1 });
      break;
    case "right_click":
      await kernel.browsers.computer.clickMouse(sessionId, { x: px, y: py, button: "right", num_clicks: 1 });
      break;
    case "double_click":
      await kernel.browsers.computer.clickMouse(sessionId, { x: px, y: py, button: "left", num_clicks: 2 });
      break;
    case "triple_click":
      await kernel.browsers.computer.clickMouse(sessionId, { x: px, y: py, button: "left", num_clicks: 3 });
      break;
    case "type":
      await kernel.browsers.computer.typeText(sessionId, { text: action.text as string });
      break;
    case "key":
    case "keypress": {
      const keys: string[] = Array.isArray(action.keys) ? action.keys : [action.key as string];
      await kernel.browsers.computer.pressKey(sessionId, { keys });
      break;
    }
    case "scroll": {
      // scroll_y: positif = bas, scroll_x: positif = droite
      const scrollY = (action.scroll_y as number) ?? 3;
      const scrollX = (action.scroll_x as number) ?? 0;
      await kernel.browsers.computer.scroll(sessionId, {
        x: px || Math.round(W / 2),
        y: py || Math.round(H / 2),
        delta_y: scrollY,
        delta_x: scrollX,
      });
      break;
    }
    case "hscroll": {
      const scrollX = (action.scroll_x as number) ?? 3;
      await kernel.browsers.computer.scroll(sessionId, {
        x: px || Math.round(W / 2),
        y: py || Math.round(H / 2),
        delta_x: scrollX,
      });
      break;
    }
    case "drag": {
      let dragPath: Array<[number, number]>;
      if (action.path && Array.isArray(action.path)) {
        const path = action.path as Array<Record<string, number>>;
        dragPath = path.map((p) => [denorm(p.x, W), denorm(p.y, H)]);
      } else {
        dragPath = [[px, py], [denorm(action.end_x as number, W), denorm(action.end_y as number, H)]];
      }
      await kernel.browsers.computer.dragMouse(sessionId, { path: dragPath });
      break;
    }
    case "move":
      await kernel.browsers.computer.moveMouse(sessionId, { x: px, y: py });
      break;
    case "navigate":
    case "open_page":
      await kernel.browsers.playwright.execute(sessionId, {
        code: `await page.goto(${JSON.stringify(action.url)}, { waitUntil: 'domcontentloaded', timeout: 30000 })`,
      });
      break;
    case "wait":
      await new Promise((r) => setTimeout(r, 2000));
      break;
    default:
      break;
  }
}
