# agentsh Policy Editor — Design Spec

**Date:** 2026-03-23
**Status:** Draft

## Overview

A TypeScript CLI tool that launches a local Express server with a Monaco-based YAML editor for managing agentsh policies. The tool wraps the `agentsh` CLI binary, providing a browser UI for editing, creating, validating, signing, and verifying policies.

## Audience

Developers and policy administrators using agentsh. Assumes familiarity with YAML and policy concepts but keeps the UI approachable.

## CLI Interface

```
npx agentsh-policy-editor [options]
```

### Parameters

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--agentsh <path>` | string | `agentsh` on PATH (`agentsh.exe` on Windows) | Path to agentsh binary |
| `--policies <dir>` | string | OS-dependent (see below) | Directory containing policy YAML files |
| `--private-key <path>` | string | *(none)* | Path to `private.key.json` for signing |
| `--trust-dir <dir>` | string | OS-dependent (see below) | Directory of public keys for verification |
| `--port <number>` | number | `0` (random available) | Server port |
| `--no-open` | boolean | `false` | Skip auto-opening browser |

### OS-Aware Defaults

| Platform | `--policies` | `--trust-dir` |
|----------|-------------|---------------|
| Linux | `~/.config/agentsh/policies` | `~/.config/agentsh/trust-store` |
| macOS | `~/Library/Application Support/agentsh/policies` | `~/Library/Application Support/agentsh/trust-store` |
| Windows | `%APPDATA%\agentsh\policies` | `%APPDATA%\agentsh\trust-store` |

### Startup Sequence

1. Parse CLI args, resolve defaults based on `process.platform`
2. Verify `agentsh` binary exists and is executable
3. Verify policies directory exists (create with `mkdir -p` if missing)
4. Start Express server on the specified port
5. Open browser via OS command (`xdg-open` / `open` / `start`)
6. Log the URL to stdout

## Architecture

Single-file Express server serving a single-page application. No frontend build step. Monaco editor loaded from CDN (`cdn.jsdelivr.net`).

### Project Structure

```
agentsh-policy-editor/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # CLI entry (arg parsing, server start, browser open)
│   ├── server.ts         # Express app, all API routes
│   ├── agentsh.ts        # Wrapper around agentsh CLI calls (execFile)
│   ├── defaults.ts       # OS-aware default paths
│   └── public/
│       └── index.html    # SPA — Monaco editor, sidebar, toolbar
└── .gitignore
```

### Dependencies

**Production:**
- `express` — HTTP server
- `open` — cross-platform browser opening
- `commander` — CLI argument parsing

**Dev:**
- `typescript`, `@types/express`
- `tsx` — run TypeScript directly during development
- `esbuild` — bundle for distribution

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the SPA (index.html) |
| `GET` | `/api/policies` | Lists `.yaml`/`.yml` files. Returns `[{name, path, hasSig}]` |
| `GET` | `/api/policies/:filename` | Reads a policy file. Returns `{content, hasSig}` |
| `POST` | `/api/policies/:filename` | Saves content to a policy file |
| `POST` | `/api/policies` | Creates a new policy file. Body: `{filename, content}` |
| `DELETE` | `/api/policies/:filename` | Deletes a policy file and its `.sig` if present |
| `POST` | `/api/validate` | Runs `agentsh policy validate <file>`. Returns stdout/stderr |
| `POST` | `/api/sign` | Runs `agentsh policy sign <file> --key <key>`. Returns result |
| `POST` | `/api/verify/:filename` | Runs `agentsh policy verify <file> --key-dir <dir>`. Returns result |

### CLI Wrapper

All `agentsh` calls use `child_process.execFile` with array arguments (no shell interpolation). The wrapper captures stdout, stderr, and exit code, returning a structured result. All commands receive absolute file paths (not policy names), so they work regardless of `--dir` configuration:

```typescript
// Example: agentsh policy validate /absolute/path/to/policy.yaml
```

```typescript
interface AgentshResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

For sign and verify, the key paths come from either the CLI flag (set at startup) or the request body (set per-request from the UI).

## Frontend

Single HTML page with inline CSS and JavaScript. No framework.

### Layout

- **Left sidebar** (~250px): scrollable list of policy files. Each entry shows the filename and a dot indicator if a `.sig` file exists. A "+ New Policy" button at the bottom.
- **Main area**: Monaco editor configured for YAML syntax highlighting, full height.
- **Bottom toolbar**: `[Save]` `[Validate]` `[Sign]` `[Verify]` buttons, plus a status bar for results and errors.

### Interactions

- **Click policy** → loads content into Monaco editor via GET
- **Save** → POST to API. Auto-validates first. If validation fails, shows error but allows save with warning.
- **Validate** → calls validate endpoint, shows pass/fail in status bar
- **Sign** → if no private key configured, prompts for path via a modal. Calls sign endpoint. Updates sig indicator in sidebar on success.
- **Verify** → calls verify endpoint, shows valid/invalid with signer info in status bar
- **New Policy** → modal for filename, optionally copy from existing. Creates file via API, opens in editor.
- **Unsaved changes** → dot indicator on filename, confirm dialog when switching files

### Styling

Clean, minimal dark theme (similar to VS Code). Vanilla CSS only. Monaco provides the editor chrome.

## Error Handling

- **Binary not found** at startup → clear error message with instructions, exit 1
- **Policies dir missing** → create it with `mkdir -p`, log a note
- **CLI command failures** → capture stderr, return structured error with exit code to the UI
- **File write failures** → return HTTP 500 with the OS error message
- **YAML syntax errors** → Monaco shows these inline (built-in)

## Security

- Server binds to `127.0.0.1` only — no network exposure
- All CLI calls use `execFile` with array args — immune to shell injection
- File operations restricted to the policies directory — path traversal rejected by validating resolved paths start with the policies dir
- Private key path validated to exist and end in `.json`
- No authentication — local-only tool, same trust model as running `agentsh` directly

## Graceful Shutdown

- SIGINT/SIGTERM → close Express server, exit cleanly
- Browser tab closing does not stop the server — user can re-open the URL
