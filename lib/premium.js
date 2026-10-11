'use strict';

// Klient pro premium.titulky.com (jen pro účty s VIP / překladatelské)
// Zjištěno 11. 10. 2026:
//  • přihlášení: POST / (LoginName, LoginPassword, PermanentLog=148) → 302 na reload.php
//    s hláškou „Uživatel … přihlášen."; session v cookie SESSTITULKY
//  • bez VIP/přihlášení: hledání → JS přesměrování na reload.php „Přihlaste se na svůj prémiový…",
//    download.php → 302 „Funkce je určena pouze pro prémiové nebo překladatelské účty."
//  • hledání: ?action=search&IMDB=<číslo bez tt>&Serial=F|S&Sezona=&Epizoda= → SKUPINY titulků
//  • detail skupiny (?action=detail&id=) obsahuje hlavní titulek + tabulku „Alternativní titulky"
//    se VŠEMI verzemi se stejným IMDb (u seriálu stejný díl) – celý release, jazyk, datum, autor
//  • stažení: download.php?id=<id> → ZIP (_info.txt + titulky), bez captchy a čekání
//  • ID titulků jsou stejná jako na www.titulky.com → stejná cache na R2

const axios = require('axios');
const cheerio = require('cheerio');
const { extractSubtitleFiles } = require('./titulkyClient');

const BASE = (process.env.PREMIUM_BASE || 'https://premium.titulky.com').replace(/\/+$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SEARCH_TTL = 15 * 60 * 1000;
const DETAIL_TTL = 15 * 60 * 1000;
const ACCOUNT_TTL = 6 * 60 * 60 * 1000;
const MAX_EXTRA_GROUPS = 3; // pojistka: skupiny z hledání, které v alternativách chybí

// ── Pomocné ─────────────────────────────────────────────────────

class Limiter {
  constructor(max) { this.max = max; this.active = 0; this.queue = []; }
  run(fn) {
    return new Promise((resolve, reject) => {
      const task = async () => {
        this.active++;
        try { resolve(await fn()); } catch (e) { reject(e); } finally {
          this.active--;
          if (this.queue.length) this.queue.shift()();
        }
      };
      if (this.active < this.max) task(); else this.queue.push(task);
    });
  }
}
const limiter = new Limiter(Number(process.env.PREMIUM_CONCURRENCY) || 3);

class TtlCache {
  constructor(max, ttl) { this.max = max; this.ttl = ttl; this.map = new Map(); }
  get(k) {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() - e.t > this.ttl) { this.map.delete(k); return undefined; }
    return e.v;
  }
  set(k, v) {
    this.map.delete(k);
    this.map.set(k, { v, t: Date.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

// Stejné souběžné požadavky poběží jen jednou
const inflight = new Map();
function once(key, fn) {
  let p = inflight.get(key);
  if (!p) {
    p = Promise.resolve().then(fn).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

const searchCache = new TtlCache(1000, SEARCH_TTL);
const detailCache = new TtlCache(3000, DETAIL_TTL);

class PremiumError extends Error {
  constructor(code, msg) { super(msg || code); this.code = code; }
}

function clean(s) {
  return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function langOf(src) {
  const m = String(src || '').match(/flag-([A-Za-z]{2})/);
  if (!m) return 'cze';
  const c = m[1].toUpperCase();
  return c === 'SK' ? 'slk' : c === 'CZ' ? 'cze' : c.toLowerCase();
}

function idOf(href) {
  const m = String(href || '').match(/[?&]id=(\d+)/);
  return m ? String(parseInt(m[1], 10)) : null;
}

// Slug do URL titulku (jen kosmetika – stažení jde podle ID)
function slug(title, id) {
  const s = clean(title).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return `${s || 'titulky'}-${id}`;
}

function parseCzDate(s) {
  const m = String(s || '').match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], 23, 59, 59).getTime() : null;
}

// Hláška z přesměrování na reload.php (…&msg=…)
function reloadMsg(url) {
  const m = String(url || '').match(/reload\.php\?[^"']*?msg=([^&"']*)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).replace(/<[^>]+>/g, ''); } catch { return m[1]; }
}

// Odepřeno kvůli přihlášení / chybějícímu VIP?
const RE_DENIED = /p[řr]ihla[sš]te|pr[ée]miov|p[řr]ekladatelsk/i;
const RE_LIMIT = /limit|vy[čc]erp|p[řr]ekro[čc]|denn[íi]|dnes/i;

// ── Parsování ───────────────────────────────────────────────────

// Výsledky hledání → ID hlavních titulků skupin (v pořadí webu)
function parseSearch(html) {
  const $ = cheerio.load(html);
  const ids = [];
  $('table tbody tr').each((i, tr) => {
    const id = idOf($(tr).find('a[href*="action=detail"]').first().attr('href'));
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

// Účet z hlavičky stránky (jméno, „Platné do")
function parseAccount(html) {
  const $ = cheerio.load(html);
  const loggedIn = $('a[href*="action=logout"]').length > 0;
  let validUntil = null;
  $('.user-body .row').each((i, r) => {
    const t = clean($(r).text());
    const m = t.match(/Platn[ée] do:?\s*(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})/i);
    if (m) validUntil = parseCzDate(m[1]);
  });
  return { loggedIn, validUntil };
}

// Detail: hlavní titulek + alternativy
function parseDetail(html) {
  const $ = cheerio.load(html);
  const h1 = $('h1#titulky').first();
  const mainId = String(h1.attr('data-mainid') || '').trim();
  if (!/^\d+$/.test(mainId)) return null;

  const year = parseInt(clean(h1.find('.rok').text()), 10) || null;
  const h1c = h1.clone();
  h1c.find('.rok').remove();
  const title = clean(h1c.text());
  const imdbM = html.match(/imdb\.com\/title\/(tt\d{5,10})/i);
  const info = clean($('.detail .ulozil').text());
  const fpsM = info.match(/(\d{2}(?:[.,]\d+)?)\s*fps/i);
  const sizeM = String($('.cd1velikost').attr('title') || '').replace(/\D/g, '');

  const main = {
    id: mainId,
    title,
    year,
    release: clean($('.detail .releas').first().text()) || null,
    lang: langOf($('.detail h2 img[src*="flag"]').first().attr('src')),
    author: clean($('.detail .ulozil a').first().text()) || null,
    downloads: parseInt(clean($('.detail .stazeno').text()).replace(/\D/g, ''), 10) || 0,
    fps: fpsM ? parseFloat(fpsM[1].replace(',', '.')) : null,
    videoSize: sizeM ? Number(sizeM) : null,
    imdb: imdbM ? imdbM[1] : null,
  };

  // Alternativy – sloupce podle hlavičky (Název | Datum | Autor | Release)
  const alts = [];
  $('table').each((i, t) => {
    const T = $(t);
    const heads = T.find('thead th').map((j, th) => clean($(th).text()).toLowerCase()).get();
    const col = name => heads.findIndex(h => h.startsWith(name));
    const cTitle = col('název');
    if (cTitle < 0) return;
    const cDate = col('datum');
    const cAuthor = col('autor');
    const cRel = col('release');
    T.find('tbody tr').each((j, tr) => {
      const tds = $(tr).children('td');
      const a = $(tds[cTitle]).find('a[href*="action=detail"]').first();
      const id = idOf(a.attr('href'));
      if (!id || id === mainId) return;
      alts.push({
        id,
        title: clean(a.text()),
        lang: langOf($(tds[cTitle]).find('img[src*="flag"]').first().attr('src')),
        date: cDate >= 0 ? clean($(tds[cDate]).text()) : null,
        author: cAuthor >= 0 ? clean($(tds[cAuthor]).text()) || null : null,
        release: cRel >= 0 ? clean($(tds[cRel]).text()) || null : null,
      });
    });
  });
  return { main, alts };
}

// ── Klient (jeden na uživatele) ─────────────────────────────────

class PremiumClient {
  constructor(username, password) {
    this.username = username || null;
    this.password = password || null;
    this.cookies = {};
    this.loginTime = 0;
    this.loginPromise = null;
    this.account = null; // { validUntil, checked }
  }

  _cookieString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _parseCookies(headers) {
    const sc = headers['set-cookie'];
    if (!sc) return;
    for (const c of (Array.isArray(sc) ? sc : [sc])) {
      const m = c.match(/^([^=]+)=([^;]*)/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim();
      if (!v || v === 'deleted' || /expires=Thu, 01[- ]Jan[- ]1970/i.test(c)) delete this.cookies[k];
      else this.cookies[k] = v;
    }
  }

  // Bez automatického přesměrování – přesměrování na reload.php nese hlášku
  _request(path, opts = {}) {
    return limiter.run(async () => {
      const headers = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
        ...opts.headers,
      };
      const cookie = this._cookieString();
      if (cookie) headers.Cookie = cookie;
      const res = await axios({
        url: `${BASE}/${path.replace(/^\.?\//, '')}`,
        method: opts.method || 'GET',
        headers,
        data: opts.data,
        maxRedirects: 0,
        responseType: opts.responseType || 'text',
        decompress: true,
        validateStatus: () => true,
        timeout: opts.timeout || 20000,
      });
      this._parseCookies(res.headers);
      return res;
    });
  }

  get loggedIn() {
    return !!this.cookies.SESSTITULKY && this.loginTime > 0 && Date.now() - this.loginTime < 6 * 60 * 60 * 1000;
  }

  // true = přihlášen, false = špatné údaje
  async login(force = false) {
    if (!this.username || !this.password) return false;
    if (!force && this.loggedIn) return true;
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = this._doLogin().finally(() => { this.loginPromise = null; });
    return this.loginPromise;
  }

  async _doLogin() {
    this.cookies = {};
    this.loginTime = 0;
    await this._request('./'); // session cookie
    const body = new URLSearchParams({ LoginName: this.username, LoginPassword: this.password, PermanentLog: '148' });
    const res = await this._request('./', {
      method: 'POST',
      data: body.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE, Referer: `${BASE}/` },
    });
    const msg = reloadMsg(res.headers.location) || '';
    let ok = /p[řr]ihl[áa][šs]en/i.test(msg) && !/nep[řr]ihl|chyb|[šs]patn|neplatn/i.test(msg);
    if (!ok && res.status === 200) ok = parseAccount(String(res.data || '')).loggedIn;
    if (ok) this.loginTime = Date.now();
    this.account = null;
    console.log(`[Premium] Login ${ok ? 'OK' : 'SELHAL'} (HTTP ${res.status}${msg ? `, „${msg.slice(0, 80)}"` : ''})`);
    return ok;
  }

  // { ok:false, reason:'login' } | { ok:true, premium:bool, validUntil }
  async checkAccount(force = false) {
    if (!force && this.account && Date.now() - this.account.checked < ACCOUNT_TTL) return this.account;
    if (!(await this.login(force))) return { ok: false, reason: 'login' };
    const res = await this._request('./');
    const acc = parseAccount(String(res.data || ''));
    const premium = !!acc.validUntil && acc.validUntil >= Date.now();
    this.account = { ok: true, premium, validUntil: acc.validUntil, checked: Date.now() };
    return this.account;
  }

  // GET stránky jako přihlášený; při odepření se jednou znovu přihlásí
  async _page(path, retry = true) {
    if (!(await this.login())) throw new PremiumError('login');
    const res = await this._request(path);
    const html = typeof res.data === 'string' ? res.data : '';
    const msg = reloadMsg(res.headers.location) || (/window\.location\.assign\("\.\/reload\.php/.test(html) ? reloadMsg(html) : null);
    if (msg && RE_DENIED.test(msg)) {
      if (retry) {
        if (!(await this.login(true))) throw new PremiumError('login');
        return this._page(path, false);
      }
      throw new PremiumError('premium', msg);
    }
    if (res.status >= 400) throw new PremiumError('error', `HTTP ${res.status}`);
    return html;
  }

  async searchGroups(imdbId, season, episode) {
    const params = new URLSearchParams({ action: 'search', IMDB: String(imdbId).replace(/^tt/i, '') });
    if (season != null) {
      params.set('Serial', 'S');
      params.set('Sezona', String(season));
      params.set('Epizoda', String(episode));
    } else {
      params.set('Serial', 'F');
    }
    return parseSearch(await this._page(`./?${params}`));
  }

  async detail(id) {
    const hit = detailCache.get(id);
    if (hit) return hit;
    return once(`pdetail|${id}`, async () => {
      const d = parseDetail(await this._page(`./?action=detail&id=${encodeURIComponent(id)}`));
      if (d) {
        detailCache.set(id, d);
        detailCache.set(d.main.id, d);
      }
      return d;
    });
  }

  // Vrací { files } nebo { error: 'limit'|'login'|'premium'|'error' }
  async download(subId, _retry = false) {
    if (!(await this.login())) return { error: 'login' };
    const res = await this._request(`./download.php?id=${encodeURIComponent(subId)}`, {
      responseType: 'arraybuffer', timeout: 30000, headers: { Referer: `${BASE}/?action=detail&id=${subId}` },
    });
    const buf = Buffer.from(res.data || []);
    const msg = reloadMsg(res.headers.location)
      || (/text\/html/i.test(res.headers['content-type'] || '') ? reloadMsg(buf.toString('utf8')) : null);

    if (msg) {
      console.log(`[Premium] Stažení ${subId}: „${msg.slice(0, 160)}"`);
      if (RE_LIMIT.test(msg)) return { error: 'limit' };
      if (RE_DENIED.test(msg)) {
        if (!_retry && (await this.login(true))) return this.download(subId, true);
        return { error: _retry ? 'premium' : 'login' };
      }
      return { error: 'error' };
    }
    if (res.status >= 400 || buf.length < 20) {
      console.log(`[Premium] Stažení ${subId}: HTTP ${res.status}, ${buf.length} B`);
      return { error: 'error' };
    }
    const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
    if (!isZip && /text\/html/i.test(res.headers['content-type'] || '')) {
      const t = buf.toString('utf8');
      const plain = clean(cheerio.load(t)('body').text()).slice(0, 200);
      console.log(`[Premium] Stažení ${subId}: HTML místo souboru: ${plain}`);
      if (RE_LIMIT.test(plain)) return { error: 'limit' };
      return { error: 'error' };
    }
    const files = extractSubtitleFiles(buf).filter(f => !/^_info\.txt$/i.test(f.filename));
    if (!files.length) return { error: 'error' };
    return { files };
  }
}

// ── Hledání titulků podle IMDb ──────────────────────────────────
// Výsledek je pro všechny uživatele stejný → společná cache.
function rowFrom(d, alt) {
  const r = alt || d.main;
  return {
    id: r.id,
    linkFile: slug(r.title, r.id),
    title: r.title,
    release: r.release,
    lang: r.lang || 'cze',
    author: r.author || null,
    downloads: alt ? 0 : d.main.downloads,
    year: d.main.year,
    premium: true,
  };
}

async function findSubs(client, imdbId, season, episode) {
  const key = `${imdbId}|${season ?? ''}|${episode ?? ''}`;
  const hit = searchCache.get(key);
  if (hit) return hit;
  return once(`psearch|${key}`, async () => {
    const groups = await client.searchGroups(imdbId, season, episode);
    const rows = new Map();
    const seenGroups = new Set();
    let extra = 0;
    for (const gid of groups) {
      if (rows.has(gid) && seenGroups.size) continue; // už je mezi alternativami
      if (seenGroups.size && ++extra > MAX_EXTRA_GROUPS) break;
      const d = await client.detail(gid);
      if (!d) continue;
      seenGroups.add(gid);
      if (!rows.has(d.main.id) || rows.get(d.main.id).downloads === 0) rows.set(d.main.id, rowFrom(d));
      for (const a of d.alts) if (!rows.has(a.id)) rows.set(a.id, rowFrom(d, a));
    }
    const out = [...rows.values()];
    console.log(`[Premium] IMDb ${imdbId}${season != null ? ` S${season}E${episode}` : ''}: skupin ${groups.length}, titulků ${out.length}`);
    searchCache.set(key, out);
    return out;
  });
}

// FPS pro MicroDVD (z detailu konkrétního titulku)
async function fpsOf(client, subId) {
  try {
    const d = await client.detail(String(subId));
    if (!d) return null;
    return d.main.id === String(subId) ? d.main.fps : null;
  } catch {
    return null;
  }
}

module.exports = { PremiumClient, PremiumError, findSubs, fpsOf, parseSearch, parseDetail, parseAccount, reloadMsg };
