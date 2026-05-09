# Guide d'utilisation : Kernel + Lightcone (Northstar CUA)

## Bugs critiques corrigés (09/05/2026)

| Ce qu'on faisait (FAUX) | Ce qu'il faut faire (CORRECT) |
|---|---|
| `kernel.browsers.computer.captureScreenshot(id)` | `kernel.browsers.computerActions.captureScreenshot({ session_id: id })` |
| `kernel.browsers.computer.clickMouse(id, { x, y })` | `kernel.browsers.computerActions.clickMouse({ session_id: id, x, y })` |
| `kernel.browsers.playwright.execute(id, { code })` | `kernel.browsers.playwright.execute({ session_id: id, code })` |
| `type: "computer_use_preview"` (Lightcone tool) | `type: "computer_use"` |
| `model: "tzafon.northstar-cua-fast-1.6"` | `model: "tzafon.northstar-cua-fast"` |
| Screenshot → `Buffer.from(await screenshot.arrayBuffer())` | Screenshot → `screenshot.image` (déjà un Buffer) |

---

## 1. Kernel — Browser Infrastructure

### Init
```typescript
import Kernel from "@onkernel/sdk";
const kernel = new Kernel({ apiKey: process.env.KERNEL_API });
```

### Créer / supprimer une session
```typescript
const session = await kernel.browsers.create({
  stealth: true,
  timeout_seconds: 600,
});
// session.session_id, session.browser_live_view_url

await kernel.browsers.deleteByID(session.session_id);
```

### Screenshot
```typescript
const shot = await kernel.browsers.computerActions.captureScreenshot({
  session_id: sessionId,
});
// shot.image est un Buffer PNG
const b64 = (shot.image as Buffer).toString("base64");
```

### Actions souris
```typescript
await kernel.browsers.computerActions.clickMouse({
  session_id: sessionId,
  x: 100, y: 200,
  button: "left",   // "left" | "right" | "middle"
  clicks: 1,         // 2 = double-click
});

await kernel.browsers.computerActions.moveMouse({ session_id: sessionId, x, y });

await kernel.browsers.computerActions.dragMouse({
  session_id: sessionId,
  from_x: 100, from_y: 100,
  to_x: 200,   to_y: 200,
});
```

### Clavier
```typescript
await kernel.browsers.computerActions.typeText({
  session_id: sessionId,
  text: "hello world",
});

await kernel.browsers.computerActions.pressKey({
  session_id: sessionId,
  key: "Enter",
  modifiers: ["Ctrl"],   // optionnel : ["Shift", "Alt", "Meta"]
});
```

### Scroll
```typescript
await kernel.browsers.computerActions.scroll({
  session_id: sessionId,
  x: 640, y: 400,
  direction: "down",   // "up" | "down"
  amount: 3,
});
```

### Navigation Playwright (plus fiable pour les URLs)
```typescript
await kernel.browsers.playwright.execute({
  session_id: sessionId,
  code: `await page.goto("https://example.com", { waitUntil: "domcontentloaded" })`,
} as never);
```
> **Important** : `session_id` est DANS l'objet, pas en premier argument.

---

## 2. Lightcone (Northstar CUA)

### Init
```typescript
import Lightcone from "@tzafon/lightcone";
const lightcone = new Lightcone({ apiKey: process.env.LIGHTCONE_API_KEY });
```

### Tool definition
```typescript
const TOOL = {
  type: "computer_use" as const,   // PAS "computer_use_preview"
  display_width: 1280,
  display_height: 800,
  environment: "browser" as const,
};
```

### Premier appel (screenshot initial)
```typescript
const response = await lightcone.responses.create({
  model: "tzafon.northstar-cua-fast",   // sans suffixe "-1.6"
  input: [{
    role: "user" as const,
    content: [
      { type: "input_text" as const, text: taskPrompt },
      { type: "input_image" as const, image_url: `data:image/png;base64,${b64}`, detail: "auto" as const },
    ],
  }],
  tools: [TOOL],
});
```

### Continuation (après chaque action)
```typescript
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
```

### Lire la sortie
```typescript
const output = response.output as Array<Record<string, unknown>>;

// Action à exécuter ?
const computerCall = output.find(o => o.type === "computer_call");
const action = computerCall?.action; // { type, x, y, text, url, keys, ... }

// Réponse finale (pas de computer_call) ?
const msg = output.find(o => o.type === "message");
const text = (msg?.content as Array<Record<string,unknown>>)
  ?.find(c => c.type === "output_text")?.text;
```

### Actions retournées par Northstar
| `action.type` | Champs supplémentaires |
|---|---|
| `click` | `x`, `y` |
| `double_click` | `x`, `y` |
| `type` | `text` |
| `key` / `keypress` | `keys: string[]` |
| `scroll` | `x`, `y`, `scroll_direction` ("up"/"down"), `scroll_distance` |
| `drag` | `x`, `y`, `end_x`, `end_y` |
| `move` | `x`, `y` |
| `navigate` / `open_page` | `url` |
| `terminate` / `done` / `answer` | `text` / `answer` / `result` |

---

## 3. Pattern CUA complet (loop)

```typescript
async function runCua(sessionId: string, task: string): Promise<string> {
  // 1. Pré-naviguer si besoin
  await kernel.browsers.playwright.execute({
    session_id: sessionId,
    code: `await page.goto("https://target.com")`,
  } as never);

  // 2. Screenshot initial
  const shot0 = await kernel.browsers.computerActions.captureScreenshot({ session_id: sessionId });
  const b64_0 = (shot0.image as Buffer).toString("base64");

  const TOOL = { type: "computer_use" as const, display_width: 1280, display_height: 800, environment: "browser" as const };

  let response = await lightcone.responses.create({
    model: "tzafon.northstar-cua-fast",
    input: [{ role: "user", content: [
      { type: "input_text", text: task },
      { type: "input_image", image_url: `data:image/png;base64,${b64_0}`, detail: "auto" },
    ]}],
    tools: [TOOL],
  });

  // 3. Loop
  for (let step = 0; step < 100; step++) {
    const output = response.output as Array<Record<string, unknown>>;
    const cc = output?.find(o => o.type === "computer_call") as Record<string, unknown> | undefined;

    if (!cc) {
      // Réponse texte finale
      const msg = output?.find(o => o.type === "message") as Record<string, unknown> | undefined;
      const content = msg?.content as Array<Record<string, unknown>> | undefined;
      return content?.find(c => c.type === "output_text")?.text as string ?? "";
    }

    const action = cc.action as Record<string, unknown>;
    if (["terminate","done","answer"].includes(action.type as string))
      return (action.text ?? action.answer ?? action.result ?? "") as string;

    // Exécuter l'action sur Kernel
    await executeKernelAction(sessionId, action);
    await new Promise(r => setTimeout(r, 600));

    // Nouveau screenshot
    const shot = await kernel.browsers.computerActions.captureScreenshot({ session_id: sessionId });
    const b64 = (shot.image as Buffer).toString("base64");

    response = await lightcone.responses.create({
      model: "tzafon.northstar-cua-fast",
      previous_response_id: response.id,
      input: [{ type: "computer_call_output", call_id: cc.call_id as string,
        output: { type: "computer_screenshot", image_url: `data:image/png;base64,${b64}` } }],
      tools: [TOOL],
    });
  }
  return "";
}
```

---

## 4. Gotchas importants

- **Toujours pré-naviguer** via `playwright.execute` avant le CUA — le browser démarre sur DuckDuckGo
- **login + extraction = 1 seule tâche CUA** (sinon 2×100 steps = trop lent)
- **LinkedIn détecte les bots** → utiliser `stealth: true` sur le browser Kernel
- **Vérification email** → gérer dans le prompt CUA avec accès Proton Mail
- **MAX_STEPS = 100** pour login + extraction combinés
- **Coordonnées Kernel** = pixels absolus (pas normalisés 0-999)
- **`playwright.execute` ne retourne rien d'utile** côté code TypeScript, ignorer le retour
