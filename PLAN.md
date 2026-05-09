# Reach-CRM — Plan de hack (Computer Agents Hackathon)

## Context

**Le problème.** Construire un CRM B2B oblige aujourd'hui à enchaîner plusieurs outils manuels (LinkedIn Sales Navigator, Apollo, Lemlist, scrapers, scoring à la main). C'est lent, segmenté et la qualification est subjective.

**Notre proposition.** Reach-CRM est un CRM qui se construit et se qualifie tout seul : l'utilisateur décrit sa boîte → l'agent construit l'ICP → un agent CUA (Northstar piloté sur browser KERNEL) découvre et enrichit les prospects sur plusieurs sources → un LLM les score et rédige le premier contact. Tout est stocké en MongoDB et visualisé dans une webapp Next.js.

**Cadre.** Hackathon CUA Apps : KERNEL pour browser infra, Northstar pour le modèle CUA. Submission à 16h. Stack et choix techniques validés avec l'utilisateur :
- Next.js full-stack (App Router) + Tailwind
- Mistral (`mistral-small-latest`) pour ICP/scoring + Azure (`Kimi-K2.6`) pour la rédaction d'email
- Sources démo : LinkedIn (profil + posts), Twitter/X (bio + tweets), site web entreprise
- Mode démo hybride : 1-2 prospects pré-enrichis en BDD + 1 prospect lancé live pendant le pitch

**Outcome visé.** Un dashboard live qui se peuple visiblement (LinkedIn ✅ Twitter ⏳ Site web ⏳), un score 0-100 avec "why this lead", et un draft d'email AIDA citant un signal trouvé pendant l'enrichissement. Repo public sur GitHub (`Kadnat/Reach-CRM`).

---

## Stack & architecture

```
┌─ Next.js (App Router) ──────────────────────────┐
│  app/                                            │
│   ├─ (onboarding)/page.tsx        — wizard ICP   │
│   ├─ dashboard/page.tsx           — liste prosp. │
│   ├─ prospects/[id]/page.tsx      — fiche+email  │
│   └─ api/                                        │
│      ├─ icp/route.ts              — POST/GET     │
│      ├─ runs/route.ts             — lance run    │
│      ├─ runs/[id]/stream/route.ts — SSE progress │
│      ├─ prospects/route.ts                       │
│      └─ prospects/[id]/draft/route.ts            │
└──────────┬───────────────────────────────────────┘
           │
   ┌───────▼─────────┐    ┌─────────────┐   ┌────────────────┐
   │  Mongo Atlas    │    │  Mistral    │   │ Azure Kimi-K2  │
   │  (cluster déjà) │    │  (LLM rapide)│   │ (rédaction)    │
   └─────────────────┘    └─────────────┘   └────────────────┘
                          ▲
                          │ orchestration
              ┌───────────┴───────────────┐
              │  lib/agents/              │
              │   ├─ icp.ts   (LLM)       │
              │   ├─ discovery.ts (CUA)   │
              │   ├─ enrich.ts (CUA × N)  │
              │   ├─ score.ts  (LLM)      │
              │   └─ draft.ts  (LLM)      │
              └─────┬───────────┬─────────┘
                    │           │
              ┌─────▼─────┐ ┌───▼─────────────────┐
              │  KERNEL   │ │ Tzafon Northstar    │
              │ (browser) │ │ /agent/tasks/stream │
              └───────────┘ │ harness + cua-fast  │
                            └─────────────────────┘
```

**Découpage des responsabilités** (critère "technical novelty" du jury) :
- **CUA (Northstar harness)** = naviguer, lire, extraire des pages réelles
- **LLM (Mistral / Azure Kimi)** = raisonner, structurer, scorer, rédiger
- **MongoDB** = source de vérité unique (ICP, runs, prospects, drafts)
- **KERNEL** = infrastructure browser (sessions, observabilité, replay)

---

## Modèle de données MongoDB

Collections (DB `reach_crm`) :

- `icps` : `{ _id, company_pitch, icp:{roles, industries, company_size, geography, buying_signals}, sources_enabled:[], created_at }`
- `runs` : `{ _id, icp_id, status:'pending'|'running'|'done'|'error', started_at, finished_at, log:[{ts,level,msg}] }`
- `prospects` : `{ _id, run_id, name, company, role, sources:{linkedin:{...}, twitter:{...}, website:{...}}, enrichment_status, score, score_breakdown, why_this_lead, tag:'hot'|'warm'|'cold', created_at, updated_at }`
- `drafts` : `{ _id, prospect_id, channel:'email'|'linkedin_dm'|'twitter_reply', subject, body, citations:[{source,quote}], created_at }`

Index : `prospects.run_id`, `prospects.score`, `runs.status`.

---

## Phasage (6h, ~10:30 → 16:00)

### Phase 0 — Setup (0:30)
- `npx create-next-app@latest` (TS, App Router, Tailwind, src dir)
- Dépendances : `mongodb`, `zod`, `swr`, `@mistralai/mistralai`, `openai` (pour Azure), `@onkernel/sdk` (browser KERNEL), `eventsource-parser` (SSE Tzafon)
- `lib/env.ts` : charge `LIGHTCONE_API_KEY`, `KERNEL_API`, `MONGODB_URI`, `MISTRAL_*`, `AZURE_*` depuis `.env.local`
- `lib/db.ts` : singleton Mongo client (cluster déjà créé)
- `git remote add origin git@github.com:Kadnat/Reach-CRM.git` puis `git push -u origin main` une fois le squelette en place

### Phase 1 — Onboarding ICP + LLM (1:00)
- UI : `app/(onboarding)/page.tsx` — textarea pitch + champs optionnels (URLs LinkedIn d'exemples)
- `lib/agents/icp.ts` : Mistral en `response_format: json_object` → renvoie l'ICP structuré (schéma `icp` ci-dessus)
- `app/api/icp/route.ts` : POST → insère dans `icps`, retourne id

### Phase 2 — Découverte CUA + Enrichissement parallèle (2:00, le plus risqué)
- `lib/cua/tzafon.ts` : wrapper du curl `.lightcone` (POST `https://api.tzafon.ai/agent/tasks/stream`, `agent_type:"harness"`, `mode:"tzafon.northstar-cua-fast-1.6"`, `stream_delta:true`, Bearer `LIGHTCONE_API_KEY`). Parse SSE avec `eventsource-parser`, accumule deltas, expose un async iterator.
- `lib/cua/kernel.ts` : crée une session browser KERNEL via le SDK `@onkernel/sdk` (`KERNEL_API` Bearer). Sert d'infra browser observable ; URL CDP transmise à l'instruction Tzafon si supporté (sinon fallback : Northstar gère son propre browser, KERNEL utilisé pour replay/observability et pour le critère "track adherence").
- `lib/agents/discovery.ts` : prompt CUA "Find 5 prospects matching this ICP via Google/LinkedIn search". Output : liste `{name, company, role, linkedin_url}`.
- `lib/agents/enrich.ts` : pour chaque prospect, lance N tâches CUA en parallèle (une par source activée). Chaque tâche écrit son delta dans `prospects.sources.{linkedin|twitter|website}` au fil de l'eau.
- `app/api/runs/route.ts` (POST) : crée un `run`, lance `discovery → enrich` en background (Node `setImmediate` ou route async sans `await`), retourne `run_id`.
- `app/api/runs/[id]/stream/route.ts` (GET, SSE) : poll Mongo every 1s sur `prospects` du run, push diff au client.

### Phase 3 — Scoring + Why-this-lead (0:45)
- `lib/agents/score.ts` : Mistral, prompt avec ICP + fiche enrichie → `{score, breakdown:{fit, signal, reachability}, why_this_lead, tag}`.
- Déclenché à la complétion de chaque prospect (via la background job de Phase 2).

### Phase 4 — Dashboard + Détail prospect (1:00)
- `app/dashboard/page.tsx` : table triable par score, badges 🔥/🟠/⚪, abonnement SSE pour mise à jour live des cellules (LinkedIn ✅ etc.).
- `app/prospects/[id]/page.tsx` : fiche complète + bouton "Générer email".
- `lib/agents/draft.ts` : Azure Kimi-K2.6 (SDK `openai` pointé sur `AZURE_URI` + `AZURE_KEY`) → email AIDA avec citation explicite d'un signal.
- `app/api/prospects/[id]/draft/route.ts` : POST → génère draft, store dans `drafts`, retourne.

### Phase 5 — Polish, démo, soumission (0:45)
- Pré-run 2 prospects "in the bag" en BDD (ex. CEO d'un FlowHR fictif, Head of Sales chez ManufactPME) avant la démo
- Logo simple, page d'accueil "Reach-CRM" propre, README avec architecture + crédits Tzafon/KERNEL
- Vidéo back-up 90s capturant un run live au cas où
- `git push` sur `main`, créer release `v0.1.0`

**Buffer 0:00** — viser 15h45 pour finir, garder 15min de marge.

---

## Critical files (à créer)

| Fichier | Rôle |
|---|---|
| `src/app/(onboarding)/page.tsx` | Wizard ICP |
| `src/app/dashboard/page.tsx` | Liste prospects + scores live |
| `src/app/prospects/[id]/page.tsx` | Fiche + draft email |
| `src/app/api/icp/route.ts` | POST/GET ICP |
| `src/app/api/runs/route.ts` | Lance discovery+enrich |
| `src/app/api/runs/[id]/stream/route.ts` | SSE progress |
| `src/app/api/prospects/[id]/draft/route.ts` | Génère email |
| `src/lib/db.ts` | Singleton Mongo |
| `src/lib/env.ts` | Validation Zod des env vars |
| `src/lib/llm/mistral.ts` | Client Mistral + helpers JSON |
| `src/lib/llm/azure.ts` | Client Azure Kimi (via SDK openai) |
| `src/lib/cua/tzafon.ts` | Wrapper streaming Northstar harness |
| `src/lib/cua/kernel.ts` | Session browser KERNEL |
| `src/lib/agents/icp.ts` | ICP builder |
| `src/lib/agents/discovery.ts` | Découverte prospects |
| `src/lib/agents/enrich.ts` | Enrichissement multi-sources |
| `src/lib/agents/score.ts` | Scoring + why_this_lead |
| `src/lib/agents/draft.ts` | Génération email AIDA |
| `README.md` | Pitch + archi + setup |

---

## Réutilisation / patterns clés

- **Tzafon stream** : la commande `.lightcone` du repo est déjà la bonne signature. Réutiliser exactement `agent_type:"harness"`, `mode:"tzafon.northstar-cua-fast-1.6"`, `stream_delta:true`. Le wrapper `lib/cua/tzafon.ts` doit être un AsyncIterator qui yield les deltas pour chaîner facilement dans `enrich.ts`.
- **JSON mode Mistral** : `response_format: { type: "json_object" }` + schéma dans le prompt — évite le parsing manuel.
- **Azure via SDK OpenAI** : `new OpenAI({ apiKey: AZURE_KEY, baseURL: AZURE_URI + "/openai/v1" })` avec model `Kimi-K2.6`.
- **SSE Next.js App Router** : `Response` avec `ReadableStream`, headers `text/event-stream`. Pas de WebSocket nécessaire.
- **Background jobs sans BullMQ** : le run est lancé fire-and-forget depuis l'API route ; Mongo est la queue (collection `runs` avec status). Suffisant pour la démo single-user.

---

## Verification (end-to-end)

1. `npm run dev` → ouvrir `localhost:3000`
2. Onboarding : décrire une boîte fictive (`"SaaS RH pour PME industrielles 50-500"`) → vérifier que l'ICP JSON est bien stocké en BDD (`db.icps.findOne()`)
3. Dashboard → "Lancer un run" → observer en live :
   - colonne LinkedIn passe ⏳ → ✅
   - score apparaît ~30s après la fin de l'enrichissement
   - tag 🔥/🟠/⚪ correct vs ICP
4. Cliquer un prospect Hot → "Générer email" → email AIDA avec citation explicite d'un post LinkedIn trouvé
5. Mongo Atlas : `runs` contient un doc `done`, `prospects` 3-5 docs avec sources non vides, `drafts` au moins 1 doc
6. KERNEL dashboard : la session browser apparaît avec replay MP4

**Smoke test minimal pour la démo** : un run pré-rempli (Phase 5) doit toujours afficher 2-3 prospects scorés et 1 email prêt même si le run live échoue.

---

## Risques & plan de mitigation

| Risque | Mitigation |
|---|---|
| LinkedIn login wall pendant la démo | Skip LinkedIn live, montrer LinkedIn sur le prospect pré-rempli. Site web + Twitter en live. |
| Latence Northstar (1-3 min/prospect) | 2 prospects pré-enrichis en BDD ; n'en lancer qu'**un** en live. |
| Coût Lightcone ($2500 crédits) | Cap à 5 runs de test avant la démo, monitorer via dashboard Lightcone. |
| Mistral renvoie du JSON cassé | Wrap dans `try/catch` + retry 1× avec prompt "Reply with VALID json only". |
| Azure Kimi indisponible | Fallback automatique sur Mistral pour la rédaction d'email. |
| Background job tué par cold start Vercel | Démo en local (`npm run dev`) — pas besoin de déployer. |
| Scope creep sur les sources | Geler à 3 sources ; "extensible to N sources" écrit dans le README. |

---

## Open question à trancher en début d'impl (15 min max)

**Comment Northstar harness se branche à KERNEL ?** Le sample `.lightcone` n'inclut pas de session id browser. Deux pistes :
1. Northstar harness gère son propre browser → KERNEL utilisé en parallèle pour observabilité/replay (toujours valide pour le critère "track adherence")
2. Passer une URL CDP issue de KERNEL dans la requête Tzafon (champ à découvrir dans la doc)

Plan : tester (1) en premier (5 min), valider que ça marche, puis tenter (2) si temps. Si (2) ne marche pas en 10 min, rester sur (1).
