import { state, save, today, streak, todayKey } from "./store.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------------- Ranks ---------------- */
export const RANKS = [
  [0, "Pre-shift"], [200, "On the floor"], [600, "Charting pro"], [1500, "Charge nurse"],
  [3000, "Clinical ace"], [6000, "Academic warrior"], [10000, "RN-ready"],
];
export function rank(xp = state.xp) {
  let i = 0; while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
  const [base, name] = RANKS[i]; const next = RANKS[i + 1];
  return { i, name, base, next: next?.[0], nextName: next?.[1], pct: next ? (xp - base) / (next[0] - base) : 1 };
}

/* ---------------- Pins (badges) ---------------- */
export const PINS = [
  { id: "first-file", name: "First chart", desc: "Upload your first file", glyph: "📄" },
  { id: "deck-maker", name: "Card maker", desc: "Turn your notes into a deck", glyph: "🗂️" },
  { id: "cards-100", name: "Century", desc: "Review 100 flashcards", glyph: "💯" },
  { id: "cards-500", name: "Deck hand", desc: "Review 500 flashcards", glyph: "🃏" },
  { id: "q-50", name: "Fifty strong", desc: "Answer 50 practice questions", glyph: "✍️" },
  { id: "q-250", name: "Q-bank regular", desc: "Answer 250 practice questions", glyph: "📚" },
  { id: "streak-3", name: "Steady rhythm", desc: "Study 3 days in a row", glyph: "💓" },
  { id: "streak-7", name: "Week warrior", desc: "Study 7 days in a row", glyph: "🔥" },
  { id: "streak-30", name: "Sinus rhythm", desc: "Study 30 days in a row", glyph: "🫀" },
  { id: "triage", name: "Charge nurse", desc: "Perfect round of Who First?", glyph: "🚑" },
  { id: "labs", name: "Lab rat", desc: "Score 20+ in Lab Lightning", glyph: "🧪" },
  { id: "dose", name: "Dose sure", desc: "10 dosage answers right in a row", glyph: "💉" },
  { id: "stems", name: "Pharm whisperer", desc: "10/10 in Stem Snap", glyph: "💊" },
  { id: "match", name: "Quick pair", desc: "Clear Pair Rounds in under 60 s", glyph: "🧩" },
  { id: "owl", name: "Night shift", desc: "Study after 11 PM", glyph: "🌙" },
  { id: "bird", name: "Day shift", desc: "Study before 7 AM", glyph: "☀️" },
  { id: "warrior", name: "Academic warrior", desc: "Reach the Academic warrior rank", glyph: "⚔️" },
];
export function pin(id) {
  if (state.pins[id]) return;
  state.pins[id] = new Date().toISOString(); save();
  const p = PINS.find((x) => x.id === id);
  toast(`<span class="pin-toast">${p.glyph}</span> New pin: <b>${esc(p.name)}</b>`, 4200);
  confetti();
}

/* ---------------- XP ---------------- */
export function award(xp, kind) {
  const before = rank().i;
  state.count ||= {};
  const t = today(); t.xp += xp; if (kind) t[kind] = (t[kind] || 0) + 1;
  if (kind) state.count[kind] = (state.count[kind] || 0) + 1;
  state.xp += xp; save();
  const h = new Date().getHours(); if (h >= 23 || h < 3) pin("owl"); if (h >= 4 && h < 7) pin("bird");
  const s = streak(); if (s >= 3) pin("streak-3"); if (s >= 7) pin("streak-7"); if (s >= 30) pin("streak-30");
  const c = state.count; if (c.cards >= 100) pin("cards-100"); if (c.cards >= 500) pin("cards-500"); if (c.q >= 50) pin("q-50"); if (c.q >= 250) pin("q-250");
  const r = rank(); if (r.i > before) { toast(`Promoted: <b>${esc(r.name)}</b>`, 4200); confetti(); }
  if (r.name === "Academic warrior" || r.i > 5) pin("warrior");
  document.dispatchEvent(new CustomEvent("xp"));
}

/* ---------------- Toast ---------------- */
export function toast(html, ms = 2600) {
  const t = document.createElement("div"); t.className = "toast"; t.innerHTML = html;
  $("#toasts").appendChild(t); requestAnimationFrame(() => t.classList.add("in"));
  setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 400); }, ms);
}

/* ---------------- Sound: a monitor beep ---------------- */
let ac;
export function beep(good = true) {
  if (!state.sound) return;
  try {
    ac ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(); const t = ac.currentTime;
    o.type = "sine"; o.frequency.value = good ? 988 : 220;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (good ? 0.16 : 0.32));
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.35);
    if (good) { const o2 = ac.createOscillator(), g2 = ac.createGain(); o2.frequency.value = 1318; g2.gain.setValueAtTime(0.0001, t + .12); g2.gain.exponentialRampToValueAtTime(0.08, t + .13); g2.gain.exponentialRampToValueAtTime(0.0001, t + .3); o2.connect(g2).connect(ac.destination); o2.start(t + .12); o2.stop(t + .32); }
  } catch {}
}

/* ---------------- Confetti ---------------- */
export function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = $("#confetti"); const x = c.getContext("2d"); const dpr = devicePixelRatio || 1;
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; x.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--coral", "--teal", "--butter", "--plum"].map((v) => cs.getPropertyValue(v).trim());
  const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[Math.floor(Math.random() * cols.length)], s: Math.random() < .45 ? "heart" : Math.random() < .5 ? "plus" : "rect" }));
  let f = 0;
  (function step() {
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c;
      if (p.s === "heart") { const r = p.r * 1.3; x.beginPath(); x.moveTo(0, r * .35); x.bezierCurveTo(-r, -r * .3, -r * .45, -r, 0, -r * .45); x.bezierCurveTo(r * .45, -r, r, -r * .3, 0, r * .35); x.fill(); }
      else if (p.s === "plus") { x.fillRect(-p.r / 2, -p.r / 6, p.r, p.r / 3); x.fillRect(-p.r / 6, -p.r / 2, p.r / 3, p.r); } else x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      x.restore();
    }
    if (++f < 150) requestAnimationFrame(step); else x.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

/* ---------------- Small shared pieces ---------------- */
export function ring(pct, size = 120, stroke = 10, label = "") {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--coral)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" transform="rotate(-90 ${size / 2} ${size / 2})" style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)"/></svg>`;
}

// The study rhythm strip: one heartbeat per day, taller the more she studied.
export function rhythmStrip(days = 21) {
  const W = 720, H = 120, base = 78, seg = W / days; let d = "M0 " + base; const labels = [];
  const date = new Date(); date.setDate(date.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const k = todayKey(date); const xp = state.days[k]?.xp || 0; const x0 = i * seg;
    const amp = xp ? Math.min(62, 18 + xp / 3) : 0;
    if (amp) {
      d += ` L${x0 + seg * .3} ${base} L${x0 + seg * .38} ${base - 6} L${x0 + seg * .44} ${base} L${x0 + seg * .5} ${base + 8} L${x0 + seg * .56} ${base - amp} L${x0 + seg * .62} ${base + 14} L${x0 + seg * .68} ${base} L${x0 + seg * .8} ${base - 8} L${x0 + seg * .9} ${base}`;
    } else d += ` L${x0 + seg} ${base}`;
    if (i % 7 === 0 || i === days - 1) labels.push(`<text x="${x0 + seg / 2}" y="${H - 4}" text-anchor="middle">${i === days - 1 ? "today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</text>`);
    date.setDate(date.getDate() + 1);
  }
  d += ` L${W} ${base}`;
  return `<svg class="strip" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Study activity, last ${days} days">
    <defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="var(--grid)" stroke-width="1"/></pattern></defs>
    <rect width="${W}" height="${H - 16}" fill="url(#grid)"/>
    <path class="trace" d="${d}" fill="none" stroke="var(--coral)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    <g class="strip-labels">${labels.join("")}</g></svg>`;
}

export const daysUntil = (iso) => { if (!iso) return null; const t = new Date(iso + "T00:00:00"); const n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); };
export const fmtSize = (b) => b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB";
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const back = (href, label) => `<a class="backlink" href="${href}">← ${esc(label)}</a>`;
