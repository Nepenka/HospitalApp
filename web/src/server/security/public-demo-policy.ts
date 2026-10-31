import path from "node:path";

/** Fail closed: only the launcher's separate, empty-data file sandbox may skip a cooldown. */
export function skipsPublicDemoCooldown(scope: string, env: Readonly<Record<string,string|undefined>>, webDirectory: string): boolean {
  if (!["login-account", "login-network", "mfa"].includes(scope)) return false;
  if (env.ANAFIX_DEMO_MODE !== "true" || env.ANAFIX_DEMO_NO_COOLDOWN !== "true") return false;
  if (env.STORAGE_BACKEND !== "files" || env.DATABASE_URL?.trim()) return false;
  if (env.ANAFIX_LOCAL_ENV_PATH !== "" || env.OFFLINE_ENABLED !== "false") return false;
  const identity = env.IDENTITY_STORE_PATH;
  if (!identity || !path.isAbsolute(identity)) return false;
  const run = path.dirname(identity);
  if (path.dirname(run) !== path.join(path.resolve(webDirectory), ".data", "public-demo")) return false;
  if (!/^run-[a-zA-Z0-9_-]+$/.test(path.basename(run))) return false;
  return identity === path.join(run, "identities.enc")
    && env.EXAMINATION_STORE_PATH === path.join(run, "examinations.enc")
    && env.MFA_STORE_PATH === path.join(run, "mfa.enc");
}
