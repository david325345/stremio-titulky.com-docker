'use strict';

// Normalizace názvů, epizody, release tagy a míra shody titulků s přehrávaným souborem.

// ── Názvy ───────────────────────────────────────────────────────

function stripDiacritics(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeTitle(s) {
  return stripDiacritics(s)
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Co smí následovat za názvem, aby šlo pořád o stejné dílo
const AFTER_TITLE_OK = /^(\d{4}\b|s\d|season|serie|\d{1,2}x\d|ep\b|episode|cd\d|2160|1080|720|576|480|bluray|blu ray|bdrip|brrip|bd\b|web|dvd|hdtv|hdrip|remux|x26|h26|xvid|uhd|4k|imax|extended|directors|unrated|remastered|proper|repack|internal|limited)/;

function titleMatches(wanted, candidate) {
  const n = normalizeTitle(wanted);
  const c = normalizeTitle(candidate);
  if (!n || !c) return false;
  if (c === n) return true;
  if (c.startsWith(n + ' ')) {
    const rest = c.slice(n.length + 1);
    return AFTER_TITLE_OK.test(rest);
  }
  return false;
}

// Je kandidát ještě v abecedním „okně“ hledaného názvu? (pro stránkování výsledků)
function titleStillInRange(wanted, candidate) {
  const n = normalizeTitle(wanted);
  const c = normalizeTitle(candidate);
  return c.startsWith(n) || c < n;
}

// ── Epizody ─────────────────────────────────────────────────────

function parseEpisode(str) {
  const s = String(str || '');
  let m = s.match(/\bS(\d{1,2})[\s._-]*E(\d{1,3})\b/i);
  if (m) return { season: +m[1], episode: +m[2] };
  m = s.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (m) return { season: +m[1], episode: +m[2] };
  return null;
}

function episodeCode(season, episode) {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

// ── Release tagy ────────────────────────────────────────────────

// Řetězec na „slova“: tečky, podtržítka, pomlčky, závorky → mezery
function tagText(str) {
  return ' ' + stripDiacritics(str).toLowerCase().replace(/[._\-\[\](){}+,/|]+/g, ' ').replace(/\s+/g, ' ') + ' ';
}

const RESOLUTIONS = [
  ['2160p', /\s(2160p|4k|uhd)\s/],
  ['1080p', /\s(1080p|1080i)\s/],
  ['720p', /\s720p\s/],
  ['480p', /\s(480p|576p|480i|576i)\s/],
];

// Zdroj → rodina (pro „stejný zdroj“ stačí stejná rodina)
const SOURCES = [
  ['remux', 'bluray', /\s(bd ?remux|remux)\s/],
  ['bluray', 'bluray', /\s(blu ?ray|bluray|bdrip|brrip|bd ?rip|br ?rip|bd25|bd50|bdmv)\s/],
  ['hddvd', 'hddvd', /\shd ?dvd\s/],
  ['webdl', 'web', /\s(web ?dl|webdl)\s/],
  ['webrip', 'web', /\s(web ?rip|webrip)\s/],
  ['web', 'web', /\s(web|amzn|nf|dsnp|hmax|atvp)\s/],
  ['hdtv', 'tv', /\s(hdtv|pdtv|dsr|dsrip|sdtv|tvrip|dvb|satrip)\s/],
  ['dvd', 'dvd', /\s(dvdrip|dvd ?rip|dvd|dvd5|dvd9|dvdscr)\s/],
  ['hdrip', 'hdrip', /\shdrip\s/],
  ['cam', 'cam', /\s(cam|hdcam|ts|telesync|tc|telecine|hdts)\s/],
];

const CODECS = [
  ['h265', /\s(x265|h265|h 265|hevc)\s/],
  ['h264', /\s(x264|h264|h 264|avc)\s/],
  ['xvid', /\s(xvid|divx)\s/],
];

// Slova, která nejsou release group
const NOT_GROUP = new Set([
  'dl', 'rip', 'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'web', 'webrip', 'webdl', 'bluray',
  'hdtv', 'dvdrip', 'bdrip', 'brrip', 'aac', 'ac3', 'dts', 'hd', 'ma', 'eng', 'cz', 'sk', 'cze', 'multi',
  'dual', 'srt', 'avi', 'mkv', 'mp4', '1080p', '720p', '2160p', '480p', '10bit', '8bit', 'hdr', 'sdr',
]);

function extractGroup(str) {
  let s = String(str || '').trim();
  s = s.replace(/\.(mkv|mp4|avi|m4v|ts|srt|sub|ass)$/i, '');
  // [YTS.MX] / [RARBG] na konci
  let m = s.match(/\[([A-Za-z0-9][A-Za-z0-9.]{1,20})\]\s*$/);
  if (m) {
    const g = m[1].toLowerCase().split('.')[0];
    if (!NOT_GROUP.has(g)) return g;
  }
  // ...x264-GROUP
  m = s.match(/-([A-Za-z0-9]{2,20})\s*$/);
  if (m) {
    const g = m[1].toLowerCase();
    if (!NOT_GROUP.has(g) && !/^\d+$/.test(g)) return g;
  }
  return null;
}

function extractTags(str) {
  const t = tagText(str);
  const tags = { resolution: null, source: null, family: null, codec: null, group: extractGroup(str) };
  for (const [name, re] of RESOLUTIONS) if (re.test(t)) { tags.resolution = name; break; }
  for (const [name, fam, re] of SOURCES) if (re.test(t)) { tags.source = name; tags.family = fam; break; }
  for (const [name, re] of CODECS) if (re.test(t)) { tags.codec = name; break; }
  return tags;
}

function hasUsefulTags(tags) {
  return !!(tags && (tags.resolution || tags.source || tags.group));
}

// ── Míra shody ─────────────────────────────────────────────────
// level 2 = 🎯 přesná (sedí skupina a nekoliduje zdroj)
// level 1 = ⭐ dobrá (sedí rodina zdroje a nekoliduje rozlišení)
// level 0 = nic

function matchOne(subTags, play) {
  let level = 0;
  let score = 0;
  const familyOk = !subTags.family || !play.family || subTags.family === play.family;
  if (play.group && subTags.group && play.group === subTags.group && familyOk) {
    level = 2;
    score += 100;
  } else if (play.family && subTags.family === play.family &&
             (!play.resolution || !subTags.resolution || play.resolution === subTags.resolution)) {
    level = 1;
    score += 50;
  }
  if (play.source && subTags.source === play.source) score += 10;
  if (play.resolution && subTags.resolution === play.resolution) score += 8;
  if (play.codec && subTags.codec === play.codec) score += 3;
  return { level, score };
}

// subStrings = [release, verzePro, název …]
function matchLevel(subStrings, playTags) {
  let best = { level: 0, score: 0 };
  if (!hasUsefulTags(playTags)) return best;
  for (const s of subStrings) {
    if (!s) continue;
    const r = matchOne(extractTags(s), playTags);
    if (r.level > best.level || (r.level === best.level && r.score > best.score)) best = r;
  }
  return best;
}

// Kvalita, když neznáme přehrávaný soubor
function qualityScore(str) {
  const t = extractTags(str);
  let s = 0;
  s += { '2160p': 40, '1080p': 30, '720p': 20, '480p': 5 }[t.resolution] || 0;
  s += { remux: 50, bluray: 45, hddvd: 35, webdl: 40, webrip: 35, web: 35, hdtv: 20, hdrip: 15, dvd: 15, cam: -20 }[t.source] || 0;
  return s;
}

function qualityEmoji(str) {
  const t = extractTags(str);
  if (t.source === 'remux') return '💎';
  if (t.family === 'bluray' || t.resolution === '2160p') return '🟢';
  if (t.family === 'web') return '🟡';
  if (t.family === 'tv') return '🟠';
  if (t.family === 'dvd') return '🔴';
  if (t.family === 'cam') return '⚫';
  return '';
}

module.exports = {
  stripDiacritics, normalizeTitle, titleMatches, titleStillInRange,
  parseEpisode, episodeCode,
  extractTags, extractGroup, hasUsefulTags, matchLevel, qualityScore, qualityEmoji,
};
