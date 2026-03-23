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
