'use strict';

// Vyhledání titulků na Titulky.com: dotazy → stránkování → předfiltr (název, rok, epizoda)
// → kontrola IMDb z detailu titulku (s trvalou cache).

const { TitulkyClient, PAGE_SIZE } = require('./titulkyClient');
const { titleMatches, titleStillInRange, parseEpisode, episodeCode } = require('./matching');
const r2 = require('./r2');

const MAX_PAGES = 3;
const SEARCH_TTL = 15 * 60 * 1000;
const VERIFY_BUDGET_MS = Number(process.env.VERIFY_BUDGET_MS) || 8000;
const VERIFY_ENABLED = process.env.VERIFY_IMDB !== '0';

// Hledání a detail nepotřebují přihlášení → jeden anonymní klient
const anon = new TitulkyClient();

// ── Jednoduchá cache s omezenou velikostí ─────────────────────
class BoundedCache {
  constructor(max, ttl) { this.max = max; this.ttl = ttl; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (this.ttl && Date.now() - e.t > this.ttl) { this.map.delete(k); return undefined; }
    this.map.delete(k); this.map.set(k, e); // LRU
    return e.v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, { v, t: Date.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

const searchCache = new BoundedCache(500, SEARCH_TTL);
const detailCache = new BoundedCache(5000, 0);

// Souběžné stejné požadavky (Nuvio posílá 2–3 dotazy naráz) poběží jen jednou
const inflight = new Map();
function once(key, fn) {
  let p = inflight.get(key);
  if (!p) {
    p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function searchPageCached(query, offset) {
  const key = `${query.toLowerCase()}|${offset}`;
  const hit = searchCache.get(key);
  if (hit) return hit;
  return once(`search|${key}`, async () => {
    const rows = await anon.searchPage(query, offset);
    searchCache.set(key, rows);
    return rows;
  });
}

// Všechny stránky, dokud výsledky (řazené abecedně) ještě patří k hledanému názvu
async function searchAll(query, wantedName) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await searchPageCached(query, page * PAGE_SIZE);
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    if (!titleStillInRange(wantedName, last.title)) break;
  }
  return all;
}

function rowEpisode(row) {
  return parseEpisode(row.episode) || parseEpisode(row.title) || parseEpisode(row.release);
}

// ── Hlavní hledání ─────────────────────────────────────────────
// Vrací předfiltrované řádky (bez kontroly IMDb)
function findCandidates(args) {
  const { type, meta, season, episode } = args;
  const key = `cand|${type}|${meta.name}|${meta.year || meta.releaseInfo || ''}|${season}|${episode}`;
  return once(key, () => findCandidatesRaw(args));
}

async function findCandidatesRaw({ type, meta, season, episode }) {
  const name = (meta.name || '').trim();
  if (!name) return [];
  const names = [name, ...(Array.isArray(meta.aliases) ? meta.aliases : [])]
    .map(s => String(s || '').trim())
    .filter((s, i, a) => s.length > 1 && a.indexOf(s) === i);
  const cleaned = name.replace(/[.!?]+$/, '').trim();
  if (cleaned && !names.includes(cleaned)) names.push(cleaned);

  const isSeries = type === 'series';
  const ep = isSeries ? episodeCode(season, episode) : null;
  const year = parseInt(String(meta.year || meta.releaseInfo || '').slice(0, 4), 10) || null;

  for (const n of names) {
    const query = isSeries ? `${n} ${ep}` : n;
    let rows;
    try {
      rows = await searchAll(query, n);
    } catch (e) {
      console.log(`[Hledání] "${query}" selhalo: ${e.message}`);
      continue;
    }
    const seen = new Set();
    const filtered = rows.filter(row => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      const slug = row.linkFile.replace(/-\d+$/, '').replace(/-/g, ' ');
      if (!names.some(x => titleMatches(x, row.title) || titleMatches(x, slug))) return false;
      if (isSeries) {
        const e = rowEpisode(row);
        return !!e && e.season === season && e.episode === episode;
      }
      if (row.episode && parseEpisode(row.episode)) return false; // díl seriálu u filmu
      if (year && row.year && Math.abs(row.year - year) > 1) return false;
      return true;
    });
    console.log(`[Hledání] "${query}": ${rows.length} řádků, po filtru ${filtered.length}`);
    if (filtered.length) return filtered;
  }
  return [];
}

// ── Detail titulku (IMDb, FPS, CD, verze) ─────────────────────

async function getDetail(row) {
  const cached = detailCache.get(row.id);
  if (cached) return cached;
  return once(`detail|${row.id}`, () => getDetailRaw(row));
}

async function getDetailRaw(row) {
  let d = await r2.getMeta(row.id);
  if (!d) {
    try {
      d = await anon.fetchDetail(row.linkFile);
      d.fetched = Date.now();
      r2.putMeta(row.id, d).catch(() => {});
    } catch (e) {
      console.log(`[Detail] ${row.id}: ${e.message}`);
      return null;
    }
  }
  detailCache.set(row.id, d);
  return d;
}

// Jen z cache (bez požadavku na web) – pro stahování (FPS)
async function getDetailById(subId, linkFile) {
  const cached = detailCache.get(String(subId));
  if (cached) return cached;
  return getDetail({ id: String(subId), linkFile });
}

// Projde seřazené kandidáty, u prvních `limit` ověří IMDb. Nesedící vyřadí.
async function verifyCandidates(rows, imdbId, limit) {
  if (!VERIFY_ENABLED || !imdbId) return rows.slice(0, limit);
  const deadline = Date.now() + VERIFY_BUDGET_MS;
  const out = [];
  let i = 0;
  let dropped = 0;
  while (out.length < limit && i < rows.length) {
    if (Date.now() > deadline) {
      // Došel čas – zbytek bez ověření
      for (; i < rows.length && out.length < limit; i++) out.push({ ...rows[i], verified: null });
      break;
    }
    const batch = rows.slice(i, i + Math.max(2, limit - out.length));
    i += batch.length;
    const details = await Promise.all(batch.map(r => getDetail(r)));
    batch.forEach((r, j) => {
      const d = details[j];
      if (d && d.imdb && d.imdb !== imdbId) { dropped++; return; }
      if (out.length < limit) out.push({ ...r, detail: d || null, verified: d && d.imdb ? true : null });
    });
  }
  if (dropped) console.log(`[Ověření] vyřazeno ${dropped} titulků s jiným IMDb než ${imdbId}`);
  return out;
}

module.exports = { findCandidates, verifyCandidates, getDetail, getDetailById, rowEpisode, BoundedCache };
