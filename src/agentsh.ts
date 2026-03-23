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
        exitCode: typeof err.code === 'number' ? err.code : 1,
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
