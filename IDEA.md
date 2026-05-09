
---

## Le concept reformulé

**"Un CRM qui se construit et se qualifie tout seul."**

L'utilisateur décrit sa boîte → l'agent construit l'ICP → l'agent va chercher et enrichit les prospects sur N réseaux → l'agent les qualifie par signal d'intérêt → l'agent rédige le contact personnalisé. Tout est stocké dans une BDD MongoDB et visualisé dans une webapp CRM.

C'est un meilleur angle parce que :
- Le jury voit un produit fini (webapp + BDD), pas juste un script
- Le CUA est utilisé là où il brille (navigation/lecture multi-sources)
- C'est démontrable en live avec un cas concret

---

## Architecture en 4 étapes

### Étape 1 — Définition de l'ICP (LLM seul, pas de CUA)

**Input utilisateur :**
- Description libre de la boîte ("on fait un SaaS RH pour PME industrielles")
- Optionnel : 1 à 3 liens de profils LinkedIn de "clients idéaux" comme exemples

**Ce que fait l'agent :**
- Un LLM (Claude via API) reformule, précise, et enrichit la description
- Si liens LinkedIn fournis → l'agent CUA les visite, extrait les patterns communs (rôle, taille boîte, secteur, séniorité, signaux)
- Output : un **ICP structuré** stocké en BDD

```json
{
  "company_pitch": "SaaS RH pour PME industrielles 50-500 employés",
  "icp": {
    "roles": ["DRH", "COO", "Directeur des opérations"],
    "industries": ["manufacturing", "agroalimentaire", "métallurgie"],
    "company_size": "50-500",
    "geography": "France, Belgique",
    "buying_signals": ["levée de fonds", "expansion multi-sites", "post sur recrutement difficile"]
  }
}
```

---

### Étape 2 — Configuration des sources (paramètres app)

L'utilisateur active les sources qu'il veut. Voici une liste élargie — toi tu en avais 4, je t'en ajoute pour montrer au jury que c'est extensible :

**Sources sociales (signaux comportementaux)**
- LinkedIn (profils + posts + commentaires)
- X / Twitter (posts + likes + replies)
- Facebook (pages entreprise principalement)
- Instagram (pour les boîtes B2C ou créateurs)
- TikTok (pour les boîtes qui ciblent des jeunes fondateurs)
- Reddit (subreddits pro, r/SaaS, r/startups, r/sales — signaux de douleur explicites)
- Bluesky / Threads (early adopters tech)

**Sources presse / business intelligence**
- TechCrunch, Sifted, Maddyness (levées de fonds)
- Crunchbase (financements, équipes)
- Pappers (déjà dans tes outils MCP — données légales entreprises FR)
- Google News (mentions presse)
- Product Hunt (lancements de produits)

**Sources techniques / signaux d'intent**
- GitHub (activité dev, stack technique)
- Stack Overflow (questions = problèmes)
- Job boards (Welcome to the Jungle, LinkedIn Jobs, Indeed) — les offres d'emploi sont des **signaux d'intent énormes** : si une boîte recrute 5 sales, elle scale ; si elle recrute un DRH, elle restructure
- Site web de l'entreprise (about, blog, careers)

**Sources événementielles**
- Sites de conférences / meetups (intervenants)
- YouTube (interviews de fondateurs)
- Podcasts (transcripts via Listen Notes)

**Mon conseil pour la démo** : tu actives 3-4 sources max (LinkedIn + Twitter + site web + job boards) sinon tu fragilises ta démo.

---

### Étape 3 — Découverte + Enrichissement (le cœur CUA)

**3a. Découverte des prospects**

L'agent CUA fait des recherches multi-sources :
- Google Search avec requêtes générées dynamiquement par le LLM à partir de l'ICP
- LinkedIn Sales Navigator search (si dispo) ou recherche LinkedIn classique
- Twitter Advanced Search

→ Il identifie 10-20 prospects bruts (nom + boîte + URL).

**3b. Enrichissement parallèle**

Pour chaque prospect, l'agent visite **toutes les sources activées** et compile une fiche complète :

```json
{
  "prospect_id": "...",
  "name": "Sarah Chen",
  "company": "FlowHR",
  "role": "CEO",
  "sources_visited": {
    "linkedin": { "bio": "...", "last_3_posts": [...], "last_activity_date": "..." },
    "twitter": { "bio": "...", "last_5_tweets": [...] },
    "company_website": { "about": "...", "team_size_estimate": "...", "tech_stack": [...] },
    "job_boards": { "open_positions": [...] },
    "press": [{ "source": "TechCrunch", "date": "...", "title": "..." }]
  },
  "enrichment_status": "completed",
  "enriched_at": "..."
}
```

**Astuce technique importante** : c'est ici que le CUA prend du temps (1 à 3 minutes par prospect en navigation réelle). Pour la démo :
- Lance l'enrichissement de 2-3 prospects en parallèle (KERNEL le permet)
- Affiche les fiches qui se remplissent en streaming dans la webapp ("LinkedIn ✅ Twitter ⏳ Site web ⏳")
- C'est **le moment théâtral de la démo** — le jury voit le CRM se peupler tout seul

---

### Étape 4 — Qualification par signal d'intérêt (LLM)

Une fois les fiches enrichies, un LLM (Claude API) score chaque prospect.

**Système de scoring :**
```
Fit ICP (0-40 points) : rôle, taille boîte, secteur
Signal chaud (0-40 points) : levée de fonds récente, post sur le problème, recrutement actif
Joignabilité (0-20 points) : activité récente, présence multi-canaux
```

Chaque prospect reçoit :
- Un **score 0-100**
- Un **"why this lead"** (1-2 phrases en langage naturel)
- Un **tag** : 🔥 Hot / 🟠 Warm / ⚪ Cold

Affichage dans la webapp : un dashboard CRM trié par score.

---

### Étape 5 — Génération du contact (LLM)

Pour les prospects qualifiés Hot ou Warm, l'utilisateur clique "Générer le contact".

**Le LLM compose** :
- Un objet d'email accrocheur
- Un body en framework AIDA
- Citation **explicite** d'un élément trouvé pendant l'enrichissement (un post, un signal, une offre d'emploi)
- Suggestion du meilleur canal (email, DM LinkedIn, reply à un tweet)

Stocké dans MongoDB, modifiable dans la webapp.

---

## Architecture technique

```
┌─ Webapp (React) ──────────────────────────┐
│  • Onboarding ICP                          │
│  • Settings (sources)                      │
│  • CRM dashboard (liste prospects + score) │
│  • Détail prospect (fiche + draft mail)    │
└────────────┬──────────────────────────────┘
             │ REST/WebSocket
┌────────────▼──────────────────────────────┐
│  Backend (Node.js ou FastAPI)              │
│  • Job queue (BullMQ ou Celery)            │
│  • Orchestrateur d'agents                  │
└─────┬──────────────┬──────────────┬───────┘
      │              │              │
   ┌──▼───┐     ┌────▼────┐    ┌────▼────┐
   │Mongo │     │ KERNEL  │    │ Claude  │
   │ DB   │     │+Northstar│    │  API    │
   └──────┘     │ (CUA)   │    │ (LLM)   │
                └─────────┘    └─────────┘
```

**Découpage des responsabilités** :
- **CUA (KERNEL + Northstar)** = navigation, lecture, extraction. Tout ce qui demande de "voir" une page.
- **LLM (Claude API)** = raisonnement, ICP, scoring, rédaction. Tout ce qui demande de "penser".
- **MongoDB** = stockage des ICP, prospects, fiches enrichies, drafts.

C'est important pour le jury : **tu n'utilises pas le CUA là où une API suffit**. Ça montre que tu comprends quand chaque outil est pertinent.

---

## Ce qui colle avec les consignes du hackathon

| Critère jury | Comment on coche la case |
|---|---|
| Adhérence au track CUA Apps | KERNEL pour browser infra ✅ Northstar pour le modèle CUA ✅ |
| Impact | CRM auto-enrichi = problème réel à 50 milliards de dollars (le marché du sales tooling) |
| Nouveauté technique | Multi-sources orchestrées + scoring contextuel par LLM, pas juste un scraper |
| Présentation | Webapp visible + dashboard qui se remplit en live = effet wow |
| Open source | Tu pousses sur GitHub avec un README clair |

---

## Risques à anticiper

1. **LinkedIn login wall** — prévois un compte de démo dédié, ou skip LinkedIn pendant la démo et utilise les autres sources
2. **Latence CUA** — fais tourner l'enrichissement de 2-3 prospects **avant** la démo et présente-les comme "live" si tu manques de temps. Ou pré-charge la BDD avec un cas qui s'est déjà run.
3. **Coût Northstar** — 2500$ de crédits c'est large mais surveille la consommation, chaque session CUA brûle vite
4. **Scope creep** — tu listes 10 sources, tu en implémentes 3 pour la démo, tu mentionnes les autres comme "extensible"

---
