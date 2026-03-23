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
