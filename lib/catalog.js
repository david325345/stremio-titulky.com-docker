'use strict';

// Katalog „Nejnovější titulky" z úvodní stránky premium.titulky.com
// Zjištěno 11. 10. 2026: úvodní stránka jde načíst bez přihlášení, 60 položek:
//  <li title="Babylon Berlin S05E08">
//    <a href="./?action=detail&id=447730"><div class="img_nejnovejsi" style="background-image: url('…/img/poster/4378376.jpg')"></div></a>
//    <a class="nejnovejsi-list-name">Babylon Berlin</a>
//    <span class="nejnovejsi-list-name"><i …></i> S05E08</span>   (u filmu „Film")
//    <span class="nejnovejsi-list-date">11.10.2026 15:20</span>
//  </li>
// Číslo v názvu plakátu = IMDb bez „tt". Položky bez plakátu (noimage) se vynechají.

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const r2 = require('./r2');

const BASE = (process.env.PREMIUM_BASE || 'https://premium.titulky.com').replace(/\/+$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SIZE = Number(process.env.CATALOG_SIZE) || 60;
// Plakáty se ukládají na disk (trvalé úložiště /app/data), servíruje je addon na /poster/<IMDb>.jpg
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const POSTER_DIR = path.join(DATA_DIR, 'posters');
const HOURS = String(process.env.CATALOG_HOURS || '12,18').split(',').map(Number).filter(n => n >= 0 && n < 24);
const R2_KEY = 'catalog/nejnovejsi.json';
const TZ = 'Europe/Prague';

let state = { metas: [], updated: 0, slot: null };
let running = null;

function clean(s) {
  return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

// „11.10.2026 15:20" → „11. 10. 2026 15:20"
function prettyDate(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
  return m ? `${+m[1]}. ${+m[2]}. ${m[3]}${m[4] ? ` ${m[4]}` : ''}` : '';
}

function parseHome(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('.img_nejnovejsi').each((i, el) => {
    const li = $(el).closest('li');
    const style = String($(el).attr('style') || '');
    const pm = style.match(/img\/poster\/(\d{3,10})(?:_[^.]*)?\.jpg/i);
    if (!pm) return; // noimage → vynechat
    const kind = clean(li.find('span.nejnovejsi-list-name').text());
    const ep = kind.match(/S(\d{1,3})E(\d{1,4})/i);
    out.push({
      imdb: `tt${pm[1].padStart(7, '0')}`,
      name: clean(li.find('a.nejnovejsi-list-name').text()) || clean(li.attr('title')),
      type: ep ? 'series' : 'movie',
      season: ep ? +ep[1] : null,
      episode: ep ? +ep[2] : null,
      date: clean(li.find('.nejnovejsi-list-date').text()),
    });
  });
  return out;
}

// [{season, episode}] → „S05E01–E08, S06E02"
function episodeText(eps) {
  const bySeason = new Map();
  for (const e of eps) {
    if (!bySeason.has(e.season)) bySeason.set(e.season, new Set());
    bySeason.get(e.season).add(e.episode);
  }
  const parts = [];
  for (const s of [...bySeason.keys()].sort((a, b) => a - b)) {
    const list = [...bySeason.get(s)].sort((a, b) => a - b);
    const S = `S${String(s).padStart(2, '0')}`;
    const E = n => `E${String(n).padStart(2, '0')}`;
    const ranges = [];
    let start = list[0];
    let prev = list[0];
    for (const n of list.slice(1).concat([null])) {
      if (n === prev + 1) { prev = n; continue; }
      ranges.push(start === prev ? E(start) : `${E(start)}–${E(prev)}`);
      start = n;
      prev = n;
    }
    parts.push(S + ranges.join(`, `));
  }
  return parts.join(', ');
}

// Sloučení podle IMDb (díly seriálu do jedné položky), pořadí = nejnovější první
function buildMetas(items) {
  const map = new Map();
  for (const it of items) {
    let m = map.get(it.imdb);
    if (!m) {
      if (map.size >= SIZE) continue;
      m = { ...it, eps: [] };
      map.set(it.imdb, m);
    }
    if (it.type === 'series') m.eps.push({ season: it.season, episode: it.episode });
  }
  return [...map.values()].map(m => {
    const when = prettyDate(m.date);
    const description = m.type === 'series' && m.eps.length
      ? `Nové titulky: ${episodeText(m.eps)}${when ? ` · ${when}` : ''}`
      : `Nové titulky${when ? ` · ${when}` : ''}`;
    return {
      id: m.imdb,
      type: m.type,
      name: m.name,
      poster: `https://images.metahub.space/poster/medium/${m.imdb}/img`,
      posterShape: 'poster',
      description,
    };
  });
}

// ── Plakáty na disku ─────────────────────────────────────────────
const posterFile = imdb => path.join(POSTER_DIR, `${imdb}.jpg`);

async function fetchImage(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer', timeout: 15000, maxRedirects: 5, validateStatus: () => true,
    headers: { 'User-Agent': UA },
  });
  const buf = Buffer.from(res.data || []);
  const ok = res.status === 200 && /^image\//i.test(res.headers['content-type'] || '') && buf.length > 2000;
  return ok ? buf : null;
}

// Stáhne chybějící plakáty z Metahubu a smaže ty, které už v katalogu nejsou.
// Když plakát stáhnout nejde, položka zůstane bez plakátu (přehrávač ukáže svůj zástupný obrázek).
async function ensurePosters(metas) {
  try {
    fs.mkdirSync(POSTER_DIR, { recursive: true });
  } catch (e) {
    console.log(`[Katalog] Složka plakátů nejde vytvořit: ${e.message} – plakáty z Metahubu`);
    return;
  }
  let fetched = 0;
  let failed = 0;
  const todo = metas.filter(m => {
    try { return !fs.statSync(posterFile(m.id)).size; } catch { return true; }
  });
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async m => {
      try {
        const buf = await fetchImage(`https://images.metahub.space/poster/medium/${m.id}/img`);
        if (buf) { fs.writeFileSync(posterFile(m.id), buf); fetched++; return; }
      } catch { /* bez plakátu */ }
      failed++;
    }));
  }
  // úklid: jen plakáty aktuálního katalogu
  const keep = new Set(metas.map(m => `${m.id}.jpg`));
  let removed = 0;
  try {
    for (const f of fs.readdirSync(POSTER_DIR)) {
      if (!keep.has(f)) { fs.unlinkSync(path.join(POSTER_DIR, f)); removed++; }
    }
  } catch { /* nic */ }
  if (fetched || failed || removed) console.log(`[Katalog] Plakáty: staženo ${fetched}, nedostupné ${failed}, smazáno ${removed}`);
}

// Cesta k uloženému plakátu (pro server) nebo null
function posterPath(imdb) {
  if (!/^tt\d{5,10}$/.test(imdb)) return null;
  const f = posterFile(imdb);
  try { return fs.statSync(f).size ? f : null; } catch { return null; }
}

// Položky pro Stremio: plakát z našeho serveru, když je uložený, jinak bez plakátu
function metasFor(host) {
  return state.metas.map(m => {
    const { poster, posterSrc, ...meta } = m; // eslint-disable-line no-unused-vars
    if (posterPath(m.id)) meta.poster = `${host}/poster/${m.id}.jpg`;
    return meta;
  });
}

async function refresh(slot = null) {
  if (running) return running;
  running = (async () => {
    try {
      const res = await axios.get(`${BASE}/`, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.9' },
        timeout: 20000,
        responseType: 'text',
        validateStatus: () => true,
      });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      const items = parseHome(String(res.data || ''));
      const metas = buildMetas(items);
      if (!metas.length) throw new Error('žádné položky (změnila se stránka?)');
      await ensurePosters(metas);
      state = { metas, updated: Date.now(), slot };
      await r2.putObject(R2_KEY, JSON.stringify(state), 'application/json');
      console.log(`[Katalog] Nejnovější titulky: ${items.length} titulků → ${metas.length} položek`);
    } catch (e) {
      console.log(`[Katalog] Aktualizace selhala: ${e.message}`);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Pražský čas: { day: '2026-10-11', hour: 6 }
function pragueNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function tick() {
  const { day, hour } = pragueNow();
  if (!HOURS.includes(hour)) return;
  const slot = `${day} ${hour}`;
  if (state.slot === slot || running) return;
  refresh(slot);
}

async function start() {
  const o = await r2.getObject(R2_KEY);
  if (o) {
    try {
      const saved = JSON.parse(o.body.toString('utf8'));
      if (Array.isArray(saved.metas)) state = saved;
      console.log(`[Katalog] Načteno z R2: ${state.metas.length} položek (${new Date(state.updated).toISOString()})`);
    } catch { /* poškozené → načíst znovu */ }
  }
  if (!state.metas.length) await refresh();
  else await ensurePosters(state.metas); // po prázdném volume plakáty znovu stáhnout
  setInterval(tick, 60 * 1000).unref();
}

function getMetas() {
  return state.metas;
}

module.exports = { start, refresh, getMetas, metasFor, posterPath, parseHome, buildMetas, episodeText };
