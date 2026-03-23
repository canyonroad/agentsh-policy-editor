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
