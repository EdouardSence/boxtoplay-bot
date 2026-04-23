# Component Marketplace — Browse & Install

**HARD GATE**: This skill ONLY manages component installation (skills, recipes, hooks). Do NOT code, modify source files, or implement features. Only read configs, copy component files, and update `.agent/config.json`.

This skill provides a marketplace-like interface for browsing and installing skills, recipes, and hooks from the Agentic Forge catalog. All three component types follow the same unified tracking pattern with SHA-256 hashes and local modification detection.

## Core Functions

### 1. Browse Available Components

**Command trigger**: When user asks to "browse skills", "see available skills", "marketplace", or similar.

**Process:**
1. Read `catalog.yaml` from the framework root
2. Read `.agent/config.json` from the current project
3. Compare to identify installed vs available components
4. Present a marketplace view:

```
🏪 **Agentic Forge — Skills Marketplace**

**Installed Skills:**
✅ coding-principles — Core coding principles
✅ testing-tdd — Test-driven development guidance
✅ onboarding — Project setup and configuration

**Available Skills:**
📦 security-review — Security review checklist for PRs
📦 implement-feature — Feature implementation workflow
📦 create-pr — PR creation guidance and templates

**Available Recipes:**
📦 development/us-to-pr — Issue to PR workflow (with checkpoints)
📦 development/bugfix — Bugfix workflow
📦 review/pr-review — PR review workflow

**Available Hooks:**
📦 jira-sync — Sync workflow output to Jira
📦 slack-notify — Send Slack notification

Type the name of any component to install it, or ask me about a specific one.
```

### 2. Install Components

**Command trigger**: When user provides a skill/recipe/hook name to install.

**Process:**
1. Validate the component exists in `catalog.yaml`
2. Check if already installed
3. For all component types (skills, recipes, hooks):
   - Calculate SHA-256 hash of the source content
   - Add entry to `.agent/config.json` in the appropriate section with:
     ```json
     "component-name": {
       "source": "framework",
       "originalHash": "calculated-hash"
     }
     ```
4. Run `anvil generate --agent <current-agent>` to regenerate output files with hash tracking
5. Confirm installation

**Example dialog:**
```
User: security-review
Assistant: 📦 Installing skill: security-review

✅ Added security-review to .agent/config.json (source: framework)
✅ Calculated hash: a1b2c3d4e5f6...
✅ Generated agent files
🎉 security-review is now available!

You can now use the security review guidance in your development workflow.
```

### 3. Uninstall Components

**Command trigger**: When user asks to "remove", "uninstall", or "delete" a component.

**Process:**
1. Confirm the component is currently installed
2. Ask for confirmation: "Remove [component-name]? This will delete the local files. (y/n)"
3. Remove from `.agent/config.json`
4. Delete the generated files
5. Run `anvil generate` to clean up
6. Confirm removal

### 4. Component Information

**Command trigger**: When user asks "about [component]" or "what does [component] do?"

**Process:**
1. Look up component in `catalog.yaml`
2. Read the actual skill/recipe/hook file
3. Extract description and key features
4. Show preview of what it provides

## Component Types Handling

### Skills
- **Location**: `skills/[name].md` in framework
- **Config entry**: In `skills` object with `source: "framework"` and `originalHash`
- **Output**: Generated to agent-specific structure (e.g., `.github/instructions/` for Copilot, `.claude/skills/` for Claude)

### Skills with Overrides
- **Example**: `read-ticket` has base + jira/linear/azure-devops overrides
- **Installation**: Ask user which override they want, or default to base
- **Config**: Store override choice in `overrides` section

### Recipes
- **Location**: `recipes/[category]/[name].md` in framework
- **Config entry**: In `recipes` object with `source: "framework"` and `originalHash` (unified pattern)
- **Output**: Generated to agent-specific prompts/workflows with hash tracking
  - **Copilot**: `.github/prompts/[name].prompt.md`
  - **Claude**: `.claude/recipes/[name].md`
  - **Cursor**: `.cursor/rules/[name]-recipe.mdc`
  - **GH-AW**: `.github/workflows/[name].md`

### Hooks
- **Location**: `hooks/[name].md` in framework  
- **Config entry**: In `hooks` object with `source: "framework"` and `originalHash` (unified pattern)
- **Output**: Generated to agent-specific hook files with hash tracking
  - **Copilot**: `.github/instructions/[name]-hook.md`
  - **Claude**: `.claude/hooks/[name].md`
  - **Cursor**: `.cursor/rules/[name]-hook.mdc`
  - **GH-AW**: `shared/hooks/[name].md`

## Error Handling

- **Component not found**: "❌ '[component]' not found in catalog. Type 'browse' to see available options."
- **Already installed**: "ℹ️ '[component]' is already installed. Use 'update' command to check for newer versions."
- **Installation failure**: Provide specific error and suggest fixes
- **Permission issues**: Guide user to check file permissions

## Integration Points

This skill works with:
- **catalog-browser**: This skill IS the catalog browser
- **update-skills**: Complementary skill for updating existing components  
- **onboarding**: Phase 2.5 skill selection uses this marketplace
- **anvil generate**: Called after installations to regenerate files

## Safety Guards

- **Never modify source code** — only config files and skill files
- **Always calculate hashes** for framework components
- **Always regenerate** after config changes
- **Validate components exist** before installation
- **Confirm destructive actions** (uninstalls)

## CLI Integration

This skill can leverage the CLI commands:
- `anvil list` — to verify catalog consistency
- `anvil generate --agent <agent>` — to regenerate after changes
- Framework paths and bundle loading — to access catalog.yaml

The skill should understand the project's current agent type from `.agent/config.json` and generate for the correct platform.
