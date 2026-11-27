// Turning Sandra's uploads into text, then text into study cards and quiz questions.
import { KEY_TERMS } from "./content.js";

const loaded = {};
function loadScript(src) {
  return (loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load " + src)); document.head.appendChild(s);
  }));
}
const V = new URL("../vendor/", import.meta.url).href;

export function kindOf(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".pptx")) return "pptx";
  if (/\.(txt|md|csv|tsv|rtf)$/.test(n)) return "text";
  if (file.type.startsWith("image/")) return "image";
  return "other";
}

export async function extractText(file) {
  const kind = kindOf(file);
  if (kind === "text") return await file.text();
  if (kind === "pdf") {
    await loadScript(V + "pdf.min.js");
    const pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = V + "pdf.worker.min.js";
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      let line = "";
      for (const it of tc.items) { line += it.str; if (it.hasEOL) { out.push(line); line = ""; } else if (it.str && !it.str.endsWith(" ")) line += " "; }
      if (line.trim()) out.push(line);
      out.push("");
    }
    return out.join("\n");
  }
  if (kind === "docx") {
    await loadScript(V + "mammoth.browser.min.js");
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  if (kind === "pptx") {
    await loadScript(V + "jszip.min.js");
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const slides = Object.keys(zip.files).filter((p) => /^ppt\/(slides|notesSlides)\/\w+?\d+\.xml$/.test(p))
      .sort((a, b) => (a.includes("notes") - b.includes("notes")) || (+a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]));
    const out = [];
    for (const p of slides) {
      const xml = await zip.files[p].async("string");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const paras = [...doc.getElementsByTagName("a:p")].map((pp) => [...pp.getElementsByTagName("a:t")].map((t) => t.textContent).join("")).filter(Boolean);
      if (p.includes("notes")) { const body = paras.filter((t) => !/^\d+$/.test(t)); if (body.length) out.push(...body, ""); }
      else out.push(...paras, "");
    }
    return out.join("\n");
  }
  return "";
}

/* ---------------- Card generation ---------------- */
const clean = (s) => s.replace(/\s+/g, " ").replace(/^[\s\-•*▪●◦·–—>]+/, "").replace(/^\(?\d{1,2}[.)]\s+/, "").trim();
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const PRONOUN = /^(it|this|that|these|those|they|there|he|she|we|you|i|which|what|here|one|each|all|some|most|many)\b/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function generateCards(text, max = 80) {
  const cards = []; const seen = new Set();
  const add = (front, back, kind) => {
    front = front.trim(); back = back.trim();
    const key = (front + "|" + back).toLowerCase();
    if (front.length < 2 || back.length < 2 || seen.has(key) || front.length > 220 || back.length > 400) return;
    seen.add(key); cards.push({ front, back, kind });
  };
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const used = new Set(); // one card per source line or sentence
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  // 1. "Term: definition" style lines.
  for (const l of lines) {
    const m = l.match(/^([^:=–—]{2,70}?)\s*(?::|=|–|—|\s-\s)\s*(.{6,})$/);
    if (m && words(m[1]) <= 7 && words(m[2]) >= 3 && !/https?$/i.test(m[1]) && !/^\d+$/.test(m[1])) { add(m[1].replace(/[*_#]/g, ""), m[2], "term"); used.add(norm(l)); }
  }

  // 2. "X is/are a ..." definitions.
  const sentences = text.replace(/\r?\n(?=[a-z])/g, " ").split(/(?<=[.!?])\s+|\n+/).map(clean).filter((s) => s.length > 20 && s.length < 320);
  for (const s of sentences) {
    const m = s.match(/^([A-Z][\w'’()\-\/ ,]{1,60}?)\s+(is|are|refers to|means|is defined as)\s+(.{12,})$/);
    if (m && words(m[1]) <= 6 && !PRONOUN.test(m[1]) && !used.has(norm(s))) {
      used.add(norm(s)); m[1] = /^[A-Z][a-z]/.test(m[1]) ? m[1][0].toLowerCase() + m[1].slice(1) : m[1];
      const q = m[2] === "are" ? "What are" : "What is";
      add(`${q} ${m[1].replace(/^(The|A|An)\s/, (x) => x.toLowerCase())}?`, cap(m[3].replace(/\.$/, "")), "define");
    }
  }

  // 3. Fill-in-the-blank on numbers with units (lab values, doses, timing).
  const NUM = /(\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?|[<>≤≥]?\s?\d+(?:\.\d+)?)\s*(mEq\/L|mg\/dL|g\/dL|ng\/mL|mcg\/mL|mmHg|mm Hg|%|bpm|beats\/min|breaths\/min|mL\/hr|mL\/kg\/hr|mL|mg|mcg|units?|kg|hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?|°[CF]?|degrees)/i;
  for (const s of sentences) {
    const m = s.match(NUM);
    if (m && words(s) >= 5 && !used.has(norm(s))) { used.add(norm(s)); add(s.replace(m[0], "_____"), m[0].trim(), "cloze"); }
  }

  // 4. Fill-in-the-blank on key nursing terms.
  for (const s of sentences) {
    if (used.has(norm(s)) || [...used].some((u) => u.includes(norm(s)) || norm(s).includes(u))) continue;
    for (const t of KEY_TERMS) {
      const re = new RegExp(`\\b${esc(t)}\\b`, "i");
      const m = s.match(re);
      if (m && words(s) >= 6) { add(s.replace(re, "_____"), m[0], "cloze"); break; }
    }
  }
  return cards.slice(0, max);
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Build multiple-choice questions from a set of cards (front = question, back = answer).
export function quizFromCards(cards, n = 10) {
  const pool = cards.filter((c) => c.back.length <= 160);
  if (pool.length < 4) return [];
  return shuffle(pool).slice(0, n).map((c) => {
    const others = shuffle(pool.filter((o) => o.back !== c.back && o.kind === c.kind)).slice(0, 3);
    const fill = others.length < 3 ? shuffle(pool.filter((o) => o.back !== c.back && !others.includes(o))).slice(0, 3 - others.length) : [];
    const opts = shuffle([c.back, ...[...others, ...fill].map((o) => o.back)]);
    const isCloze = c.front.includes("_____");
    return { mine: true, t: "mc", q: isCloze ? `Fill in the blank: ${c.front}` : c.front, o: opts, a: opts.indexOf(c.back), r: c.source ? `From your notes: ${c.source}` : "From your own notes." };
  });
}

export function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
