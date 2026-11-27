import { state, save, idb } from "./store.js";
import { $, $$, esc, award, toast, back, beep, confetti, pin, pick } from "./ui.js";
import { LABS, STEMS, TRIAGE } from "./content.js";
import { shuffle } from "./notes.js";

const GAMES = [
  { id: "labs", name: "Lab Lightning", tag: "60 seconds", body: "A lab value flashes up. Low, normal or high? Build a combo before the clock runs out.", art: "⚡" },
  { id: "triage", name: "Who First?", tag: "Prioritization", body: "Four clients, one nurse. Pick who you see first, then read why.", art: "🚑" },
  { id: "stems", name: "Stem Snap", tag: "Pharm", body: "Name the drug class from the stem. Every answer comes with the nursing pearl.", art: "💊" },
  { id: "dose", name: "Dose Drill", tag: "Med math", body: "Endless dosage problems: tablets, liquids, weight-based, drip rates, heparin.", art: "💉" },
  { id: "match", name: "Pair Rounds", tag: "Uses your decks", body: "Match terms to answers against the clock, using any deck, including ones made from your notes.", art: "🧩" },
];

export async function renderGames(el, [id], params) {
  const g = { labs, triage, stems, dose, match }[id];
  if (g) return g(el, params);
  el.innerHTML = `
  <section class="page-head wrap"><p class="eyebrow"><span class="dot"></span>Break Room</p>
    <h1 class="display md">Take a break. <em>Keep the knowledge.</em></h1>
    <p class="lede">Short games for tired brains. Each one drills something the NCLEX loves to ask.</p></section>
  <section class="wrap"><div class="games">${GAMES.map((g, i) => `
    <a class="game g${i}" href="#/games/${g.id}"><span class="game-art">${g.art}</span><span class="label">${esc(g.tag)}</span><h3>${esc(g.name)}</h3><p>${esc(g.body)}</p>
    <span class="game-best">${state.best[g.id] != null ? `Best: <b>${state.best[g.id]}</b> ${({ labs: "pts", triage: "/ 5", stems: "/ 10", dose: "in a row", match: "s" })[g.id]}` : "Not played yet"}</span></a>`).join("")}</div></section>`;
}

function setBest(id, score) { if (score > (state.best[id] ?? -1)) { state.best[id] = score; save(); return true; } return false; }
const shell = (el, title, sub) => { el.innerHTML = `<section class="page-head wrap tight">${back("#/games", "Break Room")}<h1 class="display sm">${title}</h1>${sub ? `<p class="lede">${sub}</p>` : ""}</section><section class="wrap narrow" id="g"></section>`; return $("#g"); };
const endCard = (g, score, unit, msg, again) => {
  const best = setBest(g, score);
  return `<div class="finish"><div class="finish-score">${score}<small>${unit}</small></div><h2>${best ? "New personal best!" : msg}</h2>
  <p>Best: ${state.best[g]}${unit === "pts" ? " pts" : ""}</p><div class="cta center"><button class="btn primary" id="again">${again}</button><a class="btn" href="#/games">Break room</a></div></div>`;
};

/* ---------------- Lab Lightning ---------------- */
function labValue() {
  const L = pick(LABS); const span = L.hi - L.lo;
  for (let t = 0; t < 20; t++) {
    const zone = Math.floor(Math.random() * 3); let v;
    if (zone === 0) v = Math.max(L.lo * 0.4, L.lo - span * (0.15 + Math.random() * 0.65));
    else if (zone === 1) v = L.lo + span * (0.1 + Math.random() * 0.8);
    else v = L.hi + span * (0.15 + Math.random() * 0.65);
    v = Math.round(v / L.step) * L.step; v = +v.toFixed(decimals(L.step));
    if (v === L.lo || v === L.hi) continue;
    return { L, v, zone: v < L.lo ? 0 : v > L.hi ? 2 : 1 };
  }
  return labValue();
}
const decimals = (s) => (String(s).split(".")[1] || "").length;
const fmt = (L, v) => (L.step >= 100 ? v.toLocaleString() : v.toFixed(decimals(L.step)));

function labs(el) {
  const g = shell(el, "Lab Lightning", "Low, normal or high? Arrow keys work too: ← low, ↓ normal, → high.");
  g.innerHTML = `<div class="finish"><div class="finish-ico">⚡</div><h2>60 seconds. As many as you can.</h2><p>Combos of 5+ score double. Adult reference ranges; if your program's ranges differ, trust your program.</p><button class="btn primary" id="start">Start</button></div>`;
  $("#start").onclick = play;
  function play() {
    let score = 0, combo = 0, n = 0, cur, timeLeft = 60, lock = false;
    g.innerHTML = `<div class="hud"><span>Score <b id="sc">0</b></span><span id="cb" class="combo"></span><span class="timer"><b id="tm">60</b>s</span></div>
      <div class="labcard" id="lc"></div>
      <div class="lab-btns"><button class="lab-b lo" data-z="0">↓ Low</button><button class="lab-b ok" data-z="1">Normal</button><button class="lab-b hi" data-z="2">↑ High</button></div>
      <div id="fb" class="lab-fb" aria-live="polite"></div>`;
    const tick = setInterval(() => { timeLeft--; $("#tm") && ($("#tm").textContent = timeLeft); if (timeLeft <= 0) end(); }, 1000);
    const key = (e) => { const z = { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 }[e.key]; if (z !== undefined) { e.preventDefault(); answer(z); } };
    document.addEventListener("keydown", key);
    document.addEventListener("leave", () => { clearInterval(tick); document.removeEventListener("keydown", key); }, { once: true });
    $$(".lab-b").forEach((b) => (b.onclick = () => answer(+b.dataset.z)));
    const nextQ = () => { cur = labValue(); $("#lc").innerHTML = `<span class="label">${esc(cur.L.k)}${cur.L.therapeutic ? " · therapeutic range" : ""}</span><div class="lab-v"><span class="lab-ab">${esc(cur.L.ab)}</span> ${fmt(cur.L, cur.v)} <small>${esc(cur.L.unit)}</small></div>`; $("#lc").classList.remove("pop"); void $("#lc").offsetWidth; $("#lc").classList.add("pop"); };
    function answer(z) {
      if (lock || !cur) return; n++;
      const ok = z === cur.zone; const L = cur.L;
      if (ok) { combo++; score += combo >= 5 ? 2 : 1; beep(true); }
      else { combo = 0; beep(false); }
      $("#sc").textContent = score; $("#cb").textContent = combo >= 5 ? `×2 combo ${combo}` : combo >= 2 ? `combo ${combo}` : "";
      $("#fb").className = "lab-fb " + (ok ? "good" : "bad");
      $("#fb").innerHTML = `<b>${ok ? "Yes." : "Not quite."}</b> ${esc(L.ab)} ${fmt(L, cur.v)} is ${["low", "normal", "high"][cur.zone]}. Normal ${fmt(L, L.lo)}–${fmt(L, L.hi)} ${esc(L.unit)}. ${cur.zone !== 1 ? esc(cur.zone === 0 ? L.low : L.high) : ""}`;
      if (!ok) { lock = true; setTimeout(() => { lock = false; nextQ(); }, 1400); } else nextQ();
    }
    function end() {
      clearInterval(tick); document.removeEventListener("keydown", key);
      award(Math.min(40, score), "games"); if (score >= 20) pin("labs"); if (score >= 15) confetti();
      g.innerHTML = endCard("labs", score, "pts", score >= 15 ? "Lightning fast." : "Ranges stick with reps. Again?", "Play again");
      $("#again").onclick = play;
    }
    nextQ();
  }
}

/* ---------------- Who First? ---------------- */
function triage(el) {
  const g = shell(el, "Who First?", "Airway, breathing, circulation. Unexpected beats expected. Acute beats chronic.");
  let rounds = shuffle(TRIAGE).slice(0, 5), i = 0, score = 0;
  const show = () => {
    const s = rounds[i]; if (!s) return end();
    const order = shuffle(s.clients.map((_, k) => k));
    g.innerHTML = `<div class="hud"><span>Round <b>${i + 1}</b> / ${rounds.length}</span><span>Score <b>${score}</b></span></div>
      <p class="label center">${esc(s.title)} · Who do you see first?</p>
      <div class="census">${order.map((k, n) => `<button class="bed" data-k="${k}"><span class="bed-n">Rm ${(n + 1) * 100 + 2 + i * 10}</span><span>${esc(s.clients[k])}</span></button>`).join("")}</div><div id="why"></div>`;
    $$(".bed").forEach((b) => (b.onclick = () => {
      const k = +b.dataset.k; const ok = k === s.first; if (ok) score++;
      $$(".bed").forEach((x) => { x.disabled = true; x.classList.add(+x.dataset.k === s.first ? "right" : x === b ? "wrong" : "dim"); });
      beep(ok); award(ok ? 8 : 3, "games");
      $("#why").innerHTML = `<div class="rationale ${ok ? "ok" : "no"}"><b>${ok ? "Right call." : "See the highlighted client first."}</b><p>${esc(s.why)}</p></div><button class="btn primary" id="nx">${i + 1 < rounds.length ? "Next round" : "Finish"}</button>`;
      $("#nx").onclick = () => { i++; show(); };
    }));
  };
  const end = () => {
    if (score === rounds.length) { pin("triage"); confetti(); }
    g.innerHTML = endCard("triage", score, `/${rounds.length}`, score >= 4 ? "Charge-nurse instincts." : "Priority is a skill. Run it back?", "New shift");
    $("#again").onclick = () => { rounds = shuffle(TRIAGE).slice(0, 5); i = 0; score = 0; show(); };
  };
  show();
}

/* ---------------- Stem Snap ---------------- */
function stems(el) {
  const g = shell(el, "Stem Snap", "The ending of a generic name usually tells you the class.");
  let i = 0, score = 0, rounds = shuffle(STEMS).slice(0, 10);
  const show = () => {
    const s = rounds[i]; if (!s) return end();
    const drug = pick(s.ex); const opts = shuffle([s, ...shuffle(STEMS.filter((x) => x !== s)).slice(0, 3)]);
    g.innerHTML = `<div class="hud"><span>${i + 1} / 10</span><span>Score <b>${score}</b></span></div>
      <div class="labcard"><span class="label">What class is</span><div class="lab-v drug">${esc(drug)}</div></div>
      <div class="opts">${opts.map((o, n) => `<button class="opt" data-ok="${o === s}"><span class="opt-l">${"ABCD"[n]}</span><span class="opt-t">${esc(o.cls)}</span></button>`).join("")}</div><div id="why"></div>`;
    $$(".opt").forEach((b) => (b.onclick = () => {
      const ok = b.dataset.ok === "true"; if (ok) score++;
      $$(".opt").forEach((x) => { x.disabled = true; x.classList.add(x.dataset.ok === "true" ? "right" : x === b ? "wrong" : "dim"); });
      beep(ok); award(ok ? 4 : 1, "games");
      $("#why").innerHTML = `<div class="rationale ${ok ? "ok" : "no"}"><b><span class="stem">${esc(s.s)}</span> ${esc(s.cls)}</b><p>${esc(s.pearl)}</p><p class="small">Also: ${s.ex.filter((x) => x !== drug).map(esc).join(", ")}</p></div><button class="btn primary" id="nx">${i < 9 ? "Next" : "Finish"}</button>`;
      $("#nx").onclick = () => { i++; show(); }; $("#nx").focus();
    }));
  };
  const end = () => {
    if (score === 10) { pin("stems"); confetti(); }
    g.innerHTML = endCard("stems", score, "/10", score >= 8 ? "Pharm is your friend." : "Stems are pattern memory. Again?", "Play again");
    $("#again").onclick = () => { i = 0; score = 0; rounds = shuffle(STEMS).slice(0, 10); show(); };
  };
  show();
}

/* ---------------- Dose Drill ---------------- */
const r1 = (x) => Math.round(x * 10) / 10;
const rnd = (a, b, step = 1) => a + step * Math.floor(Math.random() * ((b - a) / step + 1));
function doseProblem() {
  const t = Math.floor(Math.random() * 6);
  if (t === 0) { const tab = pick([5, 10, 12.5, 25, 50, 100]); const mult = pick([0.5, 1.5, 2, 3]); const ord = tab * mult;
    return { q: `Ordered: ${ord} mg by mouth. Available: ${tab} mg tablets. How many tablets?`, a: mult, unit: "tablets", how: `${ord} mg ÷ ${tab} mg per tablet = ${mult} tablets.` }; }
  if (t === 1) { const have = pick([125, 250]); const vol = 5; const ord = rnd(100, 500, 25); const a = r1((ord / have) * vol);
    return { q: `Ordered: amoxicillin ${ord} mg. Available: ${have} mg per ${vol} mL. How many mL? (round to tenths)`, a, unit: "mL", how: `(${ord} mg ÷ ${have} mg) × ${vol} mL = ${a} mL.` }; }
  if (t === 2) { const lb = rnd(22, 88, 2); const per = pick([2, 5, 10, 15]); const kg = r1(lb / 2.2); const a = r1(kg * per);
    return { q: `A child weighs ${lb} lb. Ordered: ${per} mg/kg. How many mg per dose? (kg to tenths)`, a, unit: "mg", how: `${lb} lb ÷ 2.2 = ${kg} kg. ${kg} kg × ${per} mg/kg = ${a} mg.`, tol: 0.02 }; }
  if (t === 3) { const v = pick([500, 1000, 250, 750]); const h = pick([4, 6, 8, 10, 12]); const a = Math.round(v / h);
    return { q: `Infuse ${v} mL of 0.9% sodium chloride over ${h} hours on a pump. What rate in mL/hr? (nearest whole)`, a, unit: "mL/hr", how: `${v} mL ÷ ${h} h = ${r1(v / h)} → ${a} mL/hr.`, whole: true }; }
  if (t === 4) { const v = pick([1000, 500, 250, 100]); const hrs = pick([1, 2, 4, 8]); const df = pick([10, 15, 20, 60]); const a = Math.round((v * df) / (hrs * 60));
    return { q: `Infuse ${v} mL over ${hrs} hour${hrs > 1 ? "s" : ""} by gravity. Drop factor: ${df} gtt/mL. How many gtt/min? (nearest whole)`, a, unit: "gtt/min", how: `(${v} mL × ${df} gtt/mL) ÷ ${hrs * 60} min = ${r1((v * df) / (hrs * 60))} → ${a} gtt/min.`, whole: true }; }
  const bag = pick([[25000, 250], [25000, 500]]); const conc = bag[0] / bag[1]; const u = rnd(800, 1800, 100); const a = r1(u / conc);
  return { q: `Heparin ${bag[0].toLocaleString()} units in ${bag[1]} mL. Ordered: ${u.toLocaleString()} units/hr. What rate in mL/hr?`, a, unit: "mL/hr", how: `${bag[0].toLocaleString()} ÷ ${bag[1]} = ${conc} units/mL. ${u.toLocaleString()} ÷ ${conc} = ${a} mL/hr.` };
}
function dose(el) {
  const g = shell(el, "Dose Drill", "Show your work on paper if you like. Round as each problem says.");
  let row = 0, total = 0, right = 0;
  const show = () => {
    const p = doseProblem();
    g.innerHTML = `<div class="hud"><span>Correct <b>${right}</b> / ${total}</span><span class="combo">${row >= 2 ? `${row} in a row` : ""}</span></div>
      <div class="qcard"><h2 class="q-stem">${esc(p.q)}</h2>
      <form class="dose-in" id="df"><input id="da" inputmode="decimal" autocomplete="off" placeholder="Your answer" aria-label="Your answer"><span>${esc(p.unit)}</span><button class="btn primary">Check</button></form><div id="why"></div></div>`;
    $("#da").focus();
    $("#df").onsubmit = (e) => {
      e.preventDefault(); const v = parseFloat($("#da").value.replace(/,/g, "")); if (isNaN(v)) return toast("Enter a number.");
      const ok = p.whole ? Math.round(v) === p.a && Math.abs(v - p.a) < 1 : Math.abs(v - p.a) <= Math.max(0.051, Math.abs(p.a) * (p.tol || 0.01));
      total++; if (ok) { right++; row++; } else row = 0;
      if (row >= 10) pin("dose");
      beep(ok); award(ok ? 6 : 2, "games"); setBest("dose", Math.max(state.best.dose || 0, row));
      $("#da").disabled = true; $("#df button").remove();
      $("#why").innerHTML = `<div class="rationale ${ok ? "ok" : "no"}"><b>${ok ? "Correct." : `Answer: ${p.a} ${esc(p.unit)}`}</b><p>${esc(p.how)}</p></div><button class="btn primary" id="nx">Next problem</button>`;
      $("#nx").onclick = show; $("#nx").focus();
    };
  };
  show();
}

/* ---------------- Pair Rounds ---------------- */
async function match(el, params) {
  const decks = await idb.all("decks");
  let deckId = params.get("deck") || state.lastMatchDeck || decks.find((d) => d.builtin)?.id;
  const g = shell(el, "Pair Rounds", "Tap a card, then its partner. Six pairs per round.");
  const setup = async () => {
    const cards = (await idb.byDeck(deckId)).filter((c) => c.front && c.back);
    g.innerHTML = `<div class="row"><label class="field grow">Deck<select id="md">${decks.map((d) => `<option value="${d.id}" ${d.id === deckId ? "selected" : ""}>${esc(d.name)}${d.builtin ? "" : " (yours)"}</option>`).join("")}</select></label></div><div id="board"></div>`;
    $("#md").onchange = () => { deckId = $("#md").value; state.lastMatchDeck = deckId; save(); setup(); };
    if (cards.length < 3) { $("#board").innerHTML = `<div class="empty">This deck needs at least 3 cards.</div>`; return; }
    play(shuffle(cards).slice(0, 6));
  };
  const clip = (s) => (s.length > 90 ? s.slice(0, 87) + "…" : s);
  function play(set) {
    const tiles = shuffle(set.flatMap((c, i) => [{ i, t: clip(c.front), side: "q" }, { i, t: clip(c.back), side: "a" }]));
    let sel = null, left = set.length, misses = 0; const t0 = Date.now();
    $("#board").innerHTML = `<div class="hud"><span>Pairs left <b id="pl">${left}</b></span><span class="timer"><b id="mt">0</b>s</span></div>
      <div class="tiles">${tiles.map((x, n) => `<button class="tile ${x.side}" data-n="${n}">${esc(x.t)}</button>`).join("")}</div>`;
    const tick = setInterval(() => { const m = $("#mt"); if (m) m.textContent = Math.floor((Date.now() - t0) / 1000); }, 250);
    document.addEventListener("leave", () => clearInterval(tick), { once: true });
    $$(".tile").forEach((b) => (b.onclick = () => {
      const x = tiles[+b.dataset.n]; if (b.classList.contains("done")) return;
      if (!sel) { sel = b; b.classList.add("sel"); return; }
      if (sel === b) { b.classList.remove("sel"); sel = null; return; }
      const y = tiles[+sel.dataset.n];
      if (x.i === y.i && x.side !== y.side) {
        [b, sel].forEach((z) => { z.classList.remove("sel"); z.classList.add("done"); }); beep(true); left--; $("#pl").textContent = left;
        if (!left) { clearInterval(tick); const secs = Math.round((Date.now() - t0) / 1000); award(12, "games"); if (secs < 60) pin("match");
          const best = state.best.match; if (best == null || secs < best) { state.best.match = secs; save(); confetti(); }
          $("#board").innerHTML = `<div class="finish"><div class="finish-score">${secs}<small>s</small></div><h2>${state.best.match === secs ? "Fastest yet!" : "All matched."}</h2><p>${misses} mismatch${misses === 1 ? "" : "es"} · best ${state.best.match}s</p><div class="cta center"><button class="btn primary" id="again">Another round</button><a class="btn" href="#/games">Break room</a></div></div>`;
          $("#again").onclick = setup; }
      } else { misses++; beep(false); [b, sel].forEach((z) => { z.classList.remove("sel"); z.classList.add("shake"); setTimeout(() => z.classList.remove("shake"), 400); }); }
      sel = null;
    }));
  }
  setup();
}
