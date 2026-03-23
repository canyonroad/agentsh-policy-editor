# agentsh Policy Editor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI tool that launches a local Express server with a Monaco-based YAML editor for managing, validating, signing, and verifying agentsh policies.

**Architecture:** Single Express server serving a vanilla HTML SPA with Monaco editor from CDN. All policy operations shell out to the `agentsh` binary via `child_process.execFile`. No frontend build step.

**Tech Stack:** TypeScript, Express, Commander, Monaco Editor (CDN), `open` package

**Spec:** `docs/superpowers/specs/2026-03-23-policy-editor-design.md`

---

## File Structure

```
agentsh-policy-editor/
├── package.json              # npm metadata, scripts, dependencies
├── tsconfig.json             # TypeScript config
├── .gitignore                # node_modules, dist, .superpowers
├── src/
│   ├── index.ts              # CLI entry point: parse args, start server, open browser
│   ├── defaults.ts           # OS-aware default paths for agentsh, policies, trust-dir
│   ├── agentsh.ts            # Wrapper: execFile calls to agentsh binary
│   ├── server.ts             # Express app: static serving + all API routes
│   └── public/
│       └── index.html        # SPA: Monaco editor, sidebar, toolbar, all CSS/JS inline
├── test/
│   ├── defaults.test.ts      # Unit tests for OS-aware defaults
│   ├── agentsh.test.ts       # Unit tests for CLI wrapper (mocked execFile)
│   └── server.test.ts        # Integration tests for API routes
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "agentsh-policy-editor",
  "version": "0.1.0",
  "description": "Browser-based editor for agentsh policies",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "agentsh-policy-editor": "dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "node --import tsx --test test/*.test.ts",
    "start": "node dist/index.js"
  },
  "keywords": ["agentsh", "policy", "editor"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
.superpowers/
```

- [ ] **Step 4: Install dependencies**

Run: `npm install express open commander`
Run: `npm install -D typescript @types/express @types/node tsx`

- [ ] **Step 5: Verify setup compiles**

Create a minimal `src/index.ts`:
```typescript
console.log("agentsh-policy-editor");
```

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts package-lock.json
git commit -m "chore: scaffold project with TypeScript and dependencies"
```

---

### Task 2: OS-Aware Defaults (`src/defaults.ts`)

**Files:**
- Create: `src/defaults.ts`
- Create: `test/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/defaults.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDefaults } from "../src/defaults.js";

describe("getDefaults", () => {
  it("returns agentsh binary name", () => {
    const d = getDefaults();
    assert.ok(d.agentsh.length > 0);
  });

  it("returns policies dir under home", () => {
    const d = getDefaults();
    assert.ok(d.policiesDir.includes("agentsh"));
  });

  it("returns trust dir under home", () => {
    const d = getDefaults();
    assert.ok(d.trustDir.includes("agentsh"));
  });

  it("linux defaults use .config", () => {
    const d = getDefaults("linux");
    assert.match(d.policiesDir, /\.config\/agentsh\/policies/);
    assert.match(d.trustDir, /\.config\/agentsh\/trust-store/);
  });

  it("darwin defaults use Library/Application Support", () => {
    const d = getDefaults("darwin");
    assert.match(d.policiesDir, /Library\/Application Support\/agentsh\/policies/);
  });

  it("win32 defaults use APPDATA", () => {
    const d = getDefaults("win32");
    assert.match(d.agentsh, /agentsh\.exe/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/defaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/defaults.ts
import { homedir } from "node:os";
import { join } from "node:path";

export interface Defaults {
  agentsh: string;
  policiesDir: string;
  trustDir: string;
}

export function getDefaults(platform?: string): Defaults {
  const p = platform ?? process.platform;
  const home = homedir();

  switch (p) {
    case "darwin":
      return {
        agentsh: "agentsh",
        policiesDir: join(home, "Library", "Application Support", "agentsh", "policies"),
        trustDir: join(home, "Library", "Application Support", "agentsh", "trust-store"),
      };
    case "win32":
      const appdata = process.env.APPDATA ?? join(home, "AppData", "Roaming");
      return {
        agentsh: "agentsh.exe",
        policiesDir: join(appdata, "agentsh", "policies"),
        trustDir: join(appdata, "agentsh", "trust-store"),
      };
    default: // linux and others
      return {
        agentsh: "agentsh",
        policiesDir: join(home, ".config", "agentsh", "policies"),
        trustDir: join(home, ".config", "agentsh", "trust-store"),
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/defaults.test.ts`
Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/defaults.ts test/defaults.test.ts
git commit -m "feat: add OS-aware default paths for agentsh, policies, and trust store"
```

---

### Task 3: agentsh CLI Wrapper (`src/agentsh.ts`)

**Files:**
- Create: `src/agentsh.ts`
- Create: `test/agentsh.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/agentsh.test.ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AgentshCli } from "../src/agentsh.js";

describe("AgentshCli", () => {
  // Use the real agentsh binary for integration tests
  const agentsh = new AgentshCli(process.env.AGENTSH_PATH ?? "agentsh");

  it("validate returns structured result", async () => {
    // Validate a non-existent file should fail
    const result = await agentsh.validate("/tmp/nonexistent-policy.yaml");
    assert.equal(result.success, false);
    assert.equal(typeof result.exitCode, "number");
    assert.ok(result.exitCode !== 0);
  });

  it("sign requires key path", async () => {
    const result = await agentsh.sign("/tmp/nonexistent.yaml", "");
    assert.equal(result.success, false);
  });

  it("verify requires trust dir", async () => {
    const result = await agentsh.verify("/tmp/nonexistent.yaml", "");
    assert.equal(result.success, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/agentsh.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/agentsh.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AgentshResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class AgentshCli {
  constructor(private binaryPath: string) {}

  private async run(args: string[]): Promise<AgentshResult> {
    try {
      const { stdout, stderr } = await execFileAsync(this.binaryPath, args, {
        timeout: 30_000,
      });
      return { success: true, stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (err: any) {
      return {
        success: false,
        stdout: (err.stdout ?? "").trim(),
        stderr: (err.stderr ?? err.message ?? "").trim(),
        exitCode: err.code ?? 1,
      };
    }
  }

  async validate(policyPath: string): Promise<AgentshResult> {
    return this.run(["policy", "validate", policyPath]);
  }

  async sign(policyPath: string, keyPath: string, signer?: string): Promise<AgentshResult> {
    if (!keyPath) {
      return { success: false, stdout: "", stderr: "--key is required", exitCode: 1 };
    }
    const args = ["policy", "sign", policyPath, "--key", keyPath];
    if (signer) args.push("--signer", signer);
    return this.run(args);
  }

  async verify(policyPath: string, trustDir: string): Promise<AgentshResult> {
    if (!trustDir) {
      return { success: false, stdout: "", stderr: "--key-dir is required", exitCode: 1 };
    }
    return this.run(["policy", "verify", policyPath, "--key-dir", trustDir]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/agentsh.test.ts`
Expected: all 3 tests PASS (assuming `agentsh` is on PATH; set `AGENTSH_PATH` if not)

- [ ] **Step 5: Commit**

```bash
git add src/agentsh.ts test/agentsh.test.ts
git commit -m "feat: add agentsh CLI wrapper with validate, sign, and verify"
```

---

### Task 4: Express Server & API Routes (`src/server.ts`)

**Files:**
- Create: `src/server.ts`
- Create: `test/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/server.test.ts
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp, type AppConfig } from "../src/server.js";

function makeRequest(app: any, method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", async () => {
      const addr = server.address() as any;
      const url = `http://127.0.0.1:${addr.port}${path}`;
      const opts: RequestInit = { method };
      if (body) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(url, opts);
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = text; }
      server.close();
      resolve({ status: res.status, body: json });
    });
  });
}

describe("API", () => {
  let policiesDir: string;
  let config: AppConfig;

  beforeEach(() => {
    policiesDir = mkdtempSync(join(tmpdir(), "pe-test-"));
    writeFileSync(join(policiesDir, "test.yaml"), "version: 1\nname: test\n");
    config = {
      policiesDir,
      agentshPath: process.env.AGENTSH_PATH ?? "agentsh",
      trustDir: "",
      privateKeyPath: "",
    };
  });

  it("GET /api/policies lists files", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "GET", "/api/policies");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].name, "test.yaml");
    assert.equal(res.body[0].hasSig, false);
  });

  it("GET /api/policies/:filename reads file", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "GET", "/api/policies/test.yaml");
    assert.equal(res.status, 200);
    assert.equal(res.body.content, "version: 1\nname: test\n");
    assert.equal(res.body.hasSig, false);
  });

  it("POST /api/policies/:filename saves file", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "POST", "/api/policies/test.yaml", { content: "version: 1\nname: updated\n" });
    assert.equal(res.status, 200);
    const saved = readFileSync(join(policiesDir, "test.yaml"), "utf-8");
    assert.equal(saved, "version: 1\nname: updated\n");
  });

  it("POST /api/policies creates new file", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "POST", "/api/policies", { filename: "new.yaml", content: "version: 1\nname: new\n" });
    assert.equal(res.status, 201);
    assert.ok(existsSync(join(policiesDir, "new.yaml")));
  });

  it("DELETE /api/policies/:filename deletes file", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "DELETE", "/api/policies/test.yaml");
    assert.equal(res.status, 200);
    assert.ok(!existsSync(join(policiesDir, "test.yaml")));
  });

  it("rejects path traversal", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "GET", "/api/policies/..%2F..%2Fetc%2Fpasswd");
    assert.equal(res.status, 400);
  });

  it("GET /api/policies/:filename returns 404 for missing file", async () => {
    const app = createApp(config);
    const res = await makeRequest(app, "GET", "/api/policies/nope.yaml");
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/server.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/server.ts
import express from "express";
import { readdir, readFile, writeFile, unlink, access, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { AgentshCli } from "./agentsh.js";

export interface AppConfig {
  policiesDir: string;
  agentshPath: string;
  trustDir: string;
  privateKeyPath: string;
}

function safePath(policiesDir: string, filename: string): string | null {
  const resolved = resolve(policiesDir, filename);
  if (!resolved.startsWith(resolve(policiesDir) + "/") && resolved !== resolve(policiesDir)) {
    return null;
  }
  return resolved;
}

export function createApp(config: AppConfig) {
  const app = express();
  app.use(express.json());

  const cli = new AgentshCli(config.agentshPath);

  // Serve SPA
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  app.use(express.static(join(__dirname, "public")));

  // List policies
  app.get("/api/policies", async (_req, res) => {
    try {
      const files = await readdir(config.policiesDir);
      const policies = files
        .filter((f) => /\.ya?ml$/i.test(f))
        .map((f) => ({
          name: f,
          hasSig: files.includes(f + ".sig"),
        }));
      res.json(policies);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Read policy
  app.get("/api/policies/:filename", async (req, res) => {
    const filePath = safePath(config.policiesDir, req.params.filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    try {
      const content = await readFile(filePath, "utf-8");
      const sigExists = await access(filePath + ".sig").then(() => true).catch(() => false);
      res.json({ content, hasSig: sigExists });
    } catch (err: any) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "Not found" });
      res.status(500).json({ error: err.message });
    }
  });

  // Save policy
  app.post("/api/policies/:filename", async (req, res) => {
    const filePath = safePath(config.policiesDir, req.params.filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    try {
      await writeFile(filePath, req.body.content, "utf-8");
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new policy
  app.post("/api/policies", async (req, res) => {
    const { filename, content } = req.body;
    if (!filename || !/\.ya?ml$/i.test(filename)) {
      return res.status(400).json({ error: "Filename must end in .yaml or .yml" });
    }
    const filePath = safePath(config.policiesDir, filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    try {
      await access(filePath);
      return res.status(409).json({ error: "File already exists" });
    } catch {
      // good — file doesn't exist
    }
    try {
      await writeFile(filePath, content ?? "", "utf-8");
      res.status(201).json({ ok: true, name: filename });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete policy
  app.delete("/api/policies/:filename", async (req, res) => {
    const filePath = safePath(config.policiesDir, req.params.filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    try {
      await unlink(filePath);
      // Also delete .sig if it exists
      await unlink(filePath + ".sig").catch(() => {});
      res.json({ ok: true });
    } catch (err: any) {
      if (err.code === "ENOENT") return res.status(404).json({ error: "Not found" });
      res.status(500).json({ error: err.message });
    }
  });

  // Validate policy
  app.post("/api/validate", async (req, res) => {
    const { filename } = req.body;
    const filePath = safePath(config.policiesDir, filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    const result = await cli.validate(filePath);
    res.json(result);
  });

  // Sign policy
  app.post("/api/sign", async (req, res) => {
    const { filename, keyPath } = req.body;
    const filePath = safePath(config.policiesDir, filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    const key = keyPath || config.privateKeyPath;
    if (!key) return res.status(400).json({ error: "No private key path provided" });
    if (!key.endsWith(".json")) return res.status(400).json({ error: "Private key path must end in .json" });
    try {
      await access(key);
    } catch {
      return res.status(400).json({ error: `Private key not found: ${key}` });
    }
    const result = await cli.sign(filePath, key);
    res.json(result);
  });

  // Verify policy
  app.post("/api/verify/:filename", async (req, res) => {
    const filePath = safePath(config.policiesDir, req.params.filename);
    if (!filePath) return res.status(400).json({ error: "Invalid path" });
    const trustDir = req.body?.trustDir || config.trustDir;
    if (!trustDir) return res.status(400).json({ error: "No trust directory provided" });
    const result = await cli.verify(filePath, trustDir);
    res.json(result);
  });

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/server.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/server.test.ts
git commit -m "feat: add Express server with policy CRUD, validate, sign, and verify routes"
```

---

### Task 5: Frontend SPA (`src/public/index.html`)

**Files:**
- Create: `src/public/index.html`

This is a single HTML file with all CSS and JS inline. Monaco editor loaded from CDN.

- [ ] **Step 1: Create the HTML file**

The file should contain:

**Head:** Load Monaco from `cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs`

**CSS (inline):** Dark theme matching VS Code aesthetics:
- Body: `#1e1e1e` background, `#d4d4d4` text, zero margin
- Layout: CSS grid with sidebar (250px) + main area
- Sidebar: `#252526` background, scrollable file list
- Each file entry: padding, hover highlight (`#2a2d2e`), active state (`#37373d`), sig dot indicator (green circle), dirty/unsaved dot indicator (orange circle)
- Toolbar: `#333333` background, bottom of screen, flex row of buttons
- Buttons: `#0e639c` background (VS Code blue), hover `#1177bb`
- Status bar: below buttons, shows messages with color coding (green=success, red=error, yellow=warning)
- Modal: centered overlay with `#252526` background, for new policy name and private key path inputs

**HTML structure:**
```html
<div id="app">
  <div id="sidebar">
    <div id="sidebar-header">Policies</div>
    <div id="file-list"></div>
    <button id="new-policy-btn">+ New Policy</button>
  </div>
  <div id="main">
    <div id="editor-container"></div>
    <div id="toolbar">
      <button id="save-btn">Save</button>
      <button id="validate-btn">Validate</button>
      <button id="sign-btn">Sign</button>
      <button id="verify-btn">Verify</button>
      <div id="status-bar"></div>
    </div>
  </div>
</div>
<div id="modal-overlay" class="hidden">
  <div id="modal">
    <h3 id="modal-title"></h3>
    <input id="modal-input" type="text" />
    <div id="modal-actions">
      <button id="modal-cancel">Cancel</button>
      <button id="modal-ok">OK</button>
    </div>
  </div>
</div>
```

**JavaScript (inline):** Application logic:

1. **State:** `currentFile` (string|null), `isDirty` (boolean), `editor` (Monaco instance), `privateKeyPath` (string from server config or user input)
2. **`loadPolicies()`:** `GET /api/policies` → render sidebar file list. Each entry shows name, green dot if `hasSig`, click handler to load file. Highlight active file. If `isDirty`, show an orange dot next to the current file name to indicate unsaved changes.
3. **`loadFile(name)`:** If dirty, `confirm("Unsaved changes. Discard?")`. `GET /api/policies/:name` → set editor value, update `currentFile`, clear dirty state, remove dirty indicator.
4. **`saveFile()`:** First call `POST /api/validate` with `{filename: currentFile}`. If validation fails, show yellow warning in status bar with the error, then `confirm("Policy validation failed. Save anyway?")`. If user confirms (or validation passed), `POST /api/policies/:currentFile` with `{content: editor.getValue()}`. On success, show green status. On error, show red status.
5. **`validateFile()`:** `POST /api/validate` with `{filename: currentFile}`. Show result in status bar — green for success, red for failure with stderr.
6. **`signFile()`:** If no `privateKeyPath`, show modal prompting for it. Then `POST /api/sign` with `{filename: currentFile, keyPath}`. On success, refresh file list (to update sig indicator), show green status.
7. **`verifyFile()`:** `POST /api/verify/:currentFile`. Show result in status bar — green "Valid" with signer info, or red "Invalid"/"No signature".
8. **`newPolicy()`:** Show modal for filename. Include a "Copy from" dropdown populated with current policy names (plus a "Blank" option). If "Blank" selected, use skeleton template: `"version: 1\nname: \ndescription: |\n  \n\nfile_rules: []\ncommand_rules: []\nnetwork_rules: []\n"`. If copying from existing, `GET /api/policies/:source` and use its content. Then `POST /api/policies` with `{filename, content}`. Refresh list, open new file.
9. **Monaco setup:** `require(['vs/editor/editor.main'], (monaco) => { ... })` — create editor in `#editor-container`, language `yaml`, theme `vs-dark`, minimap off, auto-layout on resize. Listen to `onDidChangeModelContent` to set `isDirty = true`.
10. **Keyboard shortcut:** Ctrl/Cmd+S → save.

- [ ] **Step 2: Verify manually**

Run: `npx tsx src/index.ts --policies /tmp/test-policies` (after creating index.ts stub in Task 6)
Open browser → verify sidebar loads, editor renders, basic interactions work.

- [ ] **Step 3: Commit**

```bash
git add src/public/index.html
git commit -m "feat: add frontend SPA with Monaco YAML editor, sidebar, and toolbar"
```

---

### Task 6: CLI Entry Point (`src/index.ts`)

**Files:**
- Create: `src/index.ts` (replace stub from Task 1)

- [ ] **Step 1: Write implementation**

```typescript
// src/index.ts
import { Command } from "commander";
import { createApp } from "./server.js";
import { getDefaults } from "./defaults.js";
import { execFileSync } from "node:child_process";
import { mkdirSync, accessSync, constants } from "node:fs";
import { resolve } from "node:path";

const defaults = getDefaults();

const program = new Command()
  .name("agentsh-policy-editor")
  .description("Browser-based editor for agentsh policies")
  .option("--agentsh <path>", "Path to agentsh binary", defaults.agentsh)
  .option("--policies <dir>", "Directory containing policy files", defaults.policiesDir)
  .option("--private-key <path>", "Path to private.key.json for signing")
  .option("--trust-dir <dir>", "Directory of public keys for verification", defaults.trustDir)
  .option("--port <number>", "Server port (0 = random)", "0")
  .option("--no-open", "Skip auto-opening browser")
  .action(async (opts) => {
    // Verify agentsh binary
    try {
      execFileSync(opts.agentsh, ["--version"], { timeout: 5000 });
    } catch {
      console.error(`Error: agentsh binary not found at "${opts.agentsh}"`);
      console.error("Install agentsh or pass --agentsh /path/to/agentsh");
      process.exit(1);
    }

    // Ensure policies dir exists
    const policiesDir = resolve(opts.policies);
    try {
      accessSync(policiesDir, constants.R_OK);
    } catch {
      console.log(`Creating policies directory: ${policiesDir}`);
      mkdirSync(policiesDir, { recursive: true });
    }

    const app = createApp({
      policiesDir,
      agentshPath: opts.agentsh,
      trustDir: opts.trustDir ? resolve(opts.trustDir) : "",
      privateKeyPath: opts.privateKey ? resolve(opts.privateKey) : "",
    });

    const port = parseInt(opts.port, 10);
    const server = app.listen(port, "127.0.0.1", async () => {
      const addr = server.address() as any;
      const url = `http://127.0.0.1:${addr.port}`;
      console.log(`agentsh-policy-editor running at ${url}`);

      if (opts.open !== false) {
        const open = (await import("open")).default;
        await open(url);
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log("\nShutting down...");
      server.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parse();
```

- [ ] **Step 2: Verify it starts**

Run: `npx tsx src/index.ts --policies /tmp/test-policies --no-open --port 3847`
Expected: `agentsh-policy-editor running at http://127.0.0.1:3847`

Open `http://127.0.0.1:3847` manually → should see the SPA.

- [ ] **Step 3: Verify browser auto-open works**

Run: `npx tsx src/index.ts --policies /tmp/test-policies --port 0`
Expected: browser opens to the editor page.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with arg parsing, server start, and browser open"
```

---

### Task 7: End-to-End Manual Testing & Polish

**Files:**
- Modify: any file that needs fixes

- [ ] **Step 1: Set up test policies**

```bash
mkdir -p /tmp/e2e-policies
cp /home/eran/work/agentsh/configs/policies/default.yaml /tmp/e2e-policies/
cp /home/eran/work/agentsh/configs/policies/agent-default.yaml /tmp/e2e-policies/
```

- [ ] **Step 2: Start the editor**

Run: `npx tsx src/index.ts --policies /tmp/e2e-policies --agentsh /home/eran/work/agentsh/agentsh`
Expected: browser opens, sidebar shows `default.yaml` and `agent-default.yaml`

- [ ] **Step 3: Test each feature in the browser**

Test checklist:
1. Click `default.yaml` → content loads in Monaco editor
2. Edit content → dirty indicator appears
3. Switch file with unsaved changes → confirm dialog appears
4. Click Save → file saved, status bar shows success
5. Click Validate → status bar shows validation result
6. Click "+ New Policy" → modal appears, enter name, creates file
7. Delete: manually verify via API (`curl -X DELETE ...`)
8. Click Sign → if no key, modal asks for key path. Provide a valid key → sig created, dot appears in sidebar
9. Click Verify → shows valid/invalid result with signer info

- [ ] **Step 4: Fix any issues found**

Address any bugs, styling issues, or UX problems discovered during testing.

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

### Task 8: Build & Distribution Setup

**Files:**
- Modify: `package.json` (add build scripts)
- Modify: `tsconfig.json` (if needed)

- [ ] **Step 1: Verify TypeScript build**

Run: `npx tsc`
Expected: `dist/` directory created with compiled JS files

- [ ] **Step 2: Verify built version runs**

Run: `node dist/index.js --policies /tmp/e2e-policies --no-open --port 3848`
Expected: server starts successfully

- [ ] **Step 3: Ensure public/index.html is copied to dist**

Add a `postbuild` script to `package.json` or configure TypeScript to copy non-TS files. Simplest approach:

Add to `package.json` scripts:
```json
"build": "tsc && cp -r src/public dist/public"
```

- [ ] **Step 4: Verify full build + run cycle**

```bash
npm run build
node dist/index.js --policies /tmp/e2e-policies --no-open --port 3849
```
Expected: serves correctly from `dist/`

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: add build script with static file copying"
```

---

## Summary

| Task | Description | Estimated Steps |
|------|-------------|----------------|
| 1 | Project scaffolding | 6 |
| 2 | OS-aware defaults | 5 |
| 3 | agentsh CLI wrapper | 5 |
| 4 | Express server & API routes | 5 |
| 5 | Frontend SPA | 3 |
| 6 | CLI entry point | 4 |
| 7 | E2E testing & polish | 5 |
| 8 | Build & distribution | 5 |
| **Total** | | **38 steps** |

Tasks 2 and 3 are independent and can be parallelized. Task 4 depends on Task 3. Task 5 is independent of 2-4. Task 6 depends on 2, 3, 4, and 5. Tasks 7 and 8 depend on all prior tasks.
