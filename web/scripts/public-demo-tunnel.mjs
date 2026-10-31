import { spawn } from "node:child_process";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function tunnelOrigin(line) {
  try {
    const event = JSON.parse(line.trim());
    if (event.type !== "v1.tcpip_forward.register.accepted") return null;
    // Do not turn arbitrary SSH output into a destination for a health check.
    const match = String(event.data).match(/https:\/\/[a-z0-9.-]+\.(?:lhr\.life|localhost\.run)(?=[^a-z0-9.-]|$)/i);
    if (!match) return null;
    const url = new URL(match[0]);
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

export function processExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null || !child.pid;
}

export async function stopDemoProcess(child, timeoutMs = 5000) {
  if (processExited(child)) return;
  await new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); child.removeListener("exit", done); resolve(); };
    const timer = setTimeout(() => {
      child.removeListener("exit", done);
      child.kill("SIGKILL");
      reject(new Error("Собственный процесс демо не завершился вовремя."));
    }, timeoutMs);
    child.once("exit", done);
    child.kill();
  });
}

export class DemoTunnel {
  constructor({ ssh, port, knownHostsPath, onEvent = () => {}, spawnProcess = spawn }) {
    Object.assign(this, { ssh, port, knownHostsPath, onEvent, spawnProcess });
    this.state = null;
  }

  get origin() { return this.state?.origin; }
  get child() { return this.state?.child; }
  get alive() { return Boolean(this.state && !this.state.failed && !processExited(this.child)); }
  get error() { return this.state?.error || "SSH-соединение завершилось"; }
  needsRecovery(origin) { return !this.alive || this.origin !== origin; }

  async open({ shouldStop = async () => false, wait = pause, timeoutMs = 30000 } = {}) {
    await this.stop();
    const state = { child: null, origin: null, error: "", failed: false };
    this.state = state;
    state.child = this.spawnProcess(this.ssh, [
      "-F", "none", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
      "-o", `UserKnownHostsFile=${this.knownHostsPath}`, "-o", "IdentityAgent=none",
      "-o", "IdentityFile=none", "-o", "IdentitiesOnly=yes", "-o", "ConnectTimeout=15",
      "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
      "-T", "-R", `80:127.0.0.1:${this.port}`, "nokey@localhost.run", "--", "--output", "json",
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const child = state.child;
    const report = (event) => {
      // A late event from a stopped SSH process must never replace the new URL.
      if (this.state === state) this.onEvent({ at: new Date().toISOString(), ...event });
    };
    child.on("error", (error) => { state.failed = true; state.error = error.message; report({ type: "ssh.error", message: error.message }); });
    child.on("exit", (code, signal) => { state.failed = true; report({ type: "ssh.exit", code, signal }); });
    child.stderr.on("data", (chunk) => { state.error = (state.error + chunk.toString()).slice(-8000); });
    let pending = "";
    child.stdout.on("data", (chunk) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop().slice(-65536);
      for (const line of lines) {
        const origin = tunnelOrigin(line);
        if (origin && origin !== state.origin && this.state === state) {
          const previousOrigin = state.origin;
          state.origin = origin;
          report({ type: "v1.tcpip_forward.register.accepted", origin, previousOrigin });
        }
      }
    });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await shouldStop()) throw new Error("Запуск демонстрации остановлен.");
      if (!this.alive) throw new Error(`Не удалось открыть SSH-туннель: ${this.error}`);
      if (state.origin) return state.origin;
      await wait(100);
    }
    throw new Error(`Сервис не выдал ссылку за отведённое время: ${this.error}`);
  }

  async stop() {
    const state = this.state;
    this.state = null;
    await stopDemoProcess(state?.child);
  }
}

// Bounded retries for the connection/GET checks only, never for sign-in or MFA POSTs.
export async function retryDemoConnection({ connect, shouldStop = async () => false, wait = pause, onRetry = async () => {}, onFailure = async () => {}, delays = [0, 1000, 3000, 5000, 10000] }) {
  let failure;
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (await shouldStop()) throw new Error("Восстановление демонстрации остановлено.");
    if (attempt) await onRetry(attempt + 1, delays.length, failure);
    await wait(delays[attempt]);
    if (await shouldStop()) throw new Error("Восстановление демонстрации остановлено.");
    try { return await connect(); }
    catch (error) { failure = error; await onFailure(error); }
  }
  throw new Error(`Не удалось восстановить публичную ссылку после ${delays.length} попыток: ${failure?.message}`, { cause: failure });
}
