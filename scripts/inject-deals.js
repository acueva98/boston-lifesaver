// Copies data/deals.json into web/index.html (between the DEALS:START / DEALS:END markers).
// Run after editing deals:  node scripts/inject-deals.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = JSON.parse(fs.readFileSync(path.join(root, "data/deals.json"), "utf8"));
const page = path.join(root, "web/index.html");

const deals = {}, closed = {};
for (const r of src.restaurants) {
  if (r.status === "closed" && r.closed_source) closed[r.id] = r.closed_source;
  if (r.deals && r.deals.length) deals[r.id] = r.deals.map(({ type, text, source }) => ({ type, text, source }));
}
const block = `/* DEALS:START */\nconst DEALS = ${JSON.stringify({ checked: src.last_checked, deals, closed })};\n/* DEALS:END */`;

const html = fs.readFileSync(page, "utf8");
const re = /\/\* DEALS:START \*\/[\s\S]*?\/\* DEALS:END \*\//;
if (!re.test(html)) throw new Error("DEALS markers not found in web/index.html");
fs.writeFileSync(page, html.replace(re, () => block));
console.log(`Injected deals for ${Object.keys(deals).length} restaurants (${Object.keys(closed).length} reported closed).`);
