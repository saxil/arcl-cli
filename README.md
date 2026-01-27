# GLM CLI

> A CLI-based coding agent that edits files via unified diffs

GLM is a transactional filesystem mutation engine for AI-assisted coding. It operates **outside** the IDE, proposes changes as explicit diffs, and never touches files without confirmation.

**Boring but trustworthy.**

## Features

- **Transactional edits** — Add, edit, or remove files atomically
- **Project scaffolding** — Generate complete projects from descriptions
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
```

### Project Creation

```bash
# Create a complete project
glm create project "a calculator app using tkinter"
```

This will:
1. Detect project type (Python, Node.js, Web)
2. Create directory structure
3. Generate all files via LLM
4. Optionally create Python venv

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
│ llm.js│ │scaffold│  LLM abstraction / Project scaffolding
└───┬───┘ └───┬───┘
    │         │
┌───▼─────────▼───┐
│   providers/    │  Gemini, OpenRouter, Local, Anthropic
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
| `applyDiff.js` | Unified diff parsing and application |
| `workspace.js` | Workspace management and path validation |
| `scaffold.js` | Project scaffolding schemas and generation |
| `providers/` | LLM provider adapters (Gemini, OpenRouter, Local) |

## Requirements

- Node.js >= 18.0.0
- npm

## License

MIT
