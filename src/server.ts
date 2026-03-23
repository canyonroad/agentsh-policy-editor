// src/server.ts
import express from "express";
import { readdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import { join, resolve } from "node:path";
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
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
    try {
      const content = await readFile(filePath, "utf-8");
      const sigExists = await access(filePath + ".sig").then(() => true).catch(() => false);
      res.json({ content, hasSig: sigExists });
    } catch (err: any) {
      if (err.code === "ENOENT") return void res.status(404).json({ error: "Not found" });
      res.status(500).json({ error: err.message });
    }
  });

  // Save policy
  app.post("/api/policies/:filename", async (req, res) => {
    const filePath = safePath(config.policiesDir, req.params.filename);
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
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
      return void res.status(400).json({ error: "Filename must end in .yaml or .yml" });
    }
    const filePath = safePath(config.policiesDir, filename);
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
    try {
      await access(filePath);
      return void res.status(409).json({ error: "File already exists" });
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
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
    try {
      await unlink(filePath);
      // Also delete .sig if it exists
      await unlink(filePath + ".sig").catch(() => {});
      res.json({ ok: true });
    } catch (err: any) {
      if (err.code === "ENOENT") return void res.status(404).json({ error: "Not found" });
      res.status(500).json({ error: err.message });
    }
  });

  // Validate policy
  app.post("/api/validate", async (req, res) => {
    const { filename } = req.body;
    const filePath = safePath(config.policiesDir, filename);
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
    const result = await cli.validate(filePath);
    res.json(result);
  });

  // Sign policy
  app.post("/api/sign", async (req, res) => {
    const { filename, keyPath } = req.body;
    const filePath = safePath(config.policiesDir, filename);
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
    const key = keyPath || config.privateKeyPath;
    if (!key) return void res.status(400).json({ error: "No private key path provided" });
    if (!key.endsWith(".json")) return void res.status(400).json({ error: "Private key path must end in .json" });
    try {
      await access(key);
    } catch {
      return void res.status(400).json({ error: `Private key not found: ${key}` });
    }
    const result = await cli.sign(filePath, key);
    res.json(result);
  });

  // Verify policy
  app.post("/api/verify/:filename", async (req, res) => {
    const filePath = safePath(config.policiesDir, req.params.filename);
    if (!filePath) return void res.status(400).json({ error: "Invalid path" });
    const trustDir = req.body?.trustDir || config.trustDir;
    if (!trustDir) return void res.status(400).json({ error: "No trust directory provided" });
    const result = await cli.verify(filePath, trustDir);
    res.json(result);
  });

  return app;
}
