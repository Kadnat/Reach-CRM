# Reach — AI-Powered B2B Prospect Intelligence

> Give it your pitch. Add a few names. Watch it work.

![Reach CRM](docs/screenshot.png)

---

Reach is an autonomous B2B research agent built for sales teams. Instead of spending hours on manual research, you describe your company, drop a few prospect names, and Reach does the rest — scraping the open web, extracting structured intel, and scoring every profile against your ICP in real time.

---

## Features

- **Zero-friction input** — just a pitch + name + company. No LinkedIn URLs, no spreadsheets.
- **Live enrichment** — profiles fill in progressively as agents work. No waiting for a batch job to finish.
- **Deep web scraping** — 3 independent AI browser agents per prospect (bio, contact, press) running in parallel Kernel sessions.
- **ICP scoring** — every prospect is automatically scored and tagged (hot / warm / cold) against your ideal customer profile.
- **Bot resilience** — Cloudflare or CAPTCHA wall? The agent drops the session and opens a fresh one automatically.

---

## How it works

```
Your pitch
    └─ ICP extraction (Kimi K2)
         └─ For each prospect (in parallel):
              ├─ Agent 1 → Google search → role, bio, company info
              ├─ Agent 2 → Contact search → email, phone
              └─ Agent 3 → Press scraping → recent mentions
                   └─ Each result saved to MongoDB immediately → dashboard updates live
```

Each agent runs a **Northstar CUA loop** (Lightcone) driving a headless **Kernel browser** session:
screenshot → model decides next action → execute on browser → repeat.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| Database | MongoDB Atlas |
| Browser sessions | [Kernel](https://onkernel.com) — `@onkernel/sdk` |
| Computer-Use Agent | [Lightcone Northstar](https://lightcone.ai) — `@tzafon/lightcone` |
| ICP & scoring LLM | Kimi K2.6 (Azure AI) |
| Extraction LLM | Mistral Small |

---

## Getting started

### Prerequisites

- Node.js 20+
- A MongoDB Atlas cluster
- API keys for Kernel, Lightcone, Azure AI, and Mistral

### Installation

```bash
git clone https://github.com/Kadnat/Reach-CRM.git
cd Reach-CRM
npm install
cp .env.local.example .env.local  # fill in your keys
npm run dev
```

### Environment variables

```env
LIGHTCONE_API_KEY=        # Lightcone / Northstar
KERNEL_API=               # Kernel browser sessions
MONGODB_URI=              # MongoDB Atlas connection string
AZURE_URI=                # Azure AI endpoint
AZURE_KEY=                # Azure AI key
AZURE_MODEL=              # e.g. Kimi-K2.6
MISTRAL_API_KEY=          # Mistral
MISTRAL_MODEL=            # e.g. mistral-small-latest
```

---

## Usage

1. Open `http://localhost:3000`
2. Paste your company pitch
3. Add prospect names + companies (one per row)
4. Hit **Enrich & Discover →**
5. Watch profiles populate live on the dashboard

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Home — pitch + prospect input
│   ├── dashboard/page.tsx        # Live results dashboard
│   └── api/
│       ├── seed/route.ts         # Kicks off the enrichment pipeline
│       └── runs/[id]/route.ts    # Polling endpoint for the dashboard
├── lib/
│   ├── agents/
│   │   ├── enrich.ts             # 3 mini CUA tasks per prospect
│   │   ├── icp.ts                # ICP extraction from pitch
│   │   ├── score.ts              # Prospect scoring against ICP
│   │   └── discovery.ts          # Similar profile discovery
│   ├── cua/
│   │   └── kernel.ts             # Northstar CUA loop + Kernel actions
│   └── llm/
│       ├── azure.ts              # Kimi K2.6 client
│       └── mistral.ts            # Mistral client
```

---

## Engineering notes

**CUA coordinate system** — Northstar returns normalized 0–999 coordinates. Kernel expects absolute pixels. A `denorm(v, dim)` function converts every coordinate before sending to the browser.

**Progressive enrichment** — instead of one long browser session that blocks until the end, each prospect runs 3 focused mini-tasks. Each mini-task saves its result to MongoDB immediately, so the dashboard feels live.

**Bot wall handling** — if the agent hits a CAPTCHA or Cloudflare wall, it outputs `{"bot_detected": true}` and the orchestrator spins up a fresh Kernel session instead of attempting to solve it (up to 3 retries per task).

**Narration loop guard** — the CUA model occasionally narrates without taking an action. A `narratingStreak` counter exits the loop after 5 consecutive non-action turns to prevent infinite loops.

**LinkedIn abandoned** — login walls made browser automation unreliable. The pipeline was rebuilt entirely around open-web sources (Google, company sites, press).

---

## License

MIT
