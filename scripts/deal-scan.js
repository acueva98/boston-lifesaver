// Helper for the daily "find new deals" task (Claude scheduled task, see supabase/README.md).
//   node scripts/deal-scan.js batch            -> today's ~15 restaurants (id % 7 rotation) with their current deals
//   node scripts/deal-scan.js add '<json>'     -> insert one new deal as 'sourced' (validated, skips duplicates)
//   node scripts/deal-scan.js none <id> "<notes>" -> record that a restaurant was checked and has no deals
// Writes need SUPABASE_SERVICE_ROLE_KEY, from the environment or ~/.config/boston-lifesaver/.env.
// Without it, "add" and "none" only print what they would do.
const fs = require("fs");
const os = require("os");
const path = require("path");

const cfgFile = fs.readFileSync(path.join(__dirname, "../web/config.js"), "utf8");
const URL_ = cfgFile.match(/supabaseUrl:\s*"([^"]+)"/)[1];
const ANON = cfgFile.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];
const envFile = path.join(os.homedir(), ".config/boston-lifesaver/.env");
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  (fs.existsSync(envFile) && (fs.readFileSync(envFile, "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m) || [])[1]?.trim());
const TYPES = ["happy-hour", "lunch", "prix-fixe", "weekly-special", "late-night", "discount", "rewards"];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

async function db(q, opts = {}) {
  const key = opts.method ? SECRET : ANON;
  const res = await fetch(`${URL_}/rest/v1/${q}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.status === 201 || res.status === 204 ? null : res.json();
}
const write = async (what, q, opts) => SECRET ? (await db(q, opts), console.log(`OK: ${what}`)) : console.log(`DRY RUN (no secret key), would ${what}`);
const words = s => new Set(s.toLowerCase().replace(/[^a-z0-9$ ]/g, " ").split(/\s+/).filter(w => w.length >= 4 || w.startsWith("$")));

const commands = {
  async batch() {
    const group = Math.floor(Date.parse(today) / 864e5) % 7;
    const rs = await db(`restaurants?select=id,name,neighborhood,address,source,deal_check,deal_notes&is_closed=eq.false&order=id`);
    const ds = await db(`deals?select=restaurant_id,type,description,source_url&status=in.(sourced,verified)`);
    const batch = rs.filter(r => r.id % 7 === group).map(r => ({ ...r, current_deals: ds.filter(d => d.restaurant_id === r.id) }));
    console.log(JSON.stringify({ date: today, group, restaurants: batch }, null, 2));
  },

  async add(json) {
    const d = JSON.parse(json);
    if (!Number.isInteger(d.restaurant_id)) throw new Error("restaurant_id must be an integer");
    if (!TYPES.includes(d.type)) throw new Error(`type must be one of: ${TYPES.join(", ")}`);
    if (typeof d.description !== "string" || d.description.length < 10 || d.description.length > 300) throw new Error("description must be 10–300 characters");
    if (!/^https?:\/\/\S+$/.test(d.source_url || "")) throw new Error("source_url must be a full http(s) URL");
    const [r] = await db(`restaurants?select=id,name,is_closed&id=eq.${d.restaurant_id}`);
    if (!r || r.is_closed) throw new Error(`restaurant ${d.restaurant_id} not found or closed`);
    // Skip if a live deal of the same type already says mostly the same thing.
    const existing = await db(`deals?select=id,type,description&restaurant_id=eq.${d.restaurant_id}&status=in.(sourced,verified)`);
    const mine = words(d.description);
    const dup = existing.find(e => e.type === d.type &&
      [...words(e.description)].filter(w => mine.has(w)).length >= 0.5 * Math.min(mine.size, words(e.description).size));
    if (dup) return console.log(`SKIPPED: looks like existing deal #${dup.id} ("${dup.description}")`);
    const row = { restaurant_id: d.restaurant_id, type: d.type, description: d.description.trim(), source_url: d.source_url,
      source_date: d.source_date || "current site", status: "sourced", last_checked: today };
    await write(`add ${d.type} deal for ${r.name}: ${row.description}`, "deals", { method: "POST", body: JSON.stringify(row) });
    await write(`mark ${r.name} as having deals`, `restaurants?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ deal_check: "deals" }) });
  },

  async none(id, notes = "") {
    if (!/^\d+$/.test(id || "")) throw new Error("usage: none <restaurant_id> \"<notes>\"");
    const ds = await db(`deals?select=id&restaurant_id=eq.${id}&status=in.(sourced,verified)`);
    const body = { deal_notes: `${today}: ${notes}`.slice(0, 1000), ...(ds.length ? {} : { deal_check: "none" }) };
    await write(`note no new deals for restaurant ${id}`, `restaurants?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(body) });
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) { console.error("usage: node scripts/deal-scan.js batch | add '<json>' | none <id> \"<notes>\""); process.exit(1); }
commands[cmd](...args).catch(e => { console.error(`ERROR: ${e.message}`); process.exit(1); });
