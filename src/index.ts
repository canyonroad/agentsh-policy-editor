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
