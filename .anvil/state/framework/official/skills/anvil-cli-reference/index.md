---
---

# Anvil CLI Reference

This project is managed by **anvil** — a CLI that installs, projects, and maintains AI agent components (skills, recipes, hooks, agents) in each agent's native format.

**IMPORTANT**: Never edit surface files directly (`.github/instructions/`, `.github/agents/`, `.claude/skills/`, `.claude/agents/`, `.cursor/rules/`). Use anvil commands — they manage state and regenerate surfaces automatically.

**IMPORTANT**: Always use `--json` for structured, parsable output.

## Commands

### Project Setup

```bash
# Initialize (already done if you see this file)
anvil init --agent <copilot|claude|cursor> --json

# Initialize with a preset bundle
anvil init --agent copilot --preset <java-developer|react-frontend|tech-lead> --json
```

### Browse & Install

```bash
# See all available components
anvil catalog --json

# Install a component
anvil install skill <name> --json
anvil install recipe <name> --json
anvil install hook <name> --json
anvil install agent <name> --json

# Install from a specific marketplace (required when name is ambiguous)
anvil install skill <name> --from <marketplace> --json
```

### Inspect & Status

```bash
# See what's installed
anvil status --json

# Inspect a component (metadata, dependencies, interactions, providers)
anvil inspect <type> <name> --json

# Compare installed vs source
anvil diff --json

# Validate project integrity
anvil validate --json

# Diagnose problems
anvil doctor --json
```

### Customize & Create

```bash
# Copy a framework component to local for editing
anvil customize <type> <name> --json
# Then edit: .anvil/state/local/<type>s/<name>/index.md
# Then regenerate surfaces:
anvil generate --json

# Revert to framework version
anvil uncustomize <type> <name> --json

# Create a new local component from scratch
anvil create <type> <name> --json
```

### Update

```bash
# Preview changes (dry-run)
anvil update <type> <name> --preview --json

# Apply update (auto-backup for customized components)
anvil update <type> <name> --json

# Update all non-customized components
anvil update --all --json

# Restore from backup if merge was bad
anvil update <type> <name> --restore --json
```

### Promote to GitHub Agentic Workflow

```bash
# Promote a recipe to autonomous GitHub workflow
anvil promote recipe <name> --target gh-aw --json

# Dry-run (see what would be generated)
anvil promote recipe <name> --target gh-aw --dry-run --json

# Custom trigger event
anvil promote recipe <name> --target gh-aw --trigger "issues:labeled:ready" --json

# Recompile after recipe update
anvil promote --recompile <name> --json
```

### Marketplaces

```bash
# List configured marketplaces
anvil marketplace list --json

# Add external marketplace
anvil marketplace add <name> --git <url> --json
anvil marketplace add <name> --local <path> --json

# Remove a marketplace
anvil marketplace remove <name> --json

# Sync catalogs
anvil marketplace sync --json

# Enable / disable a marketplace
anvil marketplace enable <name> --json
anvil marketplace disable <name> --json

# Scaffold a new marketplace repository
anvil marketplace init <path> --json
```

### Remove

```bash
# Remove a component (blocked if others depend on it)
anvil remove <type> <name> --json

# Force remove (ignore dependency guard)
anvil remove <type> <name> --force --json
```

## Browse Available Components

```bash
# List all available components (skills, recipes, hooks, agents)
anvil catalog --json
```

## Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `NOT_INITIALIZED` | No anvil project | Run `anvil init --agent <target>` |
| `NOT_INSTALLED` | Component not installed | Run `anvil install <type> <name>` |
| `AMBIGUOUS_NAME` | Name in multiple marketplaces | Add `--from <marketplace>` |
| `HAS_DEPENDENTS` | Component required by others | Add `--force` to override |
| `ALREADY_PROMOTED` | Recipe already promoted | Add `--force` or use `--recompile` |
| `NO_UPSTREAM_SOURCE` | Local component, no upstream | Cannot update local-only components |
| `COMPONENT_ALREADY_CUSTOMIZED` | Already customized | Edit the local copy directly |
| `COMPONENT_NOT_CUSTOMIZED` | Not customized | Nothing to uncustomize |

## Key Rules

1. **Types are: `skill`, `recipe`, `hook`, `agent`** — always specify the type in commands.
2. **`--from` is required when a name exists in multiple marketplaces.**
3. **`--force` bypasses guards** (dependency check, already-promoted check).
4. **`--yes` or `ANVIL_YES=1`** skips interactive confirmations.
5. **Local components cannot be updated** — they have no upstream source.
6. **After customizing, run `anvil generate --json`** to re-project to surface files.
7. **After updating a promoted recipe**, recompile with `anvil promote --recompile <name> --json`.
