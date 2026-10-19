// "Ask Boston Lifesaver": a chat that recommends restaurants from the list on this page.
// No AI and no server: it reads the question (Spanish or English) for cuisine, walking time,
// price, deals and place, then filters R and DEALS (defined in index.html) and explains the picks.
// Walking time is an estimate: straight-line distance × 1.3 for street detours, at 3 mph.

const ASK_MIN_PER_MILE = 20 * 1.3;
const walkMin = d => Math.max(1, Math.round(d * ASK_MIN_PER_MILE));

// Cuisine words → pattern on the restaurant's cuisine text
const ASK_CUISINES = [
  [/mexic|taco|taquer|burrito|quesadilla|enchilada/, /mexican/i, "mexicana", "Mexican"],
  [/japo|japan|sushi|ramen|izakaya/, /japanese|sushi|ramen|izakaya/i, "japonesa", "Japanese"],
  [/chin|dim ?sum|dumpling|hunan/, /chinese|dim sum|dumpling/i, "china", "Chinese"],
  [/itali|pasta|pizz/, /italian|pizza/i, "italiana o pizza", "Italian or pizza"],
  [/\bindi|tikka|curry/, /indian|curry/i, "india", "Indian"],
  [/thai|tailand/, /thai/i, "tailandesa", "Thai"],
  [/griega|greek|gyro/, /greek|gyro/i, "griega", "Greek"],
  [/corean|korean/, /korean/i, "coreana", "Korean"],
  [/vietnam|pho\b/, /vietnamese/i, "vietnamita", "Vietnamese"],
  [/mariscos?|pescado|seafood|fish|oyster|ostra|ostion|lobster|langosta/, /seafood|oyster|fish|lobster/i, "de mariscos", "seafood"],
  [/hamburgues|burger/, /burger/i, "de hamburguesas", "burgers"],
  [/vegetarian|vegan|veggie/, /vegetarian/i, "vegetariana", "vegetarian"],
  [/mediterr|halal/, /mediterranean|halal/i, "mediterránea", "Mediterranean"],
  [/árab|arab|libanes|lebanese|middle eastern|medio oriente|israel|falafel/, /middle eastern|lebanese|israeli|afghan|turkish/i, "de Medio Oriente", "Middle Eastern"],
  [/peru|ceviche/, /peruvian|ceviche/i, "peruana", "Peruvian"],
  [/brasil|brazil/, /brazilian/i, "brasileña", "Brazilian"],
  [/latin/, /latin|mexican|brazilian|peruvian/i, "latinoamericana", "Latin American"],
  [/franc|french/, /french/i, "francesa", "French"],
  [/steak|carne|parrilla|churrasc/, /steak|churrasc/i, "de carnes", "steak"],
  [/etiop|ethiop|eritre/, /ethiopian|eritrean/i, "etíope", "Ethiopian"],
  [/afgan|afghan/, /afghan/i, "afgana", "Afghan"],
  [/brunch|desayuno|breakfast/, /brunch|breakfast/i, "de desayuno o brunch", "breakfast or brunch"],
  [/caf[eé]|coffee|panader|bakery/, /cafe|bakery/i, "café o panadería", "cafe or bakery"],
];

// Places people may say "near ..." about (approximate centers)
const ASK_PLACES = [
  [/sloan/, "MIT Sloan", 42.3612, -71.0826],
  [/\bmit\b/, "MIT", 42.3601, -71.0942],
  [/kendall/, "Kendall Square", 42.3625, -71.0862],
  [/central/, "Central Square", 42.3653, -71.1037],
  [/harvard/, "Harvard Square", 42.3732, -71.1189],
  [/porter/, "Porter Square", 42.3884, -71.1191],
  [/inman/, "Inman Square", 42.3736, -71.101],
  [/fenway park/, "Fenway Park", 42.3467, -71.0972],
  [/fenway|kenmore/, "Fenway", 42.3462, -71.0975],
  [/\bbu\b|boston university/, "Boston University", 42.3505, -71.1054],
  [/northeastern/, "Northeastern", 42.3398, -71.0892],
  [/copley/, "Copley Square", 42.3499, -71.0774],
  [/prudential|\bpru\b/, "Prudential Center", 42.3471, -71.0825],
  [/back ?bay|newbury/, "Back Bay", 42.3496, -71.0812],
  [/east cambridge|lechmere/, "East Cambridge", 42.3705, -71.0805],
];

const ASK_DEAL_WORDS = /descuento|oferta|promo|deal|discount|happy ?hour|rewards?|lealtad|loyalty|2x1|especial|special|prix|precio fijo|menu fijo/;
const ASK_DEAL_TYPES = [
  [/happy ?hour/, ["happy-hour"]],
  [/almuerzo|lunch/, ["lunch"]],
  [/late ?night|trasnoche|nocturn|madrugada/, ["late-night"]],
  [/prix|men[uú] fijo|precio fijo/, ["prix-fixe"]],
  [/puntos|points|rewards?|lealtad|loyalty/, ["rewards"]],
];

const fold = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function askParse(text) {
  const t = fold(text), raw = text.toLowerCase(), q = {};
  q.es = /[¿¡ñáéíóú]/.test(raw) || /\b(me|puedes|recomienda|recomiendas|restaurante?s?|comida|que|cerca|caminando|minutos|descuentos?|barato|donde|algun[oa]?|algo|quiero|busco|quisiera|comer|hay|hola|buenas|gracias|en|del|con|para|por|y)\b/.test(t);
  const c = ASK_CUISINES.find(([w]) => w.test(t));
  if (c) q.cuisine = { re: c[1], es: c[2], en: c[3] };
  const p = ASK_PLACES.find(([w]) => w.test(t));
  if (p) q.place = { name: p[1], lat: p[2], lng: p[3] };

  const min = t.match(/(\d+)\s*(?:min|minutos|minutes|mins)\b/);
  const mi = t.match(/(\d+(?:[.,]\d+)?)\s*(?:mi|millas?|miles?)\b/);
  const km = t.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kilometros?)\b/);
  const blocks = t.match(/(\d+)\s*(?:cuadras?|blocks?)\b/);
  if (min) q.maxMin = +min[1];
  else if (mi) q.maxMin = walkMin(parseFloat(mi[1].replace(",", ".")));
  else if (km) q.maxMin = walkMin(parseFloat(km[1].replace(",", ".")) / 1.609);
  else if (blocks) q.maxMin = +blocks[1] * 2;
  q.near = q.maxMin != null || /cerca|cercan|caminando|a pie|walk|near|close to|closest|nearby|around here|por aqui/.test(t);

  if (ASK_DEAL_WORDS.test(t)) {
    q.deals = true;
    const dt = ASK_DEAL_TYPES.find(([w]) => w.test(t));
    if (dt) q.dealTypes = dt[1];
    q.dealsStrict = !!dt || /\bsolo\b|\bonly\b|\bmust\b|tiene que|que si tengan|obligatori/.test(t);
  }

  const under = t.match(/(?:menos de|under|less than|below|hasta|max\w*)\s*(?:us)?\$\s*(\d+)|(\d+)\s*(?:dolares|dollars|usd|bucks)\b/);
  if (under) {
    const n = +(under[1] || under[2]);
    q.prices = n <= 15 ? ["$"] : n <= 30 ? ["$", "$$"] : n <= 60 ? ["$", "$$", "$$$"] : null;
  } else if (/barat|economic|cheap|inexpensive|affordable|budget|no muy caro|not too expensive|accesible/.test(t)) q.prices = ["$", "$$"];
  else if (/elegante|fancy|upscale|caro|expensive|special occasion|ocasion especial|fine dining|lujo/.test(t)) q.prices = ["$$$", "$$$$"];
  else { const d = raw.match(/(?:^|\s)(\${1,4})(?=\s|$|[,.?!])/); if (d) q.prices = [d[1]]; }
  if (/mas barat|cheaper|cheapest|mas economic/.test(t)) q.cheapest = true;
  if (/^(?:y|and|what about|how about|and what about)\b/.test(t.replace(/^[¿¡\s]+/, "")) && t.split(/\s+/).length < 8) q.followUp = true;
  return q;
}

// Origin for walking times: a place named in the question, else the device location
function askOrigin(q) {
  if (q.place) return Promise.resolve({ lat: q.place.lat, lng: q.place.lng, label: q.place.name });
  if (state.here) return Promise.resolve({ ...state.here, label: null });
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise(ok => navigator.geolocation.getCurrentPosition(
    pos => { state.here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; showYou(); ok({ ...state.here, label: null }); },
    () => ok(null),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }));
}

function askPick(q, origin) {
  const dealsOf = r => dealsFor(r).filter(d => !q.dealTypes || q.dealTypes.includes(d.type));
  const pool = R.filter(r => !DEALS.closed[r.id])
    .filter(r => !q.cuisine || q.cuisine.re.test(r.cuisine))
    .filter(r => !q.prices || q.prices.includes(r.price))
    .map(r => ({ ...r, d: origin ? miles(origin, r) : null, deals: dealsOf(r) }));
  pool.forEach(r => r.min = r.d == null ? null : walkMin(r.d));
  const limit = q.maxMin ?? (q.near || q.place ? 15 : null);
  const inRange = origin && limit ? pool.filter(r => r.min <= limit) : pool;
  const byDeal = (a, b) => (q.deals ? (b.deals.length > 0) - (a.deals.length > 0) : 0);
  const byDist = (a, b) => (a.d ?? 0) - (b.d ?? 0);
  const byPrice = (a, b) => a.price.length - b.price.length;
  const sort = rs => rs.slice().sort((a, b) => byDeal(a, b) || (q.cheapest ? byPrice(a, b) : 0) || byDist(a, b) || byPrice(a, b));
  const keep = rs => q.deals && q.dealsStrict ? rs.filter(r => r.deals.length) : rs;
  const ranked = sort(keep(inRange));
  const nearestOutside = origin && limit && !ranked.length ? keep(pool.filter(r => r.min > limit)).sort(byDist)[0] : null;
  return { ranked, limit, nearestOutside, poolSize: pool.length };
}

const ASK_PRICE = { es: { "$": "menos de $15", "$$": "$15–30", "$$$": "$30–60", "$$$$": "más de $60" }, en: { "$": "under $15", "$$": "$15–30", "$$$": "$30–60", "$$$$": "$60+" } };

function askCard(r, es) {
  const lang = es ? "es" : "en";
  const maps = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(r.name + ", " + r.address);
  const walk = r.min != null ? `<span class="ask-walk">🚶 ~${r.min} min</span>` : "";
  const deals = r.deals.length
    ? r.deals.map(d => `<span class="deal"><b>${DEAL_LABEL[d.type] || "Deal"}</b>${esc(d.text)}</span>`).join("")
    : `<span class="ask-nodeal">${es ? "Sin descuentos registrados" : "No deals on file"}</span>`;
  return `<li class="ask-card">
    <div class="ask-card-top"><b>${esc(r.name)}</b>${walk}</div>
    <span class="meta">${esc(r.cuisine)} · ${esc(r.hood)} · <span title="${ASK_PRICE[lang][r.price]} ${es ? "por persona" : "per person"}">${r.price}</span></span>
    <span class="deals">${deals}</span>
    <span class="ask-links"><button type="button" class="ask-show" data-jump="${r.id}">${es ? "Ver en la lista" : "Show in list"}</button><a href="${maps}" target="_blank" rel="noopener">${es ? "Cómo llegar" : "Directions"} ↗</a></span>
  </li>`;
}

function askAnswer(q, origin, res) {
  const es = q.es, top = res.ranked.slice(0, 3);
  const what = q.cuisine ? (es ? `de comida ${q.cuisine.es}`.replace("de comida de ", "de ") : `${q.cuisine.en} `) : "";
  const where = origin?.label ? (es ? ` de ${origin.label}` : ` of ${origin.label}`) : (es ? " de ti" : " of you");
  const within = res.limit && origin ? (es ? ` a ${res.limit} min o menos caminando${where}` : ` within a ${res.limit}-minute walk${where}`) : "";
  // Without a location, say so first and offer places to measure from instead
  const noLoc = (q.near || q.maxMin) && !origin;
  const notes = noLoc ? [es
    ? "No pude usar tu ubicación, así que no filtré por distancia. Elige un lugar abajo o permite la ubicación en el navegador y vuelve a preguntar."
    : "I couldn't use your location, so I didn't filter by distance. Pick a place below, or allow location in your browser and ask again."] : [];
  const chips = noLoc ? ["MIT", "Kendall", "Central", "Harvard", "Fenway", "Back Bay"].map(p => es ? `y cerca de ${p}` : `and near ${p}`) : [];

  if (!top.length) {
    let msg = es ? `No encontré restaurantes ${what}${within}` : `I couldn't find ${what}restaurants${within}`;
    if (q.deals && q.dealsStrict) msg += es ? " con descuentos" : " with deals";
    msg += ".";
    if (res.nearestOutside) {
      const n = res.nearestOutside;
      msg += es ? ` El más cercano es ${n.name}, a unos ${n.min} min caminando.` : ` The closest is ${n.name}, about a ${n.min}-minute walk.`;
      return { text: [...notes, msg], cards: [askCard(n, es)], chips };
    }
    return { text: [...notes, msg], cards: [], chips };
  }

  const n = res.ranked.length;
  let msg = es
    ? `${n === 1 ? "Encontré 1 restaurante" : `Encontré ${n} restaurantes`} ${what}${within}.`
    : `I found ${n} ${what}restaurant${n === 1 ? "" : "s"}${within}.`;
  msg = msg.replace(/\s+\./, ".").replace(/\s{2,}/g, " ");
  if (q.deals) {
    const withDeals = res.ranked.filter(r => r.deals.length).length;
    if (!withDeals) msg += n === 1
      ? (es ? " No tiene descuentos registrados por ahora, pero es la mejor opción:" : " It has no deal on file right now, but it's the best match:")
      : (es ? " Ninguno tiene descuentos registrados por ahora, pero estas son las mejores opciones:" : " None of them has a deal on file right now, but here are the best options:");
    else if (withDeals === n) msg += es ? (n === 1 ? " ¡Y tiene descuento!" : " Todos tienen descuentos.") : (n === 1 ? " And it has a deal!" : " All of them have deals.");
    else msg += es ? ` ${withDeals === 1 ? "1 tiene descuento y aparece primero" : `${withDeals} tienen descuentos y aparecen primero`}.` : ` ${withDeals} ${withDeals === 1 ? "has a deal and is" : "have deals and are"} listed first.`;
  }
  if (n > 3) msg += es ? ` Te muestro los ${top.length} mejores.` : ` Here are the top ${top.length}.`;
  const foot = [
    origin ? (es ? "Tiempos caminando aproximados." : "Walking times are estimates.") : "",
    es ? `Descuentos revisados el ${DEALS.checked}; confírmalos antes de ir.` : `Deals checked ${DEALS.checked}; confirm before you go.`,
  ].filter(Boolean).join(" ");
  return { text: [...notes, msg], cards: top.map(r => askCard(r, es)), foot, chips };
}

const ASK_HELP = {
  es: "Pregúntame por tipo de comida, distancia, precio o descuentos. Por ejemplo: “comida japonesa barata cerca del MIT” o “¿dónde hay happy hour a 10 minutos caminando?”.",
  en: "Ask me about cuisine, distance, price or deals. For example: “cheap Japanese near MIT” or “happy hour within a 10-minute walk”.",
};
let askLast = null;

async function askHandle(text) {
  let q = askParse(text);
  const understood = q.cuisine || q.near || q.deals || q.prices || q.place || q.cheapest;
  if (!understood) return askSay("bot", [ASK_HELP[q.es ? "es" : "en"]]);
  if (q.followUp && askLast) {
    const keep = { ...askLast };
    for (const k of Object.keys(q)) if (q[k] != null && q[k] !== false) keep[k] = q[k];
    keep.es = q.es || askLast.es; q = keep;
  }
  askLast = q;
  const wantsDistance = q.near || q.place;
  const thinking = wantsDistance && !q.place && !state.here ? askSay("bot", [q.es ? "Buscando tu ubicación…" : "Finding your location…"], [], "", true) : null;
  const origin = wantsDistance ? await askOrigin(q) : (state.here ? { ...state.here, label: null } : null);
  if (thinking) thinking.remove();
  const from = wantsDistance ? origin : null;
  let res = askPick(q, from), relaxed = "";
  // Nothing fits: try again without the price filter before giving up, and say so
  if (!res.ranked.length && q.prices) {
    const loose = askPick({ ...q, prices: null }, from);
    if (loose.ranked.length) {
      res = loose;
      relaxed = q.es ? `No hay opciones en ese rango de precio (${q.prices.join(", ")}), así que te muestro otras sin filtrar por precio.`
        : `Nothing in that price range (${q.prices.join(", ")}), so here are options at any price.`;
    }
  }
  const a = askAnswer(q, origin, res);
  if (relaxed) a.text.unshift(relaxed);
  askSay("bot", a.text, a.cards, a.foot, false, a.chips);
}

function askSay(who, lines, cards = [], foot = "", temp = false, chips = []) {
  const li = document.createElement("li");
  li.className = `ask-msg ${who}${temp ? " temp" : ""}`;
  li.innerHTML = lines.map(l => `<p>${esc(l)}</p>`).join("") +
    (cards.length ? `<ul class="ask-cards">${cards.join("")}</ul>` : "") +
    (foot ? `<p class="ask-foot">${esc(foot)}</p>` : "") +
    (chips.length ? `<div class="ask-chips">${chips.map(c => `<button type="button" class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : "");
  $("#ask-log").appendChild(li);
  $("#ask-log").scrollTop = $("#ask-log").scrollHeight;
  return li;
}

function askSetup() {
  const lang = (navigator.language || "en").startsWith("es") ? "es" : "en";
  const examples = lang === "es"
    ? ["¿Me puedes recomendar un restaurant de comida mexicana que esté a 10 minutos máximo caminando? Ojalá que tenga descuentos", "Algo barato cerca del MIT", "Happy hour en Back Bay"]
    : ["Mexican food within a 10-minute walk, ideally with a deal", "Something cheap near MIT", "Happy hour in Back Bay"];
  document.body.insertAdjacentHTML("beforeend", `
    <button type="button" class="ask-fab" id="ask-open" aria-haspopup="dialog" aria-controls="ask-panel">💬 ${lang === "es" ? "Pregúntame" : "Ask me"}</button>
    <section class="ask-panel" id="ask-panel" role="dialog" aria-labelledby="ask-title" hidden>
      <header class="ask-head"><div><h2 id="ask-title">Ask Boston Lifesaver</h2><p class="dlg-sub">${lang === "es" ? "Recomendaciones según la lista de esta página" : "Recommendations from the list on this page"}</p></div><button type="button" class="x" id="ask-close" aria-label="Close">×</button></header>
      <ul class="ask-log" id="ask-log" aria-live="polite"></ul>
      <div class="ask-examples" id="ask-examples">${examples.map(e => `<button type="button" class="chip">${esc(e)}</button>`).join("")}</div>
      <form class="ask-form" id="ask-form"><input id="ask-input" autocomplete="off" maxlength="300" placeholder="${lang === "es" ? "Ej.: sushi cerca de Kendall con descuento" : "E.g. sushi near Kendall with a deal"}" aria-label="${lang === "es" ? "Tu pregunta" : "Your question"}"><button class="btn primary" type="submit">${lang === "es" ? "Enviar" : "Send"}</button></form>
    </section>`);
  askSay("bot", [lang === "es"
    ? "¡Hola! Te ayudo a elegir dónde comer. " + ASK_HELP.es
    : "Hi! I can help you pick where to eat. " + ASK_HELP.en]);

  const panel = $("#ask-panel"), open = $("#ask-open");
  const toggle = show => { panel.hidden = !show; open.hidden = show; if (show) $("#ask-input").focus(); else open.focus(); };
  open.addEventListener("click", () => toggle(true));
  $("#ask-close").addEventListener("click", () => toggle(false));
  panel.addEventListener("keydown", e => { if (e.key === "Escape") toggle(false); });
  const send = text => {
    text = text.trim(); if (!text) return;
    askSay("user", [text]);
    $("#ask-examples").hidden = true;
    askHandle(text);
  };
  $("#ask-form").addEventListener("submit", e => { e.preventDefault(); send($("#ask-input").value); $("#ask-input").value = ""; });
  $("#ask-examples").addEventListener("click", e => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  $("#ask-log").addEventListener("click", e => {
    const c = e.target.closest("[data-ask]"); if (c) return send(c.dataset.ask);
    const b = e.target.closest("[data-jump]"); if (!b) return;
    if (matchMedia("(max-width: 820px)").matches) toggle(false);
    jump(+b.dataset.jump);
  });
}
askSetup();
