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
    case "win32": {
      const appdata = process.env.APPDATA ?? join(home, "AppData", "Roaming");
      return {
        agentsh: "agentsh.exe",
        policiesDir: join(appdata, "agentsh", "policies"),
        trustDir: join(appdata, "agentsh", "trust-store"),
      };
    }
    default: // linux and others
      return {
        agentsh: "agentsh",
        policiesDir: join(home, ".config", "agentsh", "policies"),
        trustDir: join(home, ".config", "agentsh", "trust-store"),
      };
  }
}
