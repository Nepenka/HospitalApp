import "server-only";
import { createHash } from "node:crypto";
import { getPool, usesPostgres } from "@/server/database/postgres";
import { skipsPublicDemoCooldown } from "./public-demo-policy";
const local = new Map<string,{attempts:number;resetAt:number}>();
/** Counts before password/TOTP work, without persisting logins or IP addresses. */
export async function consumeRateLimit(scope: string, value: string, maximum=5, windowMs=15*60_000): Promise<boolean> {
  if (skipsPublicDemoCooldown(scope,process.env,process.cwd())) return true;
  const digest=createHash("sha256").update(`${scope}:${value}`).digest("hex");
  if (usesPostgres()) {
    await getPool().query("DELETE FROM anafix.rate_limit WHERE reset_at<now() AND key_digest IN (SELECT key_digest FROM anafix.rate_limit WHERE reset_at<now() ORDER BY reset_at LIMIT 100)");
    const result=await getPool().query("INSERT INTO anafix.rate_limit(key_digest,attempts,reset_at) VALUES($1,1,now()+($2::bigint*interval '1 millisecond')) ON CONFLICT(key_digest) DO UPDATE SET attempts=CASE WHEN anafix.rate_limit.reset_at<=now() THEN 1 ELSE anafix.rate_limit.attempts+1 END,reset_at=CASE WHEN anafix.rate_limit.reset_at<=now() THEN excluded.reset_at ELSE anafix.rate_limit.reset_at END RETURNING attempts",[digest,windowMs]);
    return result.rows[0].attempts<=maximum;
  }
  const now=Date.now();
  // File mode is explicitly a single-process demo, never the production limiter.
  if(local.size>10_000)for(const [key,row] of local)if(row.resetAt<=now)local.delete(key);
  const row=local.get(digest);
  if(!row||row.resetAt<=now){local.set(digest,{attempts:1,resetAt:now+windowMs});return true;}
  row.attempts++;return row.attempts<=maximum;
}
