# arcl

> Transactional coding CLI that edits files via unified diffs

*Renamed from GLM to avoid confusion with existing GLM models.*

arcl is a transactional filesystem mutation engine for AI-assisted coding. It operates **outside** the IDE, proposes changes as explicit diffs, and never touches files without confirmation.

**Boring but trustworthy.**

## Features

- **Transactional edits** — Add, edit, or remove files atomically
- **Template-based scaffolding** — Deterministic project creation from JSON templates
- **Read-only understanding** — `arcl ask` explains code without modification
- **Change explanation** — `arcl explain` describes what a change did and why
- **Edit guardrails** — Policy-based validation via `.arcl/config.json`
- **Provider fallback** — Automatic failover when primary LLM is unavailable
- **Preview mode** — `--dry-run` shows what would happen without applying
- **Change history** — All operations logged to `.arcl/history.json`
- **UTF-8 everywhere** — Explicit encoding, no corruption, no BOM issues
- **Diff-based changes** — All modifications shown as unified diffs before applying
- **Automatic backups** — Every mutation creates a `.bak` file
- **Rollback on failure** — Failed patches restore original content
- **Workspace isolation** — Operations confined to `C:\arcl-projects` (Windows) or `~/arcl-projects`
- **Multi-provider LLM** — Gemini, OpenRouter, or local (Ollama)

## Installation

```bash
# Clone the repository
git clone https://github.com/saxil/arcl-cli.git
cd arcl-cli

# Install dependencies
npm install

# Link globally
npm link

# Verify
arcl --help
```

## Configuration

Set one of these environment variables for your LLM provider:

```powershell
# Gemini (default)
$env:GEMINI_API_KEY = "your-key"

# OpenRouter
$env:ARCL_PROVIDER = "openrouter"
$env:OPENROUTER_API_KEY = "your-key"

# Local (Ollama)
$env:ARCL_PROVIDER = "local"
$env:ARCL_LOCAL_MODEL = "codellama"  # optional
```

## Usage

### Transactional Commands

```bash
# Create a new file
arcl add main.py "hello world script"

# Edit an existing file
arcl edit main.py "add error handling"

# Remove a file
arcl remove main.py

# Preview without applying (dry run)
arcl edit --dry-run main.py "add logging"
arcl add --dry-run utils.py "helper functions"
```

### Read-Only Mode

```bash
# Explain code in a file
arcl ask src/main.py "explain the main function"

# Summarize a project
arcl ask . "summarize this project"

# Explain what a change did
arcl explain last
arcl explain src/main.py
```

### Project Creation

```bash
# List available templates
arcl templates

# Create a complete project (auto-detects template)
arcl create project "a calculator app using tkinter"

# Preview project creation
arcl create project --dry-run "a flask REST API"
```

This will:
1. Auto-detect template from description
2. Show planned structure (from template)
3. Ask for confirmation
4. Generate file contents via LLM
5. Write all files with UTF-8 encoding
6. Optionally create Python venv

### Utilities

```bash
# List directory contents
arcl ls

# Show directory tree
arcl tree

# Show help
arcl --help
```

## Example Workflow

```bash
# Create a new project
arcl create project "a flask REST API with user authentication"

# Navigate to project
cd C:\arcl-projects\flask-rest-api

# View structure
arcl tree

# Add a new endpoint
arcl add src/routes/products.py "CRUD endpoints for products"

# Edit existing file
arcl edit src/main.py "add products router import"

# Remove a file
arcl remove src/routes/old_route.py
```

## Workspace

arcl enforces workspace boundaries for safety:

| OS | Workspace Path |
|----|----------------|
| Windows | `C:\arcl-projects` |
| macOS | `~/Desktop/arcl-projects` |
| Linux | `~/arcl-projects` |

All `arcl add/edit/remove` commands must operate within the workspace.

## Architecture

```
┌─────────────────┐
│   User Input    │
└────────┬────────┘
         │
┌────────▼────────┐
│    agent.js     │  CLI router
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼───┐
│ llm.js│ │scaffold│  LLM abstraction / Template scaffolding
└───┬───┘ └───┬───┘
    │         │
┌───▼─────────▼───┐
│   providers/    │  Gemini, OpenRouter, Local, Anthropic
└────────┬────────┘
         │
┌────────▼────────┐
│     io.js       │  UTF-8 I/O layer
└────────┬────────┘
         │
┌────────▼────────┐
│  applyDiff.js   │  Patch application + rollback
└────────┬────────┘
         │
┌────────▼────────┐
│   Filesystem    │
└─────────────────┘
```

## Templates

Templates live in `templates/` as JSON files:

```json
{
  "name": "python-tkinter",
  "language": "python",
  "description": "Tkinter GUI application",
  "detect": ["tkinter", "gui", "desktop"],
  "structure": [
    "README.md",
    "requirements.txt",
    ".gitignore",
    "src/main.py"
  ],
  "fileDescriptions": {
    "README.md": "Project documentation",
    "src/main.py": "Main Tkinter application"
  },
  "venv": true
}
```

Available templates:
- `python-tkinter` — Tkinter GUI app
- `python-fastapi` — FastAPI web application
- `python-flask` — Flask web server
- `python-cli` — Python CLI application
- `node-express` — Express.js server
- `node-cli` — Node.js CLI tool
- `react-vite` — React app with Vite
- `web-static` — HTML/CSS/JS site
- `generic` — Fallback

Use `--template <name>` to explicitly select a template:
```bash
arcl create project --template python-fastapi "REST API for users"
```

## Change History

All operations are logged to `.arcl/history.json`:

```json
{
  "timestamp": "2026-01-27T10:30:00.000Z",
  "command": "edit",
  "files": ["main.py"],
  "instruction": "add error handling",
  "provider": "gemini",
  "result": "success"
}
```

History is append-only and read-only by default.

## Edit Guardrails

Create `.arcl/config.json` to enforce policies:

```json
{
  "allow_full_rewrites": false,
  "forbid_patterns": ["eval\\(", "exec\\(", "__import__\\("],
  "max_diff_lines": 500,
  "require_confirmation": true
}
```

| Policy | Default | Description |
|--------|---------|-------------|
| `allow_full_rewrites` | `false` | Permit diffs that replace entire files |
| `forbid_patterns` | `["eval\\(", ...]` | Regex patterns to reject in output |
| `max_diff_lines` | `500` | Maximum lines per diff (0 = unlimited) |
| `require_confirmation` | `true` | Always ask before applying |

Violations are rejected with clear error messages.

## Provider Fallback

If the primary provider is unavailable, arcl automatically falls back:

```
Warning: gemini unavailable, falling back to openrouter
```

Fallback order: `gemini` → `openrouter` → `local`

Transient errors that trigger fallback:
- Rate limits
- 502/503 errors
- Timeouts
- Capacity issues

## Core Principles

1. **Runtime owns structure** — LLM never creates directories or chooses paths
2. **LLM is text-only** — No tool calls, no command execution
3. **All mutations explicit** — User confirms every change
4. **Fail closed** — Invalid output = no changes

## Files

| File | Purpose |
|------|---------|
| `agent.js` | CLI entry point and command router |
| `llm.js` | LLM abstraction with retry logic |
| `io.js` | UTF-8 file I/O layer |
| `config.js` | Policy guardrails and configuration |
| `history.js` | Change tracking and logging |
| `applyDiff.js` | Unified diff parsing and application |
| `workspace.js` | Workspace management and path validation |
| `scaffold.js` | Template-based project scaffolding |
| `providers/` | LLM provider adapters with health + fallback |
| `templates/` | Project template JSON files |

## Requirements

- Node.js >= 18.0.0
- npm

## License

MIT
