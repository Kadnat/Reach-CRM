import Kernel from "@onkernel/sdk";
import Lightcone from "@tzafon/lightcone";

const kernel = new Kernel({ apiKey: process.env.KERNEL_API });
const lightcone = new Lightcone({ apiKey: process.env.LIGHTCONE_API_KEY });

const W = 1280;
const H = 800;
const MAX_STEPS = 50;

export interface BrowserSession {
  sessionId: string;
  liveViewUrl: string;
}

export async function createSession(): Promise<BrowserSession> {
  const session = await kernel.browsers.create({
    stealth: true,
    timeout_seconds: 600,
  });
  return {
    sessionId: session.session_id,
    liveViewUrl: session.browser_live_view_url ?? "",
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  await kernel.browsers.deleteByID(sessionId);
}

export async function runCuaOnKernel(
  sessionId: string,
  task: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const screenshot = await kernel.browsers.computer.captureScreenshot(sessionId);
  const pngBuffer = Buffer.from(await screenshot.arrayBuffer());
  const screenshotB64 = pngBuffer.toString("base64");

  onProgress?.(`Step 0: initial screenshot captured`);

  const TOOL = {
    type: "computer_use_preview" as const,
    display_width: W,
    display_height: H,
    environment: "browser" as const,
  };

  let response = await lightcone.responses.create({
    model: "tzafon.northstar-cua-fast",
    input: [{
      role: "user" as const,
      content: [
        { type: "input_text" as const, text: task },
        { type: "input_image" as const, image_url: `data:image/png;base64,${screenshotB64}`, detail: "auto" as const },
      ],
    }],
    tools: [TOOL],
  });

  for (let step = 0; step < MAX_STEPS; step++) {
    const output = response.output as Array<Record<string, unknown>>;
    const computerCall = output?.find((o) => o.type === "computer_call") as Record<string, unknown> | undefined;

    if (!computerCall) {
      const textItem = output?.find((o) => o.type === "message") as Record<string, unknown> | undefined;
      const content = textItem?.content as Array<Record<string, unknown>> | undefined;
      const text = content?.find((c) => c.type === "output_text")?.text as string | undefined;
      return text ?? JSON.stringify(output);
    }

    const action = computerCall.action as Record<string, unknown>;
    if (!action) break;

    const atype = action.type as string;
    if (["terminate", "done", "answer"].includes(atype)) {
      return (action.text ?? action.answer ?? action.result ?? "") as string;
    }

    onProgress?.(`Step ${step + 1}: ${atype}`);
    await executeAction(sessionId, action);
    await new Promise((r) => setTimeout(r, 800));

    const newShot = await kernel.browsers.computer.captureScreenshot(sessionId);
    const newBuf = Buffer.from(await newShot.arrayBuffer());
    const newB64 = newBuf.toString("base64");

    response = await lightcone.responses.create({
      model: "tzafon.northstar-cua-fast",
      previous_response_id: response.id,
      input: [{
        type: "computer_call_output" as const,
        call_id: computerCall.call_id as string,
        output: { type: "computer_screenshot" as const, image_url: `data:image/png;base64,${newB64}` },
      }],
      tools: [TOOL],
    });
  }

  return "";
}

async function executeAction(sessionId: string, action: Record<string, unknown>) {
  const x = action.x as number;
  const y = action.y as number;

  switch (action.type as string) {
    case "click":
      await kernel.browsers.computer.clickMouse(sessionId, { x, y });
      break;
    case "double_click":
      await kernel.browsers.computer.clickMouse(sessionId, { x, y, num_clicks: 2 });
      break;
    case "type":
      await kernel.browsers.computer.typeText(sessionId, { text: action.text as string });
      break;
    case "key":
    case "keypress":
      await kernel.browsers.computer.pressKey(sessionId, {
        keys: Array.isArray(action.keys) ? action.keys : [action.key as string],
      });
      break;
    case "scroll":
      await kernel.browsers.computer.scroll(sessionId, {
        x: x ?? 640,
        y: y ?? 400,
        delta_x: 0,
        delta_y: (action.scroll_direction === "down" ? 1 : -1) * ((action.scroll_distance as number) ?? 3),
      });
      break;
    case "drag":
      await kernel.browsers.computer.dragMouse(sessionId, {
        path: [[x, y], [action.end_x as number, action.end_y as number]],
      });
      break;
    case "navigate":
    case "open_page":
      await kernel.browsers.playwright.execute(sessionId, {
        code: `await page.goto(${JSON.stringify(action.url)})`,
      });
      break;
    default:
      break;
  }
}
