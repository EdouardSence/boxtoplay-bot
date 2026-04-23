# Project Onboarding — Version Éducative

## Pre-condition — MANDATORY CHECK

1. Read `.anvil/config.json`
2. If the file does not exist → **STOP.** Tell the user to run project initialization first.
3. If `"onboarded": true` → **STOP.** Do not execute this skill. Say: "Project already onboarded."
4. Otherwise → proceed to Préambule.

## Contraintes absolues (s'appliquent à TOUTES les phases)

- **NEVER** start coding or implementing features during onboarding
- **NEVER** create pull requests or make code changes
- **ONLY** create configuration files (`.anvil/`) and the project wiki (`.anvil/wiki/`)

Examples:
- WRONG: "I'll set up the project structure and create the initial files for you."
- WRONG: Creating source code files, modifying existing code, running build commands.
- RIGHT: Only creating files in `.anvil/wiki/` and modifying `.anvil/config.json`.

## Préambule

### Langue et ton
- **CRITICAL: All instructions in this document are written in English for precision, but you MUST communicate with the user in THEIR language (detected from their messages). Never respond to the user in English unless they write in English.**
- **Expliquer avant d'agir.** Avant chaque phase, explique à l'utilisateur ce qui va se passer et pourquoi. Ne fais jamais une action sans l'avoir annoncée.
- **Ne jamais supposer que l'utilisateur connaît les concepts IA.** Chaque terme technique (skill, hook, agent, recipe, MCP) doit être expliqué la première fois qu'il apparaît, en termes de bénéfice concret pour l'utilisateur.
- **Ton chaleureux, pédagogique, encourageant.** L'onboarding est un moment d'accueil. Sois patient, pose des questions, invite l'utilisateur à poser les siennes.

### Conventions de ce document — Templates
Les blocs ``` dans ce document sont des **modèles de message**. Tu dois les ADAPTER au contexte réel du projet. Les éléments entre `{{double_accolades}}` sont des placeholders à remplacer par les valeurs détectées. Ne reproduis JAMAIS les accolades ni le texte placeholder dans ta réponse. Les blocs sans placeholder sont des textes à adapter au ton et à la langue de l'utilisateur.

### Phase transitions — CRITICAL RULE
**After outputting each phase, STOP and wait for the user to respond.** Never generate the next phase in the same response. Each phase = one message. This rule applies to ALL phase transitions without exception.

### Progression par phase
After completing each phase, update `.anvil/config.json` with `"onboardingPhase": <phase_number>`. On resuming after interruption, read `onboardingPhase` from config and skip to that phase. Tell the user: "Si on est interrompu, pas d'inquiétude — je reprendrai exactement là où on s'est arrêtés."

### Accueil
Commence par un accueil chaleureux. Explique ce qu'est l'onboarding (adapt tone and language to the user):

```
Present a warm welcome that explains: (1) what onboarding is — "I'm learning about your project", (2) the 7 phases in a numbered list starting at 0: 0. **Marketplace équipe** (optionnel) — ajouter un marketplace interne ; 1. analyze ; 2. tools ; 3. components ; 4. documentation ; 5. configuration ; 6. finalize, (3) resumability after interruption, (4) invitation to ask questions. End with "On commence ?"
```

---

## Phase 0 : Marketplace équipe ou entreprise (optionnel)

Avant de démarrer l'onboarding, demande à l'utilisateur :

> 🏢 **Avant de commencer**
>
> Ton équipe ou ta boîte a-t-elle un marketplace Anvil avec des composants
> ou des prérequis spécifiques (sécurité, compliance, outils internes) ?
>
> - Si oui : donne-moi l'URL git ou le chemin local, je l'ajoute maintenant.
> - Si tu ne sais pas ou si c'est un projet perso : réponds "skip", on fait
>   l'onboarding standard.

Si l'utilisateur fournit une URL ou un chemin :
1. Exécute `anvil marketplace add <nom-lisible> --git <url>` (ou `--local <path>`
   si c'est un chemin).
2. Confirme le succès (vérifie l'exit code ; affiche un message si la sync
   initiale a échoué et propose de continuer sans).
3. Exécute `anvil marketplace sync <nom>` pour rapatrier le catalogue.

Puis passe à Phase 1. Les phases suivantes tiendront automatiquement compte
des composants du marketplace ajouté.

Si l'utilisateur répond "skip" ou ne fournit rien : passe directement à Phase 1.

---

## Phase 1 : Analyse du projet

### Explication préalable
Avant de commencer l'analyse, explique à l'utilisateur :

```
Explain to the user: you'll scan project files to detect language, framework, database, and ticket system. Use the "diagnostic" analogy — you look but don't touch. You'll present findings for confirmation.
```

### Scan Project Structure
Analyze the project files to detect. **Stop scanning once you've identified the primary stack** — do not exhaustively search for all possible technologies.

**Technology Stack:**
- Java: Look for `pom.xml`, `build.gradle`, `gradle.properties`
- Node.js: Look for `package.json`, `package-lock.json`, `yarn.lock`
- Python: Look for `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile`
- Flutter: Look for `pubspec.yaml`
- PHP: Look for `composer.json`
- .NET: Look for `*.csproj`, `*.sln`
- Rust: Look for `Cargo.toml`
- Go: Look for `go.mod`

**Framework Detection:**
- Spring Boot: Look for `@SpringBootApplication`, spring dependencies in config files
- React: Look for react dependencies in `package.json`
- Angular: Look for `@angular/` dependencies, `angular.json`
- Next.js: Look for `next` dependency, `next.config.js`
- Vue.js: Look for vue dependencies
- Django: Look for Django in requirements, `manage.py`
- Flask: Look for Flask in requirements
- Express: Look for express dependency

**Database Detection:**
- Look in `application.yml`, `application.properties`
- Check `docker-compose.yml` for database services
- Scan `.env` files for database URLs
- Check dependencies for database drivers (postgres, mysql, mongodb, etc.)

**Ticket Management:**
- Look for `.jira` file or Jira configurations
- Check for Linear configurations
- Check for Azure DevOps configurations
- **IMPORTANT**: Do NOT assume the ticket system from the bundle's `overrides`. Bundles provide defaults, not facts. Always detect from project files first.
- If detection finds clear evidence (e.g., `.jira` file, Jira URLs in configs), present it as a suggestion to confirm.
- If nothing is detected, **always ask the developer**: "What ticket management system do you use? (Jira / Linear / Azure DevOps / GitHub Issues / Other)"
- Only after the developer confirms should you set the override in the config.

**New Project Detection:**
- If NO config files are found (no `package.json`, no `pom.xml`, no `requirements.txt`, no framework files), this is a new project.
- An empty or near-empty directory with only a `.git` folder or a README qualifies as a new project.
- Store this detection in config: `"isNewProject": true` in `.anvil/config.json` so it persists across conversation turns.

### Present Findings — Conversational Style
Don't just list results. Explain what each detection implies for the user:

```
For each detection (language, framework, database, tickets), present:
- What was detected and in which file
- What it implies for the user (which tools/components it unlocks)
- End with: "Est-ce correct ? Ai-je raté quelque chose ?"
```

**If no config files were found (new project):**
```
🆕 **Projet nouveau détecté**

Je vois que votre projet est tout neuf — pas encore de fichiers de configuration ou de code. Pas de souci ! On va adapter les prochaines étapes :
- La vérification d'outils portera sur les outils généraux
- En Phase 4, je vous proposerai un brainstorming pour définir votre stack et architecture
- On pourra utiliser les skills de brainstorming pour concevoir votre projet ensemble

Pour l'instant, avez-vous déjà une idée de la stack que vous voulez utiliser ?
```

After user confirmation, update config: `"onboardingPhase": 1`

---

## Phase 2 : Vérification des outils

### Explication préalable
```
Explain: you'll check CLI tools (git, npm, etc.) and MCP connections (bridges to external tools like Jira, Slack). If something is missing, you'll explain what it does and help install it.
```

### Read Bundle Configuration
1. Read `.anvil/config.json` to get the configured bundle
2. Load the bundle YAML from the framework to see required tools and skills
3. For each skill/recipe in the bundle, check if required tools are available

### CLI Tools Check
Based on detected stack, verify these tools are available:
- `gh` (GitHub CLI) — Always required
- `git` — Always required
- `npm` or `yarn` — If Node.js detected
- `mvn` or `gradle` — If Java detected
- `pip` or `poetry` — If Python detected
- `flutter` — If Flutter detected
- `composer` — If PHP detected
- `dotnet` — If .NET detected
- `cargo` — If Rust detected
- `go` — If Go detected

### When a tool is missing — Conversational Guidance
When a tool is not found, do NOT just list it as missing. Engage a conversation:

```
For each missing tool: explain its purpose in one sentence, provide install commands per OS (Windows/macOS/Linux), and offer to guide. Wait for acknowledgment before the next tool.
```

Present missing tools one at a time, not as a batch list.

### MCP Tools Check — With Education
For each MCP tool referenced in the bundle:
- Check if the tool is available in your environment
- If available, confirm it
- If missing, first explain what MCP is (only the first time):

```
First time mentioning MCP: explain as "bridges between me and your external tools" with 2-3 examples (Jira, Slack, database). Mention they're optional but enriching.
```

Then for each missing MCP:
```
🔌 **{{mcp_name}} — non configuré**

Ce MCP me permettrait de {{explication_du_benefice_concret}}.
Voulez-vous qu'on le configure ensemble maintenant, ou préférez-vous le faire plus tard ?
```

### Override-dependent Tools Check
Based on what was confirmed in Phase 1, verify the tools needed for those choices:
- If **Jira** was confirmed → check that a Jira MCP is available (e.g., `jira-mcp`, Jira API token configured). If not, explain how to set it up.
- If **Linear** was confirmed → check that a Linear MCP is available. If not, explain how to set it up.
- If **Azure DevOps** was confirmed → check that an Azure DevOps MCP is available. If not, explain how to set it up.
- If a **database** was detected → check that any required database MCP or CLI client is available.
- **Do NOT skip this step.** The overrides confirmed in Phase 1 imply tool dependencies that must be verified here.

### Report Tool Status — Conversational
```
Present tool status grouped by: CLI Tools (✅/❌ with version), MCP Connections (✅/⚠️). Ask if questions before continuing.
```

### Extensions d'onboarding — prérequis

Après les vérifications standards ci-dessus, exécute :

```bash
anvil catalog skill --tag onboarding-extension --json
```

Pour chaque entrée dont le frontmatter YAML inclut `onboarding-phase: prerequisites`
(lis le fichier via son `path` dans le catalog), traite son contenu comme un
ensemble de prérequis additionnels à vérifier. Présente-les à l'utilisateur
regroupés par extension (utilise la `description` du catalog comme en-tête de
groupe), puis exécute les vérifications décrites dans le skill.

Si aucune extension ne matche cette phase, continue normalement.

After user confirmation, update config: `"onboardingPhase": 2`

---

## Phase 3 : Recommandation de composants

### Explication préalable
```
🎯 **Phase 3 — Composants recommandés**

Avant de vous montrer les recommandations, laissez-moi vous expliquer ce que sont les "composants". Ce sont des modules que vous pouvez m'ajouter pour enrichir mes capacités.

Pensez à moi comme un développeur que vous formez pour votre équipe. Les composants, ce sont les formations, les checklists, les procédures et les accès que vous me donnez pour être efficace.

Je vais vous présenter ça en deux temps pour ne pas vous submerger.
```

### Mandatory catalog query — source unique de vérité

**Before presenting ANY recommendation, you MUST execute:**

```bash
anvil catalog --json
```

**The response is the ONLY source of truth for this phase.** Parse it as `{ ok: true, data: [...] }`. Each item in `data` has at minimum:
- `type`: `"skill" | "hook" | "agent" | "recipe"` (plus others you ignore for this phase)
- `name`: the component identifier
- `marketplace`: which marketplace it came from
- `description`: a short human-readable summary

**Absolute rules:**
- If a component is NOT in the `data` array, you do NOT mention it — not as a recommendation, not as an example, not at all.
- You do NOT invent descriptions. You use the `description` field verbatim (translated to the user's language if needed, but not reworded for "marketing").
- You do NOT add tags, badges, or "essential" markers that are not present in the catalog item itself.

**If the command fails (non-zero exit) or `data` is an empty array:**

```
Aucun composant n'est visible dans les marketplaces configurés actuellement.

Tu peux :
1. **Ajouter un marketplace** avec `anvil marketplace add <nom> --git <url>` puis relancer cette phase
2. **Passer l'installation** et y revenir plus tard — tu pourras toujours me demander de parcourir le marketplace à n'importe quel moment

Que préfères-tu ?
```

Then either wait for a marketplace to be added and re-run the query, or skip to Phase 4. Do NOT fabricate recommendations in this situation.

### Section éducative — Palier 1 : Les basiques
**Always present this section FIRST. This is mandatory.**

Educational preamble (catalog-independent — keep verbatim in the user's language):

```
Explain two basic component types:
- **Skill**: a practice guide I follow (like an internal wiki). A skill influences HOW I work. (Example shown for illustration only, not a prescription: a coding-principles skill would make me systematic about DRY/KISS/SOLID.)
- **Hook**: an automatic check at key moments (like a git hook). A hook verifies THE RESULT. (Example for illustration only: a pre-commit-check hook would catch secrets and broken tests before each commit.)
- **Key difference**: a skill guides behaviour, a hook validates output.
```

**Then — and only then — present the real Palier 1 items derived from the catalog response.**

Rendering rules for Palier 1:
1. Filter `data` to items where `type === 'skill' || type === 'hook'`.
2. Group by type: skills first, hooks second.
3. For each group, render each item on its own line using:
   `📦 <name> — <description>`
   Prefix the skills group with `🧠 Skills disponibles :` and the hooks group with `🪝 Hooks disponibles :`.
4. If a group is empty (no skills OR no hooks in the catalog), omit that group's heading entirely — do not pretend items exist.
5. Do NOT split into "essential" / "supplémentaires" sub-sections. The catalog schema does not carry an `essential` marker, so any such split would be fabrication. Present a flat list and let the user choose.
6. If the catalog entry carries a `marketplace` other than `official`, append `  _(marketplace: <name>)_` on the same line so the user knows the origin.

Close the Palier 1 message with:
```
Des questions sur ces composants avant qu'on passe à la suite ?
```

### Section éducative — Palier 2 : Les composants avancés
**Present this section only AFTER the user has acknowledged Palier 1.**

Educational preamble (catalog-independent):

```
Explain advanced component types:
- **Agent**: a specialized expert hat I can wear. (Example for illustration only: an architect agent would analyze patterns; a security-auditor would run OWASP checks.)
- **Recipe**: a full end-to-end workflow with validation checkpoints. (Example for illustration only: a us-to-pr recipe would go from ticket to PR step by step.)
- **Tool**: concrete access I'm given (GitHub, terminal, web). Without tools I can only talk, with them I act.
- **Bundle**: your current starter kit — a pre-configured set of components.
- **Key difference**: skill = continuous guidance, recipe = one-time procedure for a specific task.
```

**Then — and only then — present the real Palier 2 items derived from the catalog response.**

Rendering rules for Palier 2 (same discipline as Palier 1):
1. Filter `data` to items where `type === 'agent' || type === 'recipe'`.
2. Group by type: agents first, recipes second.
3. Render each item as `📦 <name> — <description>`. Prefix agents with `🤖 Agents disponibles :` and recipes with `📋 Recipes disponibles :`.
4. Omit empty groups. Do not invent items.
5. Append the marketplace origin when it is not `official`.
6. Do NOT present items of type `tool` here — tools are wired up by adapters, not chosen à la carte during onboarding.

### Choix d'installation

Once both paliers are presented, offer these options (no "essential" default because the catalog does not mark essentials):

```
Explain options:
- **"install all"** — install every component shown above (both paliers)
- **"install palier 1"** — only skills and hooks
- **<component name(s)>** — pick specific ones, any mix across both paliers
- **"browse"** — drill into a single item for more details before deciding
- **"skip"** — install nothing for now; you can always come back later
Remind the user that everything is uninstallable.
```

### Extensions d'onboarding — recommandations composants

Exécute `anvil catalog skill --tag onboarding-extension --json` et, pour
chaque entrée avec `onboarding-phase: components` dans son frontmatter, lis le
skill et intègre ses recommandations de composants à la liste présentée à
l'utilisateur (annote-les clairement comme "Recommandé par <description de
l'extension>" pour que le dev sache d'où ça vient).

Les recommandations d'extension ne **remplacent** pas la liste standard — elles
la complètent, avec une annotation visible de leur source.

### Interactive Selection Process

1. **Let the developer choose** which components to install (skills, recipes, hooks, agents)
2. For each selected component:
   - Use the `catalog-browser` skill to install. If `catalog-browser` is not available, read component files directly from the framework directory structure and manually add them to config.
   - Add to `.anvil/config.json` in appropriate section with `source: "framework"` and calculated hash
   - Provide brief description of what the component provides
3. **Handle overrides** correctly:
   - If a component with overrides is selected (e.g., `read-ticket`), use the override determined in Phase 1 (the ticket system the developer confirmed).
   - Store override in config: `"overrides": { "read-ticket": "jira" }`
4. **Smart recommendations** based on selections:
   - If `implement-feature` skill is selected, suggest `development/us-to-pr` recipe
   - If ticket system is Jira, suggest `jira-sync` hook
   - If team collaboration is detected, suggest `slack-notify` hook
5. **Regenerate agent files:** After all selections, run the catalog-browser's regeneration flow to update the agent's active configuration files from the installed components. If catalog-browser is unavailable, manually copy component files to the agent directory.
6. **Confirm installation summary**

### Installation Summary

```
✅ **Installation terminée !**

Voici ce qui a été installé :

**🧠 Skills :** {{liste_des_skills_installes}}
**📋 Recipes :** {{liste_des_recipes_installees}}
**🤖 Agents :** {{liste_des_agents_installes}}
**🪝 Hooks :** {{liste_des_hooks_installes}}

**Tout est désinstallable.** Si un composant vous gêne ou ne vous convient pas, demandez-moi de le retirer.

**Où vivent ces fichiers ?**
Voici la structure de votre dossier `.anvil/` :
```
.anvil/
  config.json    — La configuration principale (stack, composants, overrides)
  wiki/          — Le wiki du projet (cartographie, getting started, architecture — que j'utilise à chaque interaction)
  skills/        — Les skills installés (fichiers texte lisibles et modifiables)
  hooks/         — Les hooks actifs
```
Vous pouvez ouvrir et lire n'importe lequel de ces fichiers — ce sont des fichiers texte, pas de la magie !

Prochaine étape : Documentation du projet
```

### Skip Option

If developer chooses to skip:
```
⏭️ **Sélection de composants ignorée**

Pas de souci ! Vous pourrez installer des composants à tout moment :
- Demandez-moi de "parcourir le marketplace" ou "montrer les composants disponibles"
- J'utiliserai le catalogue pour vous présenter les options
- Et tout est désinstallable, donc aucun risque à essayer.

Prochaine étape : Documentation du projet
```

**Important:** This phase should integrate seamlessly with the catalog-browser skill. Use the same installation mechanisms and configuration patterns for all component types (skills, recipes, hooks, agents).

After user confirmation, update config: `"onboardingPhase": 3`

---

## Phase 4 : Génération du wiki documentaire

### Explication préalable
```
Explain: you'll build a complete project knowledge base in .anvil/wiki/ — a navigable wiki with architecture, stack, conventions, operations, and known issues. The wiki is what every future AI session will read. Quality here determines everything downstream. Use the medical analogy: this is the diagnosis report shared with all future doctors.
```

### Pre-condition — Bundle check

Before doing anything in this phase, **check whether the bundle `legacy-archaeology` is installed AND whether the required components are even available to install**.

The bundle ships more components, but this phase only needs these four pipeline-critical ones:
- `legacy-cartographer` (agent)
- `analyze-codebase-deep` (skill)
- `generate-project-wiki` (skill)
- `generate-runnable-readme` (skill)

#### Step 1 — Check if already installed

Read `.anvil/config.json` and inspect `components.skills` and `components.agents`. The bundle is considered **installed** for this phase's purposes if all four component names above are present (extra bundle components don't block the pipeline).

If installed → **Path A** (skip directly to "Pipeline execution" below).

#### Step 2 — If not installed, check availability in the configured marketplaces

Run:

```bash
anvil catalog --json
```

Parse the `data` array and determine which of the four required names are present (match on `name` with the expected `type`). Compute the `missing` set = required minus present.

- If `missing` is empty → **Path B** (everything is available, propose installation).
- If `missing` is non-empty → **Path B-prime** (bundle not reachable from configured marketplaces).

#### Path A — Bundle installed → run the pipeline

Proceed directly to "Pipeline execution" below.

#### Path B — Bundle available in the catalog but not installed → propose installation

```
📚 **Phase 4 — Génération du wiki documentaire**

Pour cette phase, j'ai besoin du bundle `legacy-archaeology` qui contient les composants spécialisés pour analyser ton legacy en profondeur et produire un wiki structuré :

- 🤖 **legacy-cartographer** (agent) — explore ta codebase et produit une cartographie sourcée
- 🧠 **analyze-codebase-deep** (skill) — méthode d'analyse en 4 couches, optimisée coût IA
- 🧠 **generate-project-wiki** (skill) — transforme la cartographie en wiki navigable, validé page par page
- 🧠 **generate-runnable-readme** (skill) — produit un README "clone, install, run" testé avec toi

Sans ces composants, je ne peux pas générer un wiki digne de ce nom — et un wiki bâclé serait pire que pas de wiki.

Trois choix :

1. **Oui, installe-les maintenant** → j'installe les composants un par un et on enchaîne sur la génération du wiki
2. **Non, plus tard** → on saute cette phase et on passe à la suite. Tu pourras lancer la génération quand tu veux en me disant "génère le wiki"
3. **Non, jamais** → on saute cette phase et je ne te reparlerai pas du wiki

Que préfères-tu ?
```

**If user says yes (option 1):**

Install the components one by one using the existing CLI (the CLI does NOT yet support `anvil install bundle`):

```bash
anvil install agent legacy-cartographer
anvil install skill analyze-codebase-deep
anvil install skill generate-project-wiki
anvil install skill generate-runnable-readme
```

After each install, confirm success. If any install fails, stop and report the error to the user. Do not proceed to the pipeline with partial installation.

Then proceed to "Pipeline execution" below.

**If user says option 2 or 3:**

Skip directly to Phase 5. Set `"onboardingPhase": 4` in config without generating any wiki content. The `.anvil/wiki/` directory remains empty.

If option 3, also set `"wikiOptOut": true` in `.anvil/config.json` so future sessions know not to suggest the wiki again.

#### Path B-prime — Bundle NOT available in any configured marketplace

Do **NOT** propose `anvil install` for missing components — it will fail and frustrate the user. Instead, be transparent about the situation.

First, gather context to present it honestly:

```bash
anvil marketplace list --json
```

Then present:

```
📚 **Phase 4 — Génération du wiki documentaire**

Le bundle `legacy-archaeology` n'est pas disponible dans les marketplaces que tu as configurés.

**Composants manquants :** {{liste_des_noms_manquants}}
**Marketplaces configurés :** {{liste_depuis_anvil_marketplace_list}}

Trois options :

1. **Ajouter le marketplace qui contient ce bundle** — je peux t'aider avec `anvil marketplace add <nom> --git <url>` si tu connais l'URL, puis on relance la vérification
2. **Passer cette phase sans wiki pour l'instant** — tu pourras toujours lancer la génération plus tard quand le bundle sera disponible (je te réexpliquerai la commande en Phase 6)
3. **Ne plus en parler** — je marque `wikiOptOut: true` dans la config et on n'y revient plus

Que préfères-tu ?
```

**If user chooses option 1 (add a marketplace):**

1. Ask for the marketplace name and Git URL (and optionally ref/branch).
2. Run `anvil marketplace add <name> --git <url>`. If it fails, report the error and return to the three-option choice.
3. On success, re-run `anvil catalog --json` and recompute `missing`.
4. If `missing` is now empty → fall into **Path B** (propose installation).
5. If `missing` is still non-empty → tell the user which components are still absent and re-present the three options.

**If user chooses option 2 (skip for now):**

Skip directly to Phase 5. Set `"onboardingPhase": 4` in config. The `.anvil/wiki/` directory remains empty. Do NOT set `wikiOptOut` — the user may come back to it.

**If user chooses option 3 (never):**

Skip directly to Phase 5. Set `"onboardingPhase": 4` and `"wikiOptOut": true` in `.anvil/config.json`.

### New Project Workflow

**If `isNewProject` is true in `.anvil/config.json`:**

The legacy archaeology pipeline does NOT apply — there is no code to analyze. Use the existing brainstorming flow instead:

```
🆕 **Projet nouveau — Brainstorming de départ**

Votre projet est nouveau, donc il n'y a pas encore de code à cartographier. Pas de problème — on va construire la documentation à partir d'une conversation.

Parlons de votre projet :
- **Quel type d'application** voulez-vous créer ? (web app, API, mobile, CLI, etc.)
- **Quelle stack** avez-vous en tête ? (ou voulez-vous des recommandations ?)
- **Qui sont les utilisateurs** ? (développeurs, clients, interne, public)
- **Quelles sont les fonctionnalités principales** ?

💡 Si vous avez un skill de brainstorming installé, je peux l'utiliser pour structurer cette réflexion. Sinon, on fait simple en dialogue libre.

À partir de vos réponses, je créerai une première version de `.anvil/wiki/` qui servira de fondation pour votre projet.
```

Then create a minimal `.anvil/wiki/index.md` from the conversation, without the full pipeline. Skip directly to Phase 5 after user confirmation.

### Pipeline execution (only when bundle is installed and project is not new)

Execute the components in this exact order. Each step is a delegation to a specialized component — do not improvise.

**Step 1 — Cartography**

Invoke the `legacy-cartographer` agent. It will read the `analyze-codebase-deep` skill, run the 4-layer method, and produce `.anvil/wiki/.cartography.yaml`.

Wait for it to complete. Read the warnings section of the YAML. If any warnings are critical (e.g. "shallow clone"), surface them to the user before proceeding.

**Step 2 — Wiki generation**

Invoke the `generate-project-wiki` skill. Pass through whatever review mode the user prefers — the skill itself will ask:

```
Pour la génération du wiki, deux modes :

📋 **Détaillé** — On fait une page à la fois. Je te montre chaque brouillon, tu valides, on corrige. C'est plus long mais c'est ton wiki, autant qu'il te ressemble. (Recommandé pour la première génération)

⚡ **Rapide** — Je génère tout d'un coup, tu parcours, on corrige ce qui ne va pas.

Quel mode préfères-tu ?
```

The skill will then create the full `.anvil/wiki/` structure with numbered sections (01-getting-started through 08-known-issues), validating page by page in detailed mode or in batch in quick mode.

**Step 3 — Runnable README**

Invoke the `generate-runnable-readme` skill. It will produce `.anvil/wiki/01-getting-started/README.md`, mentally testing each command with the user.

This is the most interactive part — expect 5-10 minutes of back-and-forth where the user confirms commands, prerequisites, and known errors.

**Step 4 — Final wiki review**

After all three components have run, present a summary:

```
📚 **Wiki généré**

Voici ce qui a été créé dans `.anvil/wiki/` :

- 📂 **index.md** — Portail d'entrée du wiki
- 📂 **01-getting-started/** — README runnable validé avec toi
- 📂 **02-architecture/** — {{nb}} pages sur l'architecture
- 📂 **03-stack/** — Langages, frameworks, dépendances
- 📂 **06-conventions/** — Conventions de code détectées
- 📂 **07-operations/** — Build, deploy, environnements
- 📂 **08-known-issues/** — {{nb}} marqueurs de dette technique trouvés

**À noter :**
- Les sections `04-features/` et `05-domain/` sont vides pour l'instant — elles seront enrichies en vague 2 du design (feature-inventory et domain-extractor)
- Le fichier `.cartography.yaml` est la source structurée — ne le modifie pas à la main, il sert pour les rafraîchissements futurs

**Cette doc est maintenant ma référence canonique pour tout travail futur sur ce projet.** Tous les agents IA qui interviendront sur ce repo liront le wiki avant d'agir.

Une dernière revue avant qu'on passe à la suite ? Y a-t-il une page que tu veux corriger ou compléter ?
```

**CRITICAL: Do NOT rush through this phase. The quality of the wiki directly determines the quality of every future agent interaction with this project.**

After user confirmation, update config: `"onboardingPhase": 4`

---

## Phase 5 : Personnalisation de la configuration

### Condition d'exécution
**Skip this phase if ALL of these are true:**
- No ticket management system was confirmed in Phase 1
- No database-specific override is needed
- No technology-specific overrides were identified

If skipping:
```
⏭️ Pas de personnalisation nécessaire — on passe directement à la finalisation.
```

Then jump directly to Phase 6.

### Explication préalable (if overrides are needed)
```
⚙️ **Phase 5 — Personnalisation de la configuration**

Les "overrides" (ou personnalisations), ce sont des réglages qui adaptent le comportement de certains composants à votre projet spécifique. Par exemple, si vous utilisez Jira, je dois le savoir pour adapter la lecture des tickets.

Voici ce que je propose de configurer :
```

### Analyze and Propose Overrides
Based on your detections, propose appropriate overrides for `.anvil/config.json`:

**Ticket Management Override:**
- Only set this override based on what the developer **confirmed** in Phase 1.
- Do NOT inherit overrides from the bundle defaults — those are generic suggestions, not project-specific configuration.
- If Jira confirmed: `"overrides": { "read-ticket": "jira" }`
- If Linear confirmed: `"overrides": { "read-ticket": "linear" }`
- If Azure DevOps confirmed: `"overrides": { "read-ticket": "azure-devops" }`
- If GitHub Issues: no override needed (default behavior)

**Technology-specific Overrides:**
- Add any stack-specific configurations based on what you detected

### Update Configuration
Show the developer what overrides you want to add, explaining each one:

```
⚙️ **Personnalisations proposées**

Je vais ajouter ces réglages à `.anvil/config.json` :

{
  "overrides": {
    "read-ticket": "{{systeme_confirme}}"
  }
}

Concrètement, ça signifie :
- **read-ticket: {{systeme}}** → quand je lis un ticket, j'utiliserai le format et l'API de {{systeme}} au lieu du format par défaut.

On procède ? (oui/non)
```

After user confirmation, update config: `"onboardingPhase": 5`

---

## Phase 6 : Conclusion et guide de démarrage

### Mark Onboarding Complete
Update `.anvil/config.json` with:
```json
{
  "onboarded": true,
  "onboardedAt": "[ISO-8601 timestamp]"
}
```
Remove `onboardingPhase` and `isNewProject` from config (no longer needed).

### Summary Report

```
🎉 **Onboarding terminé !**

**Configuration du projet :**
- Stack : {{stack_detectee}}
- Bundle : {{nom_du_bundle}}
- Documentation : {{X}} fichiers créés
- Personnalisations : {{liste_des_overrides_appliques}}
- Composants installés : {{nombre_total}}

**Ce qui est prêt :**
- ✅ Configuration de l'agent
- ✅ Documentation du projet
- ✅ Outils vérifiés
- ✅ Composants installés

**Actions manuelles restantes :**
- [ ] {{liste_des_outils_a_installer_ou_configurer_manuellement}}
```

### Getting Started — Adapted to Installed Components

**Present a "Getting Started" section tailored to what was actually installed. If nothing was installed (user chose "skip" in Phase 3), present only the marketplace/help section.**

```
For each installed component, provide ONE concrete trigger phrase the user can use. Examples:
- implement-feature: "Tell me 'implement feature X' or give me a ticket link"
- us-to-pr: "Give me a ticket number like 'PROJ-123'"
- code-reviewer: "Ask me 'review my code' after implementing"
- bugfix: "Describe a bug or give me a bug ticket"
- architect: "Ask 'analyze the architecture' for patterns and trade-offs"

Always end with: how to browse the marketplace, and an invitation to ask any question.
```

### Workflow quotidien — Vision concrète
```
📅 **À quoi ressemble une journée typique avec moi ?**

1. Vous ouvrez un ticket ou identifiez un besoin
2. Vous me le décrivez — j'analyse le besoin et propose un plan
3. On implémente ensemble, étape par étape, avec des validations
4. Les hooks vérifient automatiquement la qualité avant chaque commit
5. Je crée la PR avec la bonne description et les bons labels

Bien sûr, vous pouvez aussi me poser des questions ponctuelles, me demander d'expliquer du code, de refactorer, de débugger... Je m'adapte à votre besoin du moment.
```

### Quick Win — Exercice pratique
```
🎓 **Essayons ensemble !**

L'onboarding est terminé. Avant de se quitter, voulez-vous faire un petit essai pour voir comment ça fonctionne en pratique ?

Quelques idées :
- Donnez-moi un fichier de votre projet et demandez-moi de l'expliquer
- Posez-moi une question sur votre architecture
- Décrivez une petite tâche à faire

Ça ne prendra qu'une minute et vous verrez concrètement comment on travaille ensemble. Sinon, on peut s'arrêter là — vous savez où me trouver !
```
