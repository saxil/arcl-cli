# GLM CLI

> A CLI-based coding agent that edits files via unified diffs

GLM is a transactional filesystem mutation engine for AI-assisted coding. It operates **outside** the IDE, proposes changes as explicit diffs, and never touches files without confirmation.

**Boring but trustworthy.**

## Features

- **Transactional edits** — Add, edit, or remove files atomically
- **Template-based scaffolding** — Deterministic project creation from JSON templates
- **Read-only understanding** — `glm ask` explains code without modification
- **Preview mode** — `--dry-run` shows what would happen without applying
- **Change history** — All operations logged to `.glm/history.json`
- **UTF-8 everywhere** — Explicit encoding, no corruption, no BOM issues
- **Diff-based changes** — All modifications shown as unified diffs before applying
- **Automatic backups** — Every mutation creates a `.bak` file
- **Rollback on failure** — Failed patches restore original content
- **Workspace isolation** — Operations confined to `C:\glm-projects` (Windows) or `~/glm-projects`
- **Multi-provider LLM** — Gemini, OpenRouter, Anthropic, or local (Ollama)

## Installation

```bash
# Clone the repository
git clone https://github.com/saxil/glm-cli.git
cd glm-cli

# Install dependencies
npm install

# Link globally
npm link

# Verify
glm --help
```

## Configuration

Set one of these environment variables for your LLM provider:

```powershell
# Gemini (default)
$env:GEMINI_API_KEY = "your-key"

# OpenRouter
$env:GLM_PROVIDER = "openrouter"
$env:OPENROUTER_API_KEY = "your-key"

# Anthropic
$env:ANTHROPIC_API_KEY = "your-key"

# Local (Ollama)
$env:GLM_PROVIDER = "local"
$env:GLM_LOCAL_MODEL = "codellama"  # optional
```

## Usage

### Transactional Commands

```bash
# Create a new file
glm add main.py "hello world script"

# Edit an existing file
glm edit main.py "add error handling"

# Remove a file
glm remove main.py

# Preview without applying (dry run)
glm edit --dry-run main.py "add logging"
glm add --dry-run utils.py "helper functions"
```

### Read-Only Mode

```bash
# Explain code in a file
glm ask src/main.py "explain the main function"

# Summarize a project
glm ask . "summarize this project"
```

### Project Creation

```bash
# List available templates
glm templates

# Create a complete project (auto-detects template)
glm create project "a calculator app using tkinter"

# Preview project creation
glm create project --dry-run "a flask REST API"
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
glm ls

# Show directory tree
glm tree

# Show help
glm --help
```

## Example Workflow

```bash
# Create a new project
glm create project "a flask REST API with user authentication"

# Navigate to project
cd C:\glm-projects\flask-rest-api

# View structure
glm tree

# Add a new endpoint
glm add src/routes/products.py "CRUD endpoints for products"

# Edit existing file
glm edit src/main.py "add products router import"

# Remove a file
glm remove src/routes/old_route.py
```

## Workspace

GLM enforces workspace boundaries for safety:

| OS | Workspace Path |
|----|----------------|
| Windows | `C:\glm-projects` |
| macOS | `~/Desktop/glm-projects` |
| Linux | `~/glm-projects` |

All `glm add/edit/remove` commands must operate within the workspace.

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
glm create project --template python-fastapi "REST API for users"
```

## Change History

All operations are logged to `.glm/history.json`:

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
| `history.js` | Change tracking and logging |
| `applyDiff.js` | Unified diff parsing and application |
| `workspace.js` | Workspace management and path validation |
| `scaffold.js` | Template-based project scaffolding |
| `providers/` | LLM provider adapters (Gemini, OpenRouter, Local) |
| `templates/` | Project template JSON files |

## Requirements

- Node.js >= 18.0.0
- npm

## License

MIT
