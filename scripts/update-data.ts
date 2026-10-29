import { mkdir, readFile, writeFile, rename, copyFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { getFundData } from "../lib/fund-data.ts";

const directory = resolve("public/data");
await mkdir(directory, { recursive: true });
const codes = (process.env.OPENRT_FUND_CODES ?? "000001,161725,019454,110011,005827,001632").split(",").map(code => code.trim());
if (!codes.length || codes.length > 30 || codes.some(code => !/^\d{6}$/.test(code))) {
  throw new Error("OPENRT_FUND_CODES must contain 1–30 comma-separated six-digit codes.");
}
const results: { code: string; latestNavDate?: string; status: string; message?: string }[] = [];
let fresh = 0;
let missing = 0;
for (const code of [...new Set(codes)]) {
  // Checked-in, dated real snapshots permit an initial build during an upstream
  // outage. Never change their fetchedAt; the browser identifies old snapshots.
  try { await access(resolve(directory, `${code}.json`)); }
  catch { try { await copyFile(resolve("data/bootstrap", `${code}.json`), resolve(directory, `${code}.json`)); } catch { /* No bootstrap for this fund. */ } }
  try {
    const data = await getFundData(code);
    const destination = resolve(directory, `${code}.json`);
    await writeFile(`${destination}.tmp`, JSON.stringify(data), "utf8");
    await rename(`${destination}.tmp`, destination);
    fresh++;
    results.push({ code, latestNavDate: data.latestNavDate, status: "updated" });
    console.log(`${code}: ${data.points.length} NAV dates, latest ${data.latestNavDate}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const prior = JSON.parse(await readFile(resolve(directory, `${code}.json`), "utf8"));
      if (prior.code !== code || !prior.points?.length || !prior.fetchedAt) throw new Error("Invalid old cache");
      results.push({ code, latestNavDate: prior.latestNavDate, status: "retained-stale", message });
      console.warn(`${code}: upstream failed; preserving previous cache (${message})`);
    } catch {
      missing++;
      results.push({ code, status: "missing", message });
      console.warn(`${code}: no usable cache (${message})`);
    }
  }
}
await writeFile(resolve(directory, "status.json"), JSON.stringify({ attemptedAt: new Date().toISOString(), fresh, missing, results }, null, 2));
if (missing > 0 || fresh === 0) process.exitCode = 1;
