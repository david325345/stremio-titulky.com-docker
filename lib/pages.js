'use strict';

// HTML stránky: konfigurace a dashboard. Všechna data do stránek jdou buď escapovaná,
// nebo jako JSON v <script type="application/json"> a vykreslují se přes textContent.

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function jsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const BASE_CSS = `
  :root {
    --bg: #0c0e14; --surface: #151821; --surface-2: #1c2030; --border: #2a2e40;
    --accent: #4f8cff; --accent-hover: #6ba0ff; --accent-glow: rgba(79,140,255,0.15);
    --text: #e4e7f0; --text-dim: #8891a8; --danger: #ff5c5c; --success: #4fdb8a; --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .subtitle { color: var(--text-dim); font-size: 14px; line-height: 1.5; }
  label { display: block; font-size: 13px; font-weight: 600; color: var(--text-dim); margin-bottom: 6px; }
  input[type="text"], input[type="password"], select {
    width: 100%; padding: 12px 16px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text); font-family: inherit; font-size: 14px; outline: none;
  }
  input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
  .btn {
    width: 100%; padding: 14px; border: none; border-radius: var(--radius); font-family: inherit;
    font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none;
  }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-install { background: var(--success); color: #0c0e14; margin-top: 12px; }
  .btn-secondary { background: var(--surface-2); border: 1px solid var(--border); color: var(--text); margin-top: 8px; }
  .btn-secondary:hover { border-color: var(--accent); }
  .status { text-align: center; font-size: 14px; margin-top: 16px; min-height: 20px; }
  .status.error { color: var(--danger); }
  .status.ok { color: var(--success); }
`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

// ── Konfigurace ─────────────────────────────────────────────────

function configurePage() {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Titulky.com – Stremio / Nuvio addon</title>
${FONTS}
<style>
${BASE_CSS}
  body { display: flex; align-items: center; justify-content: center; padding: 24px; overflow-x: hidden; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 44px 40px;
    max-width: 460px; width: 100%; box-shadow: 0 24px 80px rgba(0,0,0,0.4); }
  .logo-row { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .logo-icon { width: 44px; height: 44px; background: var(--accent-glow); border-radius: 12px; display: flex;
    align-items: center; justify-content: center; font-size: 22px; border: 1px solid rgba(79,140,255,0.2); }
  h1 { font-size: 22px; font-weight: 700; }
  .card > .subtitle { margin-bottom: 28px; }
  .field { margin-bottom: 18px; }
  .hint { font-size: 12px; color: var(--text-dim); margin-top: 6px; line-height: 1.4; }
  .result { display: none; margin-top: 8px; }
  .result.show { display: block; }
  .divider { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  .url-box { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px;
    font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-dim); word-break: break-all; line-height: 1.6; }
  .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%;
    animation: spin 0.6s linear infinite; display: none; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #rdField { display: none; }
  @media (max-width: 500px) { .card { padding: 32px 22px; } }
</style>
</head>
<body>
<div class="card">
  <div class="logo-row"><div class="logo-icon">🎬</div><h1>Titulky.com</h1></div>
  <p class="subtitle">Přihlaste se svým účtem z Titulky.com pro české a slovenské titulky ve Stremiu a Nuviu.</p>

  <div id="form">
    <div class="field">
      <label for="username">Uživatelské jméno</label>
      <input type="text" id="username" autocomplete="username" placeholder="Váš login">
    </div>
    <div class="field">
      <label for="password">Heslo</label>
      <input type="password" id="password" autocomplete="current-password" placeholder="Vaše heslo">
    </div>
    <div class="field">
      <label for="client">Přehrávač</label>
      <select id="client">
        <option value="auto">Automaticky (doporučeno)</option>
        <option value="stremio">Stremio</option>
        <option value="nuvio">Nuvio / NuvioTV</option>
        <option value="omni">Omni (Apple TV)</option>
      </select>
      <p class="hint">Addon sám pozná, odkud se ptáte. Ruční volbu použijte, jen když se titulky zobrazují špatně.</p>
    </div>
    <div class="field" id="rdField">
      <label for="rdToken">Real-Debrid API klíč (volitelné)</label>
      <input type="text" id="rdToken" placeholder="real-debrid.com/apitoken" style="font-family:'JetBrains Mono',monospace;font-size:12px">
      <p class="hint">Lepší párování titulků podle souboru z Real-Debridu (Omni neposílá název souboru).</p>
    </div>
    <button class="btn btn-primary" id="verifyBtn"><span class="spinner" id="spinner"></span><span id="btnText">Ověřit a nainstalovat</span></button>
    <div class="status" id="status"></div>
  </div>

  <div class="result" id="result">
    <p class="status ok" id="savedInfo">✓ Přihlášení úspěšné</p>
    <hr class="divider">
    <a class="btn btn-install" id="installLink" href="#">📦 Nainstalovat do Stremio (aplikace)</a>
    <a class="btn btn-install" id="webInstallLink" href="#" target="_blank" rel="noopener" style="background:var(--accent);color:#fff;margin-top:8px">🌐 Nainstalovat přes Stremio Web</a>
    <button class="btn btn-secondary" id="copyBtn">📋 Kopírovat URL addonu (Nuvio apod.)</button>
    <a class="btn btn-secondary" id="dashboardLink" href="#">📺 Dashboard – vlastní titulky</a>
    <div style="margin-top:16px"><label>URL addonu</label><div class="url-box" id="addonUrl"></div></div>
    <button class="btn btn-secondary" id="resetBtn" style="margin-top:16px">↺ Nové přihlášení / změna nastavení</button>
  </div>
</div>

<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STORE_KEY = 'titulky_config_v2';

  function toggleRd() { $('rdField').style.display = $('client').value === 'omni' ? 'block' : 'none'; }
  $('client').addEventListener('change', toggleRd);

  function showResult(config, info) {
    var manifestUrl = location.origin + '/' + config + '/manifest.json';
    $('installLink').href = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
    $('webInstallLink').href = 'https://web.stremio.com/#/addons?addon=' + encodeURIComponent(manifestUrl);
    $('dashboardLink').href = '/' + config + '/dashboard';
    $('addonUrl').textContent = manifestUrl;
    $('savedInfo').textContent = info;
    $('form').style.display = 'none';
    $('result').classList.add('show');
  }

  async function verify() {
    var username = $('username').value.trim();
    var password = $('password').value;
    var status = $('status');
    if (!username || !password) { status.className = 'status error'; status.textContent = 'Vyplňte jméno i heslo'; return; }
    $('verifyBtn').disabled = true; $('spinner').style.display = 'block'; $('btnText').textContent = 'Ověřuji…';
    status.className = 'status'; status.textContent = '';
    try {
      var res = await fetch('/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, client: $('client').value, rdToken: $('rdToken').value.trim() }),
      });
      var data = await res.json();
      if (data.success && data.config) {
        try { localStorage.setItem(STORE_KEY, data.config); localStorage.removeItem('titulky_config'); } catch (e) {}
        showResult(data.config, '✓ Přihlášení úspěšné');
      } else {
        status.className = 'status error';
        status.textContent = data.error === 'server' ? '✗ Titulky.com teď neodpovídá, zkuste to později' : '✗ Nesprávné přihlašovací údaje';
      }
    } catch (e) {
      status.className = 'status error'; status.textContent = 'Chyba připojení: ' + e.message;
    }
    $('verifyBtn').disabled = false; $('spinner').style.display = 'none'; $('btnText').textContent = 'Ověřit a nainstalovat';
  }

  $('verifyBtn').addEventListener('click', verify);
  $('password').addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });
  $('copyBtn').addEventListener('click', function () {
    navigator.clipboard.writeText($('addonUrl').textContent).then(function () {
      $('copyBtn').textContent = '✓ Zkopírováno';
      setTimeout(function () { $('copyBtn').textContent = '📋 Kopírovat URL addonu (Nuvio apod.)'; }, 2000);
    });
  });
  $('resetBtn').addEventListener('click', function () {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    $('result').classList.remove('show'); $('form').style.display = 'block';
  });

  // Uložený config (jen šifrovaný řetězec, žádné heslo)
  try {
    var saved = localStorage.getItem(STORE_KEY);
    localStorage.removeItem('titulky_config'); // stará verze ukládala heslo – smazat
    if (saved && /^v2[A-Za-z0-9_-]+$/.test(saved)) showResult(saved, '✓ Addon je nastavený');
  } catch (e) {}
  toggleRd();
})();
</script>
</body>
</html>`;
}

// ── Dashboard ───────────────────────────────────────────────────

function dashboardPage({ configStr, username, isAdmin, history }) {
  const data = { config: configStr, user: username, admin: !!isAdmin, history: history || [] };
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard – Titulky.com addon</title>
${FONTS}
<style>
${BASE_CSS}
  body { padding: 24px 16px; }
  .container { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  h2 { font-size: 18px; margin-bottom: 8px; }
  .container > .subtitle { margin-bottom: 24px; }
  .history-item { display: flex; gap: 16px; padding: 16px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: 12px; }
  .poster { width: 70px; height: 100px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: var(--surface-2); }
  .history-info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  .history-title { font-weight: 600; font-size: 16px; margin-bottom: 4px; overflow-wrap: anywhere; }
  .history-meta { color: var(--text-dim); font-size: 13px; margin-bottom: 12px; }
  .btn-small { display: inline-flex; width: auto; padding: 9px 16px; font-size: 14px; font-weight: 500;
    background: var(--surface-2); color: var(--accent); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .btn-small:hover { background: var(--border); }
  .back { display: inline-flex; width: auto; margin-bottom: 24px; padding: 9px 16px; color: var(--text-dim);
    border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; font-size: 14px; }
  .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; align-items: center;
    justify-content: center; padding: 16px; }
  .modal.show { display: flex; }
  .modal-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 28px;
    max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; }
  .modal-card h2 { margin-right: 28px; overflow-wrap: anywhere; }
  .close-btn { float: right; background: none; border: none; color: var(--text-dim); font-size: 20px; cursor: pointer; }
  .modal-card label { margin-top: 14px; }
  input[type="file"] { width: 100%; padding: 10px; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text); }
  .existing-sub { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; }
  .existing-sub-info { flex: 1; min-width: 0; }
  .existing-sub-name { display: block; font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .existing-sub-meta { display: block; font-size: 12px; color: var(--text-dim); margin-top: 2px; overflow-wrap: anywhere; }
  .btn-delete { background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--danger); cursor: pointer; padding: 6px 10px; }
  hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
  .table-wrap { overflow-x: auto; }
  table.clients { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.clients th, table.clients td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  table.clients td.ua { font-family: 'JetBrains Mono', monospace; word-break: break-all; min-width: 200px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="container">
  <a href="/configure" class="back">← Zpět na konfiguraci</a>
  <h1>📺 Poslední přehrávané</h1>
  <p class="subtitle">Nahraj vlastní titulky k filmům a dílům seriálů, které jsi přehrával.</p>
  <div id="history"></div>
  <div id="admin" style="display:none">
    <hr>
    <h2>🔧 Admin</h2>
    <p class="subtitle" style="margin-bottom:12px">Záloha a obnova dat v Cloudflare R2.</p>
    <div class="row">
      <a class="btn-small" id="backupLink" href="#">💾 Stáhnout zálohu</a>
      <label class="btn-small" style="margin:0">📂 Nahrát zálohu<input type="file" id="restoreFile" accept=".zip" style="display:none"></label>
    </div>
    <div class="status" id="adminStatus"></div>
    <hr>
    <h2>🔎 Přehrávače (detekce)</h2>
    <p class="subtitle" style="margin-bottom:12px">Hlavičky požadavků na titulky od posledního restartu – podle nich se ladí automatická detekce.</p>
    <button class="btn-small" id="loadClients">Načíst</button>
    <div class="table-wrap" style="margin-top:12px"><table class="clients" id="clients"></table></div>
  </div>
</div>

<div class="modal" id="modal">
  <div class="modal-card">
    <button class="close-btn" id="closeModal" aria-label="Zavřít">✕</button>
    <h2 id="modalTitle"></h2>
    <div id="existing" style="margin-top:12px"></div>
    <hr style="margin:20px 0">
    <h3 style="font-size:15px">Nahrát nové titulky</h3>
    <label for="subFile">Soubor (.srt, .ssa, .ass, .sub, .vtt)</label>
    <input type="file" id="subFile" accept=".srt,.ssa,.ass,.sub,.vtt">
    <label for="subLabel">Popis (volitelné)</label>
    <input type="text" id="subLabel" maxlength="100" placeholder="např. CZ fansub, 1080p BluRay">
    <label for="subLang">Jazyk</label>
    <select id="subLang"><option value="cze">Čeština</option><option value="slk">Slovenčina</option><option value="eng">Angličtina</option></select>
    <button class="btn btn-primary" style="margin-top:20px" id="uploadBtn">📤 Nahrát</button>
    <div class="status" id="uploadStatus"></div>
  </div>
</div>

<script type="application/json" id="data">${jsonForScript(data)}</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('data').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var base = '/' + D.config;
  var current = null;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function epLabel(h) {
    if (h.type !== 'series') return '';
    var p = String(h.id).split(':');
    if (p.length < 3) return '';
    return ' S' + String(p[1]).padStart(2, '0') + 'E' + String(p[2]).padStart(2, '0');
  }

  // Historie
  var hist = $('history');
  if (!D.history.length) {
    hist.appendChild(el('p', { 'class': 'subtitle' }, 'Zatím jsi nic nepřehrával. Pusť si film nebo seriál a vrať se sem.'));
  }
  D.history.forEach(function (h) {
    var item = el('div', { 'class': 'history-item' });
    var img = el('img', { 'class': 'poster', alt: '' });
    if (/^https:\\/\\//.test(h.poster || '')) img.src = h.poster;
    item.appendChild(img);
    var info = el('div', { 'class': 'history-info' });
    var name = (h.name || h.imdbId) + epLabel(h);
    info.appendChild(el('div', { 'class': 'history-title' }, name));
    info.appendChild(el('div', { 'class': 'history-meta' }, (h.type === 'series' ? 'Seriál' : 'Film') + ' · ' + h.imdbId));
    var btn = el('button', { 'class': 'btn-small' }, '📤 Nahrát titulky');
    btn.addEventListener('click', function () { openModal(String(h.id).replace(/:/g, '-'), name); });
    info.appendChild(btn);
    item.appendChild(info);
    hist.appendChild(item);
  });

  // Modal
  function openModal(videoId, name) {
    current = videoId;
    $('modalTitle').textContent = name;
    $('uploadStatus').textContent = '';
    $('subFile').value = '';
    $('subLabel').value = '';
    $('modal').classList.add('show');
    loadExisting();
  }
  function closeModal() { $('modal').classList.remove('show'); }
  $('closeModal').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });

  async function loadExisting() {
    var box = $('existing');
    box.textContent = 'Načítám…';
    try {
      var res = await fetch(base + '/custom-list/' + encodeURIComponent(current));
      var data = await res.json();
      renderExisting(data.subs || []);
    } catch (e) { box.textContent = 'Nepodařilo se načíst titulky'; }
  }

  function renderExisting(subs) {
    var box = $('existing');
    box.textContent = '';
    if (!subs.length) { box.appendChild(el('p', { 'class': 'subtitle' }, 'Žádné nahrané titulky')); return; }
    box.appendChild(el('p', { 'class': 'subtitle', style: 'margin-bottom:8px' }, 'Nahrané titulky:'));
    subs.forEach(function (s) {
      var row = el('div', { 'class': 'existing-sub' });
      var info = el('div', { 'class': 'existing-sub-info' });
      info.appendChild(el('span', { 'class': 'existing-sub-name' }, s.label));
      var lang = s.lang === 'cze' ? 'CZ' : s.lang === 'slk' ? 'SK' : String(s.lang || '').toUpperCase();
      var who = s.uploader && s.uploader !== 'unknown' ? ' · nahrál ' + s.uploader : '';
      info.appendChild(el('span', { 'class': 'existing-sub-meta' }, s.filename + ' · ' + lang + who));
      row.appendChild(info);
      var canDelete = D.admin || (s.uploader && s.uploader.toLowerCase() === String(D.user).toLowerCase());
      if (canDelete) {
        var del = el('button', { 'class': 'btn-delete', title: 'Smazat' }, '🗑');
        del.addEventListener('click', function () { deleteSub(s.key, del, row); });
        row.appendChild(del);
      }
      box.appendChild(row);
    });
  }

  async function deleteSub(key, btn, row) {
    if (!confirm('Opravdu smazat tyto titulky?')) return;
    btn.disabled = true; btn.textContent = '…';
    try {
      var res = await fetch(base + '/custom-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key }) });
      var data = await res.json();
      if (data.success) { row.remove(); if (!$('existing').querySelector('.existing-sub')) renderExisting([]); }
      else { alert('Chyba: ' + (data.error || 'neznámá')); btn.disabled = false; btn.textContent = '🗑'; }
    } catch (e) { alert('Chyba: ' + e.message); btn.disabled = false; btn.textContent = '🗑'; }
  }

  $('uploadBtn').addEventListener('click', async function () {
    var st = $('uploadStatus');
    var f = $('subFile').files[0];
    if (!f) { st.className = 'status error'; st.textContent = 'Vyber soubor'; return; }
    if (!/\\.(srt|ssa|ass|sub|vtt)$/i.test(f.name)) { st.className = 'status error'; st.textContent = 'Podporované formáty: .srt, .ssa, .ass, .sub, .vtt'; return; }
    if (f.size > 1500000) { st.className = 'status error'; st.textContent = 'Soubor je moc velký (max 1,5 MB)'; return; }
    st.className = 'status'; st.textContent = 'Nahrávám…';
    try {
      var bytes = new Uint8Array(await f.arrayBuffer());
      var bin = '';
      for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      var res = await fetch(base + '/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: current, content: btoa(bin), filename: f.name, label: $('subLabel').value.trim(), lang: $('subLang').value }),
      });
      var data = await res.json();
      if (data.success) { st.className = 'status ok'; st.textContent = '✓ Titulky nahrány'; $('subFile').value = ''; $('subLabel').value = ''; loadExisting(); }
      else { st.className = 'status error'; st.textContent = 'Chyba: ' + (data.error || 'neznámá'); }
    } catch (e) { st.className = 'status error'; st.textContent = 'Chyba: ' + e.message; }
  });

  // Admin
  if (D.admin) {
    $('admin').style.display = 'block';
    $('backupLink').href = base + '/admin/backup';
    $('restoreFile').addEventListener('change', async function () {
      var f = this.files[0];
      var st = $('adminStatus');
      if (!f) return;
      if (!confirm('Obnovit data ze zálohy ' + f.name + '? Existující soubory se stejným klíčem se přepíšou.')) { this.value = ''; return; }
      st.className = 'status'; st.textContent = 'Nahrávám zálohu… (' + (f.size / 1048576).toFixed(1) + ' MB)';
      try {
        var fd = new FormData(); fd.append('backup', f);
        var res = await fetch(base + '/admin/restore', { method: 'POST', body: fd });
        var data = await res.json();
        if (data.success) { st.className = 'status ok'; st.textContent = '✓ Obnoveno ' + data.count + ' souborů' + (data.skipped ? ', přeskočeno ' + data.skipped : ''); }
        else { st.className = 'status error'; st.textContent = 'Chyba: ' + (data.error || 'neznámá'); }
      } catch (e) { st.className = 'status error'; st.textContent = 'Chyba: ' + e.message; }
      this.value = '';
    });
    $('loadClients').addEventListener('click', async function () {
      var t = $('clients');
      t.textContent = '';
      try {
        var res = await fetch(base + '/admin/clients');
        var data = await res.json();
        var head = el('tr');
        ['User-Agent', 'Origin', 'Detekce', 'Počet', 'Naposledy'].forEach(function (h) { head.appendChild(el('th', null, h)); });
        t.appendChild(head);
        (data.clients || []).forEach(function (c) {
          var tr = el('tr');
          tr.appendChild(el('td', { 'class': 'ua' }, c.ua || '(prázdný)'));
          tr.appendChild(el('td', null, c.origin || ''));
          tr.appendChild(el('td', null, c.detected));
          tr.appendChild(el('td', null, String(c.count)));
          tr.appendChild(el('td', null, new Date(c.last).toLocaleString('cs-CZ')));
          t.appendChild(tr);
        });
        if (!(data.clients || []).length) t.appendChild(el('tr')).appendChild(el('td', null, 'Zatím žádné požadavky'));
      } catch (e) { t.appendChild(el('tr')).appendChild(el('td', null, 'Chyba: ' + e.message)); }
    });
  }
})();
</script>
</body>
</html>`;
}

module.exports = { configurePage, dashboardPage, escapeHtml };
