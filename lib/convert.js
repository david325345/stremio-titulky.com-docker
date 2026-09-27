'use strict';

// Kódování a převody formátů titulků. Výstup pro přehrávače je vždy UTF-8 SRT (nebo VTT).

const iconv = require('iconv-lite');

// ── Kódování ───────────────────────────────────────────────────

function toUtf8String(input) {
  if (typeof input === 'string') return input.replace(/^﻿/, '');
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.subarray(3).toString('utf8');
  if (buf[0] === 0xFF && buf[1] === 0xFE) return iconv.decode(buf.subarray(2), 'utf-16le');
  if (buf[0] === 0xFE && buf[1] === 0xFF) return iconv.decode(buf.subarray(2), 'utf-16be');
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  // Není platné UTF-8 → české/slovenské titulky bývají ve Windows-1250
  return iconv.decode(buf, 'win1250');
}

// ── Detekce formátu ────────────────────────────────────────────

function detectFormat(text) {
  const head = text.slice(0, 4000);
  if (/^\s*WEBVTT/.test(head)) return 'vtt';
  if (/\[Script Info\]/i.test(head) || /^\s*Dialogue:/im.test(head)) return 'ass';
  if (/^\s*\{\d+\}\{\d*\}/m.test(head)) return 'microdvd';
  if (/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(head)) return 'srt';
  if (/^\s*\d{1,2}:\d{2}:\d{2}\.\d{2},\d{1,2}:\d{2}:\d{2}\.\d{2}\s*$/m.test(head)) return 'subviewer';
  if (/^\s*\[\d+\]\[\d+\]/m.test(head)) return 'mpl2';
  return 'unknown';
}

// ── Pomocné ─────────────────────────────────────────────────────

function pad(n, w = 2) { return String(n).padStart(w, '0'); }

function msToSrt(ms) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

function buildSrt(cues) {
  return cues
    .filter(c => c.text && c.text.trim() && c.end > c.start)
    .map((c, i) => `${i + 1}\n${msToSrt(c.start)} --> ${msToSrt(c.end)}\n${c.text.trim()}\n`)
    .join('\n');
}

// MicroDVD formátování {y:i} apod. → SRT tagy
function microdvdText(t) {
  let italic = false;
  t = t.replace(/\{[yY]:i\}/g, () => { italic = true; return ''; });
  t = t.replace(/\{[^}]*\}/g, '');
  const lines = t.split('|').map(l => {
    if (l.startsWith('/')) return `<i>${l.slice(1)}</i>`;
    return l;
  });
  const out = lines.join('\n');
  return italic ? `<i>${out}</i>` : out;
}

// ── Převody ─────────────────────────────────────────────────────

function microdvdToSrt(text, fps) {
  const lines = text.split(/\r?\n/);
  let rate = Number(fps) > 0 ? Number(fps) : 0;
  const cues = [];
  for (const line of lines) {
    const m = line.match(/^\s*\{(\d+)\}\{(\d*)\}(.*)$/);
    if (!m) continue;
    const a = +m[1];
    const b = m[2] === '' ? a + 1 : +m[2];
    // Konvence: první řádek {1}{1}23.976 = FPS
    if (cues.length === 0 && a <= 1 && b <= 1 && /^\s*\d{2}(?:[.,]\d+)?\s*$/.test(m[3])) {
      const f = parseFloat(m[3].replace(',', '.'));
      if (f > 10 && f < 100 && !rate) rate = f;
      continue;
    }
    cues.push({ a, b, text: m[3] });
  }
  if (!rate) rate = 23.976;
  return buildSrt(cues.map(c => ({
    start: (c.a / rate) * 1000,
    end: (c.b / rate) * 1000,
    text: microdvdText(c.text),
  })));
}

function subviewerToSrt(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(\d{1,2}):(\d{2}):(\d{2})\.(\d{2}),(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})\s*$/);
    if (!m) continue;
    const start = ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] * 10;
    const end = ((+m[5] * 60 + +m[6]) * 60 + +m[7]) * 1000 + +m[8] * 10;
    const txt = (lines[i + 1] || '').replace(/\[br\]/gi, '\n').replace(/\|/g, '\n');
    out.push({ start, end, text: txt });
  }
  return buildSrt(out);
}

function mpl2ToSrt(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\[(\d+)\]\[(\d*)\](.*)$/);
    if (!m) continue;
    const start = +m[1] * 100;
    const end = m[2] === '' ? start + 2000 : +m[2] * 100;
    out.push({ start, end, text: m[3].split('|').map(l => (l.startsWith('/') ? `<i>${l.slice(1)}</i>` : l)).join('\n') });
  }
  return buildSrt(out);
}

function assTimeToMs(t) {
  const m = String(t).trim().match(/(\d+):(\d+):(\d+)[.,](\d+)/);
  if (!m) return 0;
  const frac = m[4].padEnd(3, '0').slice(0, 3);
  return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +frac;
}

function parseAss(text) {
  const lines = text.split(/\r?\n/);
  let inEvents = false;
  let fields = [];
  const cues = [];
  const styles = {};
  let inStyles = false;
  let styleFields = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[V4\+? Styles\]/i.test(line)) { inStyles = true; inEvents = false; continue; }
    if (/^\[Events\]/i.test(line)) { inEvents = true; inStyles = false; continue; }
    if (/^\[/.test(line)) { inEvents = false; inStyles = false; continue; }
    if (inStyles && /^Format:/i.test(line)) {
      styleFields = line.replace(/^Format:\s*/i, '').split(',').map(f => f.trim().toLowerCase());
      continue;
    }
    if (inStyles && /^Style:/i.test(line)) {
      const parts = line.replace(/^Style:\s*/i, '').split(',');
      const get = n => { const i = styleFields.indexOf(n); return i >= 0 ? (parts[i] || '').trim() : ''; };
      styles[get('name')] = {
        bold: get('bold') === '-1' || get('bold') === '1',
        italic: get('italic') === '-1' || get('italic') === '1',
        color: assColor(get('primarycolour')),
      };
      continue;
    }
    if (inEvents && /^Format:/i.test(line)) {
      fields = line.replace(/^Format:\s*/i, '').split(',').map(f => f.trim().toLowerCase());
      continue;
    }
    if (inEvents && /^Dialogue:/i.test(line) && fields.length) {
      const parts = line.replace(/^Dialogue:\s*/i, '').split(',');
      const ti = fields.indexOf('text');
      if (ti < 0 || parts.length < fields.length) continue;
      const get = n => { const i = fields.indexOf(n); return i >= 0 ? (parts[i] || '').trim() : ''; };
      cues.push({
        start: assTimeToMs(get('start')),
        end: assTimeToMs(get('end')),
        style: get('style'),
        raw: parts.slice(ti).join(','),
      });
    }
  }
  cues.sort((a, b) => a.start - b.start);
  return { cues, styles };
}

function assColor(c) {
  const m = String(c || '').replace(/^&H/i, '').replace(/&$/, '');
  if (m.length < 6) return null;
  const hex = m.slice(-6);
  return `#${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`.toLowerCase();
}

function assInlineToHtml(t) {
  return t
    .replace(/\{\\b1\}/g, '<b>').replace(/\{\\b0\}/g, '</b>')
    .replace(/\{\\i1\}/g, '<i>').replace(/\{\\i0\}/g, '</i>')
    .replace(/\{\\u1\}/g, '<u>').replace(/\{\\u0\}/g, '</u>')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n').replace(/\\n/g, '\n').replace(/\\h/g, ' ');
}

function assToSrt(text) {
  const { cues, styles } = parseAss(text);
  return buildSrt(cues.map(c => {
    let t = assInlineToHtml(c.raw);
    const st = styles[c.style];
    if (st && st.italic) t = `<i>${t}</i>`;
    return { start: c.start, end: c.end, text: t };
  }));
}

function msToVtt(ms) { return msToSrt(ms).replace(',', '.'); }

function assToVtt(text) {
  const { cues, styles } = parseAss(text);
  const body = cues
    .filter(c => c.end > c.start)
    .map(c => {
      let t = assInlineToHtml(c.raw).trim();
      const st = styles[c.style];
      if (st) {
        if (st.bold) t = `<b>${t}</b>`;
        if (st.italic) t = `<i>${t}</i>`;
      }
      return t ? `${msToVtt(c.start)} --> ${msToVtt(c.end)}\n${t}\n` : '';
    })
    .filter(Boolean)
    .join('\n');
  return 'WEBVTT\n\n' + body;
}

function vttToSrt(text) {
  const blocks = text.replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n/, '').split(/\n{2,}/);
  const cues = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const m = lines[i].match(/((?:\d+:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}\.\d{3})/);
    if (!m) continue;
    const toMs = t => { const p = t.split(':'); if (p.length === 2) p.unshift('0'); return assTimeToMs(p.join(':')); };
    cues.push({ start: toMs(m[1]), end: toMs(m[2]), text: lines.slice(i + 1).join('\n').replace(/<\/?c[^>]*>/g, '') });
  }
  return buildSrt(cues);
}

// Úklid SRT: sjednotit konce řádků, zahodit prázdné bloky
function cleanSrt(text) {
  return text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').trim() + '\n';
}

// Hlavní vstup: cokoliv → UTF-8 SRT
function toSrt(input, { fps } = {}) {
  const text = toUtf8String(input);
  switch (detectFormat(text)) {
    case 'srt': return cleanSrt(text);
    case 'microdvd': return microdvdToSrt(text, fps);
    case 'ass': return assToSrt(text);
    case 'vtt': return vttToSrt(text);
    case 'subviewer': return subviewerToSrt(text);
    case 'mpl2': return mpl2ToSrt(text);
    default: return cleanSrt(text);
  }
}

function srtToVtt(srt) {
  const body = String(srt).replace(/\r\n/g, '\n').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body.trim() + '\n';
}

// Hlášení jako titulek (na 30 s), aby ho uživatel viděl přímo v přehrávači
function messageSrt(msg) {
  return `1\n00:00:01,000 --> 00:00:30,000\n${msg}\n`;
}

module.exports = { toUtf8String, detectFormat, toSrt, srtToVtt, assToVtt, messageSrt };
