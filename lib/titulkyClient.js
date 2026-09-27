'use strict';

// Klient pro www.titulky.com
// - hledání a detail fungují BEZ přihlášení (ověřeno ze serveru 27. 9. 2026)
// - přihlášení je potřeba jen pro stahování (idown.php)

const axios = require('axios');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const { stripDiacritics } = require('./matching');

const BASE = (process.env.TITULKY_BASE || 'https://www.titulky.com').replace(/\/+$/, '');
const PAGE_SIZE = 50;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SUB_EXTS = ['.srt', '.sub', '.txt', '.smi', '.ssa', '.ass', '.vtt'];

// ── Omezení souběžných požadavků na titulky.com (ohleduplnost) ──
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
const limiter = new Limiter(Number(process.env.TITULKY_CONCURRENCY) || 3);

// ── Parsování výsledků hledání ──────────────────────────────────

function norm(s) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z]/g, '');
}

// Klíč sloupce podle textu hlavičky
function headerKey(text) {
  const n = norm(text);
  if (n.startsWith('nazev')) return 'title';
  if (n === 'v' || n.startsWith('verze')) return 'release';
  if (n.startsWith('serial')) return 'episode';
  if (n === 'rok') return 'year';
  if (n.startsWith('ulozeno')) return 'uploaded';
  if (n.startsWith('staz')) return 'downloads';
  if (n.startsWith('jazyk')) return 'lang';
  if (n.startsWith('ulozil')) return 'author';
  return null;
}

function cellText($, el) {
  return $(el).text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

function parseLink(href) {
  const m = String(href || '').match(/([^/"?#]+)-(\d{2,})\.htm$/i);
  if (!m) return null;
  return { linkFile: `${m[1]}-${m[2]}`, id: String(parseInt(m[2], 10)) };
}

function parseLang($, el) {
  const alt = $(el).find('img[alt]').first().attr('alt');
  if (!alt) return null;
  const c = alt.trim().toUpperCase();
  if (c === 'CZ') return 'cze';
  if (c === 'SK') return 'slk';
  return c.toLowerCase();
}

function parseSearchResults(html) {
  const $ = cheerio.load(html);
  const rows = $('tr').filter((i, el) => /^r\d*$/.test(($(el).attr('class') || '').trim()));
  if (!rows.length) return [];

  // Mapa sloupců podle hlavičky tabulky
  const table = rows.first().closest('table');
  let colMap = {};
  table.find('tr').each((i, tr) => {
    if (Object.keys(colMap).length) return;
    const cells = $(tr).children('td,th');
    const map = {};
    cells.each((j, c) => { const k = headerKey(cellText($, c)); if (k && !(k in map)) map[k] = j; });
    if ('title' in map && Object.keys(map).length >= 3) colMap = map;
  });

  const out = [];
  rows.each((i, tr) => {
    const cells = $(tr).children('td').toArray();
    if (!cells.length) return;
    const at = k => (k in colMap && cells[colMap[k]] ? cells[colMap[k]] : null);

    // Název + ID (když hlavička chybí, první buňka s odkazem na *-ID.htm)
    let titleCell = at('title');
    if (!titleCell) titleCell = cells.find(c => $(c).find('a[href$=".htm"]').length) || null;
    if (!titleCell) return;
    const a = $(titleCell).find('a[href]').filter((j, el) => parseLink($(el).attr('href'))).first();
    const link = parseLink(a.attr('href'));
    if (!link) return;
    let title = a.text().replace(/\s+/g, ' ').trim();
    const aTitle = (a.attr('title') || '').trim();
    if ((!title || title.endsWith('...')) && aTitle.length > title.length) title = aTitle;

    // Release: výhradně title= odkazu ve sloupci V. (class listTip)
    let release = null;
    const relCell = at('release') || cells.find(c => $(c).find('.listTip').length) || null;
    if (relCell) {
      const t = ($(relCell).find('[title]').first().attr('title') || '').trim();
      if (t && t !== '-') release = t;
    }

    let episode = null;
    const epCell = at('episode');
    if (epCell) { const t = cellText($, epCell); if (t) episode = t; }

    let year = null;
    const yCell = at('year');
    if (yCell) { const m = cellText($, yCell).match(/\b(19|20)\d{2}\b/); if (m) year = +m[0]; }

    let downloads = 0;
    const dCell = at('downloads') || cells.find(c => ($(c).attr('align') || '') === 'right') || null;
    if (dCell) { const n = parseInt(cellText($, dCell).replace(/[^\d]/g, ''), 10); if (n > 0) downloads = n; }

    const langCell = at('lang') || cells.find(c => $(c).find('img[alt]').length) || null;
    const lang = langCell ? parseLang($, langCell) : null;

    let author = null;
    const auCell = at('author');
    if (auCell) author = cellText($, auCell) || null;

    out.push({ id: link.id, linkFile: link.linkFile, title, release, episode, year, downloads, lang: lang || 'cze', author });
  });
  return out;
}

// ── Parsování detailu ───────────────────────────────────────────

function parseDetail(html) {
  const $ = cheerio.load(html);
  const text = $.root().text().replace(/ /g, ' ');
  const pick = (re, src = html) => { const m = src.match(re); return m ? m[1].trim() : null; };

  const imdb = pick(/imdb\.com\/title\/(tt\d{5,10})/i);
  const name = ($('h1[itemprop="name"]').first().text() || '').replace(/\s*\(\d{4}\)\s*$/, '').trim() || null;
  const altName = ($('h2[itemprop="name"]').first().text() || '').trim() || null;
  const yearStr = ($('[itemprop="dateCreated"]').first().text() || '').trim();
  const fpsStr = pick(/FPS:\s*([\d]+(?:[.,]\d+)?)/i, text);
  const cdStr = pick(/Po[čc]et CD:\s*(\d+)/i, text);
  const type = pick(/typ titulk[ůu]:\s*([a-z0-9]+)/i, text);
  const versionFor = ($('[itemprop="alternateName"]').first().text() || '').replace(/\s+/g, ' ').trim() || null;

  return {
    imdb: imdb || null,
    name,
    altName,
    year: /^\d{4}$/.test(yearStr) ? +yearStr : null,
    fps: fpsStr ? parseFloat(fpsStr.replace(',', '.')) : null,
    cd: cdStr ? +cdStr : null,
    type: type ? type.toLowerCase() : null,
    versionFor,
  };
}

// ── Klient ──────────────────────────────────────────────────────

class TitulkyClient {
  constructor(username, password) {
    this.username = username || null;
    this.password = password || null;
    this.cookies = {};
    this.lastLoginTime = 0;
    this.loginPromise = null;
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

  _cookieString() {
    return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  _request(url, opts = {}) {
    return limiter.run(async () => {
      const headers = {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.9',
        ...opts.headers,
      };
      const cookie = this._cookieString();
      if (cookie) headers.Cookie = cookie;
      if (opts.referer) headers.Referer = opts.referer;
      const res = await axios({
        url,
        method: opts.method || 'GET',
        headers,
        data: opts.data,
        maxRedirects: 5,
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
    return !!this.cookies.LogonId && Date.now() - this.lastLoginTime < 30 * 60 * 1000;
  }

  async login(force = false) {
    if (!this.username || !this.password) return false;
    if (!force && this.loggedIn) return true;
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = this._doLogin().finally(() => { this.loginPromise = null; });
    return this.loginPromise;
  }

  async _doLogin() {
    this.cookies = {};
    const params = new URLSearchParams({ Login: this.username, Password: this.password, foreverlog: '0', Detail2: '' });
    const res = await this._request(`${BASE}/index.php`, {
      method: 'POST',
      data: params.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE },
    });
    const body = typeof res.data === 'string' ? res.data : '';
    const ok = res.status < 400 && !body.includes('BadLogin') && !!this.cookies.LogonId;
    if (ok) this.lastLoginTime = Date.now();
    console.log(`[Titulky] Login ${ok ? 'OK' : 'SELHAL'} (HTTP ${res.status})`);
    return ok;
  }

  // Jedna stránka výsledků (50 řádků)
  async searchPage(query, offset = 0) {
    const params = new URLSearchParams({ Fulltext: query });
    if (offset > 0) {
      params.set('ZaznamuStrana', String(PAGE_SIZE));
      params.set('ActualRecord', String(offset));
    }
    const res = await this._request(`${BASE}/?${params}`);
    if (res.status >= 400) throw new Error(`Hledání HTTP ${res.status}`);
    const html = typeof res.data === 'string' ? res.data : '';
    if (html.includes('Nenalezena ani jedna')) return [];
    return parseSearchResults(html);
  }

  async fetchDetail(linkFile) {
    const res = await this._request(`${BASE}/${encodeURI(linkFile)}.htm`);
    if (res.status >= 400) throw new Error(`Detail HTTP ${res.status}`);
    return parseDetail(typeof res.data === 'string' ? res.data : '');
  }

  // Vrací { files: [{filename, content: Buffer}] } nebo { error: 'captcha'|'limit'|'login'|'error' }
  async download(subId, linkFile, _retry = false) {
    if (!(await this.login())) return { error: 'login' };

    const params = new URLSearchParams({ R: String(Math.floor(Date.now() / 1000)), titulky: subId, histstamp: '', zip: 'z' });
    const res = await this._request(`${BASE}/idown.php?${params}`, { referer: `${BASE}/${linkFile}.htm` });
    const page = typeof res.data === 'string' ? res.data : '';

    if (/captcha\/captcha\.php/i.test(page)) return { error: 'captcha' };

    const lm = page.match(/<a[^>]+id=["']?downlink["']?[^>]+href=["']([^"']+)["']/i)
      || page.match(/href=["']([^"']+)["'][^>]*id=["']?downlink["']?/i);
    if (!lm) {
      if (/limit|vy[čc]erpal|p[řr]ekro[čc]/i.test(page)) return { error: 'limit' };
      if (!_retry && !this.cookies.LogonId) {
        await this.login(true);
        return this.download(subId, linkFile, true);
      }
      console.log(`[Titulky] Stránka stažení bez odkazu (HTTP ${res.status}), začátek: ${page.slice(0, 200).replace(/\s+/g, ' ')}`);
      return { error: 'error' };
    }

    const href = lm[1].replace(/&amp;/g, '&');
    const downloadLink = /^https?:/i.test(href) ? href : `${BASE}${href.startsWith('/') ? '' : '/'}${href}`;
    const wm = page.match(/CountDown\((\d+)\)/i);
    const wait = wm ? Math.min(parseInt(wm[1], 10), 20) : 0;
    if (wait > 0) await new Promise(r => setTimeout(r, wait * 1000));

    const zipRes = await this._request(downloadLink, { referer: `${BASE}/idown.php`, responseType: 'arraybuffer', timeout: 30000 });
    const buf = Buffer.from(zipRes.data || []);
    if (zipRes.status >= 400 || buf.length < 20) return { error: 'error' };

    const files = extractSubtitleFiles(buf);
    if (!files.length) return { error: 'error' };
    return { files };
  }
}

// ZIP → seznam titulků; když to není ZIP, je to rovnou soubor s titulky
function extractSubtitleFiles(buf) {
  if (!(buf[0] === 0x50 && buf[1] === 0x4B)) return [{ filename: 'titulky.srt', content: buf }];
  try {
    const zip = new AdmZip(buf);
    return zip.getEntries()
      .filter(e => !e.isDirectory && SUB_EXTS.some(x => e.entryName.toLowerCase().endsWith(x)))
      .map(e => ({ filename: e.entryName.split('/').pop(), content: e.getData() }));
  } catch (e) {
    console.error('[Titulky] Chyba ZIP:', e.message);
    return [];
  }
}

module.exports = { TitulkyClient, parseSearchResults, parseDetail, extractSubtitleFiles, PAGE_SIZE };
