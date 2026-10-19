// Daily deals check: visits each live deal's source page and updates Supabase.
//   - deal still on its page          -> last_checked = today
//   - page loads but deal is gone for 3+ days in a row -> status = 'rejected' (hidden from the site)
//   - page blocked / down / timed out  -> nothing changes (we can't tell)
// Run by .github/workflows/refresh-deals.yml every day at 7am Boston time.
// Locally, without SUPABASE_SERVICE_ROLE_KEY it only reports (dry run):  node scripts/refresh-deals.js
const fs = require("fs");
const path = require("path");

const DAYS_BEFORE_REJECT = 3;
const cfgFile = fs.readFileSync(path.join(__dirname, "../web/config.js"), "utf8");
const URL_ = process.env.SUPABASE_URL || cfgFile.match(/supabaseUrl:\s*"([^"]+)"/)[1];
const ANON = cfgFile.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = !SECRET;
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

// GitHub cron is in UTC, so the workflow fires at 11:00 and 12:00 UTC; only the one that is 7am in Boston proceeds.
function rightHour() {
  const s = process.env.SCHEDULE;
  if (!s) return true; // manual run
  const now = new Date();
  const bostonHour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now);
  const offset = (now.getUTCHours() - bostonHour + 24) % 24; // 4 in summer (EDT), 5 in winter (EST)
  return +s.split(" ")[1] - offset === 7; // works even if GitHub starts the run late
}

async function db(pathAndQuery, opts = {}) {
  const key = SECRET || ANON;
  const res = await fetch(`${URL_}/rest/v1/${pathAndQuery}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal", ...opts.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const STOP = new Set("with from your that this each every then them they their have more only when also into over until before after free earn food order orders online first next visit night daily weekdays weekday available menu".split(" "));
const norm = s => s.toLowerCase()
  .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;|&#8212;|&mdash;|[–—]/g, "-")
  .replace(/&#8217;|&rsquo;|’/g, "'").replace(/\s+/g, " ");
const pageText = html => norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));

// Prices in the description must all appear, and at least half of its meaningful words
// (40% when the restaurant's name is on the page, as in press round-ups).
function stillThere(description, restaurant, text) {
  const d = norm(description);
  // Menus often drop the "$" ("Steak Frites — 24"), so match the number on its own.
  const prices = [...new Set((d.match(/\$\d+(?:\.\d+)?|\d+¢/g) || []).map(p => p.replace(/[$¢]/g, "")))];
  const hasPrice = p => new RegExp(`(^|[^\\d.])${p.replace(".", "\\.")}(?![\\d]|\\.\\d)`).test(text);
  const words = [...new Set(d.replace(/[^a-z0-9' ]/g, " ").split(" ").filter(w => w.length >= 4 && !STOP.has(w)))];
  const pricesHit = prices.filter(hasPrice).length;
  const hit = words.filter(w => text.includes(w)).length;
  const ratio = words.length ? hit / words.length : 1;
  const named = text.includes(norm(restaurant));
  return { found: pricesHit === prices.length && ratio >= (named ? 0.4 : 0.5), detail: `prices ${pricesHit}/${prices.length}, words ${hit}/${words.length}` };
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow", signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BostonLifesaverBot/1.0; +https://boston-lifesaver.vercel.app)", Accept: "text/html" },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { text: pageText(await res.text()) };
  } catch (e) {
    return { error: e.name === "TimeoutError" ? "timeout" : e.message };
  }
}

const daysSince = d => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);

(async () => {
  if (!rightHour()) return console.log("Not 7am in Boston for this trigger, skipping.");
  if (DRY && process.env.GITHUB_ACTIONS) throw new Error("Repo secret SUPABASE_SERVICE_ROLE_KEY is missing (Settings → Secrets and variables → Actions).");
  const deals = await db("deals?select=id,restaurant_id,description,source_url,last_checked,status,restaurants(name)&status=in.(sourced,verified)&order=id");
  console.log(`${DRY ? "DRY RUN (no secret key): " : ""}checking ${deals.length} live deals on ${today}\n`);

  const pages = new Map();
  const rows = [], confirmed = [], rejected = [];
  for (const d of deals) {
    if (!pages.has(d.source_url)) pages.set(d.source_url, await fetchPage(d.source_url));
    const page = pages.get(d.source_url);
    let result;
    if (page.error) result = `skipped (${page.error})`;
    else {
      const { found, detail } = stillThere(d.description, d.restaurants.name, page.text);
      if (found) { confirmed.push(d.id); result = `still there (${detail})`; }
      else if (daysSince(d.last_checked) >= DAYS_BEFORE_REJECT - 1) { rejected.push(d.id); result = `GONE ${daysSince(d.last_checked) + 1} days -> rejected (${detail})`; }
      else result = `not found, last seen ${d.last_checked}, waiting (${detail})`;
    }
    rows.push(`#${d.id} r${d.restaurant_id}: ${result}`);
  }
  console.log(rows.join("\n"));

  if (!DRY) {
    if (confirmed.length) await db(`deals?id=in.(${confirmed})`, { method: "PATCH", body: JSON.stringify({ last_checked: today }) });
    if (rejected.length) await db(`deals?id=in.(${rejected})`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) });
  }
  const summary = `\n${confirmed.length} confirmed, ${rejected.length} rejected, ${deals.length - confirmed.length - rejected.length} unchanged${DRY ? " (dry run, nothing written)" : ""}.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Deals check ${today}\n\n\`\`\`\n${rows.join("\n")}\n\`\`\`\n${summary}\n`);
})().catch(e => { console.error(e); process.exit(1); });
