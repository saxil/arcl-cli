# Vibe Agent

> CLI-based coding agent that edits files via unified diffs

A tool-agnostic coding agent that operates outside the IDE, controls code through the filesystem, and edits via explicit diffs. Built for transparency, safety, and trust.

## Features

### Phase 1 ✅
- **Diff-based editing**: All changes are proposed as unified diffs
- **Explicit approval**: Changes require user confirmation before applying
- **Safe operations**: Automatic backups before any modification
- **Editor-agnostic**: Works with any IDE (VS Code, Neovim, JetBrains, etc.)
- **LLM-powered**: Translates natural language intent into code changes

### Phase 2 ✅
- **Multi-file editing**: Edit multiple files in a single session
- **Command execution**: Run verification commands (tests, linters, builds)
- **Feedback loop**: Iteratively retry with error context until tests pass
- **Session memory**: Track all actions and outcomes across iterations
- **Dependency awareness**: Discover related files via import analysis

### Phase 3 ✅
- **Interactive REPL mode**: Conversational interface with TUI
- **Session persistence**: Save/resume sessions to `.vibe-agent/`
- **Conversation history**: Context preserved across iterations
- **Undo support**: Restore files from backups
- **Auto-approve mode**: Skip confirmations for faster iteration

## Requirements

- Node.js >= 18.0.0

## Installation

```bash
npm install
```

## Usage

### Single File Edit (Phase 1)

```bash
node agent.js <file> "<instruction>"
```

### Multi-File Edit (Phase 2)

```bash
node agent.js --multi <file1> <file2> ... "<instruction>"
```

### Feedback Loop with Verification (Phase 2)

```bash
node agent.js --loop <file> "<instruction>" --verify "<command>"
```

### Interactive Mode (Phase 3)

```bash
node agent.js --interactive [files...]
```

### Examples

```bash
# Single file - add error handling
node agent.js src/app.js "Add try-catch error handling to the fetch call"

# Multi-file - coordinated changes
node agent.js --multi src/api.js src/types.js "Add TypeScript type annotations"

# Feedback loop - fix until tests pass
node agent.js --loop src/math.js "Fix the divide by zero bug" --verify "npm test"

# Interactive mode with files pre-loaded
node agent.js --interactive src/app.js src/utils.js

# Interactive mode with auto-approve
node agent.js -i -a src/app.js

# List saved sessions
node agent.js --sessions
```

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--help` | `-h` | Show help message |
| `--multi` | `-m` | Enable multi-file mode |
| `--loop` | `-l` | Enable feedback loop mode |
| `--interactive` | `-i` | Interactive REPL mode |
| `--sessions` | | List saved sessions |
| `--auto` | `-a` | Auto-approve changes |
| `--verify <cmd>` | `-v` | Verification command for feedback loop |
| `--max-iterations <n>` | | Max retry attempts (default: 5) |

## Interactive Mode Commands

In interactive mode, use these commands:

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/files` | List current target files |
| `/add <file>` | Add a file to context |
| `/remove <file>` | Remove a file from context |
| `/status` | Show session status |
| `/history` | Show conversation history |
| `/undo` | Restore last backup |
| `/verify [cmd]` | Run verification command |
| `/auto` | Toggle auto-approve mode |
| `/save` | Save session to disk |
| `/sessions` | List saved sessions |
| `/clear` | Clear screen |
| `/exit` | Exit interactive mode |

Or just type your instruction to edit the target files.

## How It Works

### Single File Flow
1. **Read**: Agent reads the target file
2. **Plan**: Sends file content + instruction to LLM
3. **Propose**: LLM returns a unified diff
4. **Review**: Diff is displayed with syntax highlighting
5. **Confirm**: User approves or rejects the change
6. **Apply**: On approval, creates backup and applies the patch

### Feedback Loop Flow
1. **Edit**: Apply changes as normal
2. **Verify**: Run the verification command
3. **Check**: If tests pass → success!
4. **Feedback**: If tests fail → capture error output
5. **Retry**: Send error context to LLM for next attempt
6. **Repeat**: Until success or max iterations reached

### Interactive Mode Flow
1. **Start**: Launch with `--interactive` flag
2. **Resume**: Option to resume previous session
3. **Converse**: Enter instructions naturally
4. **Review**: See proposed diffs for each file
5. **Iterate**: Continue conversation with context preserved
6. **Undo**: Restore from backups if needed
7. **Save**: Session auto-saves on exit

## Architecture

```
vibe-agent/
├─ agent.js        # CLI entry point & orchestration
├─ llm.js          # LLM abstraction layer
├─ applyDiff.js    # Diff parsing & safe application
├─ executor.js     # Shell command execution
├─ memory.js       # Session state tracking
├─ planner.js      # Multi-file planning
├─ persistence.js  # JSON file persistence (Phase 3)
├─ interactive.js  # REPL interface & TUI (Phase 3)
├─ logger.js       # Structured console logging
├─ .vibe-agent/    # Session storage directory
├─ package.json
└─ README.md
```

### Modules

| Module | Purpose |
|--------|---------|
| `agent.js` | CLI interface, mode orchestration, main loop |
| `llm.js` | LLM provider abstraction, diff validation, multi-file support |
| `applyDiff.js` | Unified diff parsing, safe patch application with rollback |
| `executor.js` | Shell command execution, stdout/stderr capture, timeout handling |
| `memory.js` | Session state, action tracking, failure feedback generation |
| `planner.js` | Multi-file context gathering, dependency discovery, plan parsing |
| `persistence.js` | Session save/load, conversation history, cleanup |
| `interactive.js` | REPL loop, TUI rendering, command handling |
| `logger.js` | Colored console output, log levels, diff syntax highlighting |

## Design Principles

- **Diffs over rewrites**: Surgical changes, not file replacement
- **Transparency over magic**: Show everything, hide nothing
- **Filesystem as API**: No IDE coupling
- **Explicit approval**: Human in the loop (auto-approve optional)
- **Boring correctness**: Reliability over cleverness

## Safety Features

- ✅ Explicit user confirmation required
- ✅ Automatic `.bak` file creation before changes
- ✅ Patch failure detection (aborts on failed hunks)
- ✅ No file deletion operations
- ✅ No recursive edits without approval
- ✅ Command timeout protection (30s default)
- ✅ Max iteration limits on feedback loops
- ✅ Full session logging and traceability
- ✅ Session persistence with resume capability

## Phase Roadmap

| Phase | Features | Status |
|-------|----------|--------|
| 1 | Single-file diff edits, manual approval | ✅ Complete |
| 2 | Multi-file planning, command execution, feedback loop | ✅ Complete |
| 3 | Interactive REPL, session persistence, conversation history | ✅ Complete |
| 4 | Web UI, project-wide reasoning, agent personas | 📋 Future |

## Session Persistence

Sessions are automatically saved to `.vibe-agent/` in your project directory:

```
.vibe-agent/
├─ session-<id>.json        # Session state
├─ conversation-<id>.json   # Conversation history
└─ latest-session.json      # Pointer to last session
```

Resume a previous session:
```bash
node agent.js --interactive
# Agent will prompt: "Resume previous session? (y/n)"
```

List all sessions:
```bash
node agent.js --sessions
```

## Extending the LLM Backend

The LLM integration is abstracted in `llm.js`. To add a new provider:

1. Implement the `LLMRequest → LLMResponse` interface
2. Update `callLLM()` to route to your provider
3. Ensure output is **unified diff only** (use `SYSTEM_PROMPT` as a guide)

```javascript
// Example: Adding OpenAI
import OpenAI from 'openai';

const openai = new OpenAI();

export async function openAILLM(request) {
  const { fileContent, filePath, instruction, feedbackContext } = request;
  
  let userMessage = `File: ${filePath}\n\n${fileContent}\n\nInstruction: ${instruction}`;
  if (feedbackContext) {
    userMessage += `\n\nPrevious attempt failed:\n${feedbackContext}`;
  }
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage }
    ]
  });
  
  return {
    success: true,
    diff: response.choices[0].message.content,
    error: null
  };
}
```

## Session Memory

The agent tracks all actions during a session:

```javascript
// Access session summary
import { memory } from './memory.js';

memory.startSession('Fix the bug');
// ... actions ...
console.log(memory.getSummary());
// Session: 1706284800000-abc123
// Intent: Fix the bug
// Iteration: 2
// Actions: 5
// Recent actions:
//   ✓ [llm-call] Generate diff for app.js
//   ✓ [apply-diff] Apply diff to app.js
//   ✗ [verify] Run: npm test
//   ...
```

## License

MIT
