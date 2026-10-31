import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { DEVELOPMENT_RETIREMENT_WORKER } from "@/domain/offline/retirement-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
async function publicBuildAssets(relative = ""): Promise<string[]> {
  const entries = await readdir(path.join(process.cwd(), ".next", "static", relative), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return publicBuildAssets(name);
    if (!entry.isFile() || entry.name.endsWith(".map")) return [];
    return [`/_next/static/${name.split("/").map(encodeURIComponent).join("/")}`];
  }));
  return files.flat().sort();
}
export async function GET() {
  const headers = { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "Service-Worker-Allowed": "/", "X-Content-Type-Options": "nosniff" };
  if (process.env.NODE_ENV !== "production") return new Response(DEVELOPMENT_RETIREMENT_WORKER, { headers });
  const template = await readFile(path.join(process.cwd(), "public", "sw.js"), "utf8");
  const build = process.env.NODE_ENV === "production" ? await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8") : "development";
  const version = createHash("sha256").update(build).update(template).digest("hex").slice(0, 20);
  const assets = process.env.NODE_ENV === "production" ? [...await publicBuildAssets(),"/fonts/NotoSans.ttf"] : [];
  const script = template.replace('"anafix-public-shell-v2"', JSON.stringify(`anafix-public-shell-${version}`)).replace("const BUILD_ASSETS = [];", `const BUILD_ASSETS = ${JSON.stringify(assets)};`);
  return new Response(script, { headers: { ...headers, "Cache-Control": "no-cache" } });
}
