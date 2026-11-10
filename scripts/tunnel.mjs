// `pnpm tunnel` —Dispatch al script nativo del sistema (tunnel.sh o tunnel.ps1).
import { spawn } from "node:child_process";
import { platform } from "node:os";

const isWindows = platform() === "win32";
const child = isWindows
  ? spawn("powershell", ["-NoProfile", "-File", "scripts/tunnel.ps1"], { stdio: "inherit" })
  : spawn("sh", ["scripts/tunnel.sh"], { stdio: "inherit" });

child.on("exit", (code) => process.exit(code ?? 0));