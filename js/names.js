// ── Name Generator ──────────────────────────────────────────
// Pairs a random dictionary adjective + noun (optionally with an
// English street-type suffix) for quick street/place naming.

let DICT = {};
let nameMode = 'suffix'; // 'suffix' | 'plain'

const STREET_SUFFIXES = [
  'Street', 'Road', 'Avenue', 'Lane', 'Way', 'Court', 'Circle',
  'Boulevard', 'Drive', 'Path', 'Row', 'Terrace', 'Trail',
  'Crossing', 'Walk', 'Alley', 'Passage', 'Highway'
];

const DEFAULT_BLOCKLIST = [
  'road', 'street', 'path', 'way', 'lane', 'passage', 'route',
  'trail', 'track', 'walk', 'avenue', 'boulevard', 'drive',
  'court', 'circle', 'alley', 'row', 'terrace', 'crossing', 'highway'
];

let kept = []; // { conlang, gloss }

// ── Data loading ─────────────────────────────────────────
async function loadDictionary() {
  try {
    const res = await fetch('dictionary.json');
    if (!res.ok) throw new Error('fetch failed');
    DICT = await res.json();
  } catch (e) {
    DICT = {};
    console.warn('Could not load dictionary.json:', e.message);
  }
  document.getElementById('blocklist-input').value = DEFAULT_BLOCKLIST.join(', ');
  generateBatch();
}

// ── Helpers ──────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function firstDef(data) {
  const defs = Array.isArray(data.def) ? data.def : [data.def];
  return defs.find(Boolean) || '';
}

// Best-effort short gloss from a full prose definition: strip a
// leading article, take the first clause, cap it to a few words.
function shortGloss(def) {
  if (!def) return '';
  let s = def.replace(/^\s*(a|an|the)\s+/i, '');
  s = s.split(/[,;]/)[0].trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 3) s = words.slice(0, 3).join(' ');
  return s.split(/\s+/).map(w => capitalize(w)).join(' ');
}

function getBlocklist() {
  return document.getElementById('blocklist-input').value
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
}

function isRoady(data, blocklist) {
  const defs = Array.isArray(data.def) ? data.def : [data.def];
  return defs.some(d => d && blocklist.some(w => new RegExp(`\\b${w}\\b`, 'i').test(d)));
}

function getPools() {
  const adjs = Object.entries(DICT).filter(([w, d]) =>
    d.pos && d.pos.toLowerCase().startsWith('adj') && !/\s/.test(w));
  const nouns = Object.entries(DICT).filter(([w, d]) =>
    d.pos && d.pos.toLowerCase() === 'noun' && !/\s/.test(w));
  return { adjs, nouns };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Generation ───────────────────────────────────────────
function generateOne() {
  const { adjs, nouns } = getPools();
  if (!adjs.length || !nouns.length) return null;

  const [adjWord, adjData] = pickRandom(adjs);

  let nounPool = nouns;
  if (nameMode === 'suffix') {
    const blocklist = getBlocklist();
    const filtered = nouns.filter(([w, d]) => !isRoady(d, blocklist));
    nounPool = filtered.length ? filtered : nouns;
  }
  const [nounWord, nounData] = pickRandom(nounPool);

  const suffix = nameMode === 'suffix' ? pickRandom(STREET_SUFFIXES) : null;

  const conlang = [capitalize(adjWord), capitalize(nounWord), suffix].filter(Boolean).join(' ');
  const gloss = [shortGloss(firstDef(adjData)), shortGloss(firstDef(nounData)), suffix].filter(Boolean).join(' ');

  return { conlang, gloss };
}

function setNameMode(mode) {
  nameMode = mode;
  document.getElementById('mode-suffix-btn').classList.toggle('active', mode === 'suffix');
  document.getElementById('mode-plain-btn').classList.toggle('active', mode === 'plain');
}

function generateBatch() {
  const { adjs, nouns } = getPools();
  const emptyEl = document.getElementById('namegen-empty');
  const gridEl = document.getElementById('name-grid');

  if (adjs.length < 1 || nouns.length < 1) {
    emptyEl.style.display = 'block';
    gridEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';

  const count = Math.max(1, Math.min(50, parseInt(document.getElementById('batch-size').value, 10) || 10));
  const results = [];
  for (let i = 0; i < count; i++) {
    const r = generateOne();
    if (r) results.push(r);
  }
  renderGrid(results);
}

function renderGrid(results) {
  const gridEl = document.getElementById('name-grid');
  gridEl.innerHTML = results.map((r, i) => `
    <div class="name-card" data-index="${i}">
      <input class="name-conlang-input" value="${escapeHtml(r.conlang)}">
      <input class="name-gloss-input" value="${escapeHtml(r.gloss)}">
      <div class="name-card-actions">
        <button class="name-mini-btn" onclick="rerollCard(this)">↻ reroll</button>
        <button class="name-mini-btn" onclick="pinCard(this)">+ keep</button>
      </div>
    </div>
  `).join('');
}

function rerollCard(btn) {
  const card = btn.closest('.name-card');
  const r = generateOne();
  if (!r) return;
  card.querySelector('.name-conlang-input').value = r.conlang;
  card.querySelector('.name-gloss-input').value = r.gloss;
  const pinBtn = card.querySelector('.name-mini-btn:last-child');
  pinBtn.classList.remove('pinned');
  pinBtn.textContent = '+ keep';
}

function pinCard(btn) {
  const card = btn.closest('.name-card');
  const conlang = card.querySelector('.name-conlang-input').value.trim();
  const gloss = card.querySelector('.name-gloss-input').value.trim();
  if (!conlang) return;
  kept.push({ conlang, gloss });
  btn.classList.add('pinned');
  btn.textContent = '✓ kept';
  renderKept();
}

// ── Kept list ────────────────────────────────────────────
function renderKept() {
  const listEl = document.getElementById('kept-list');
  if (!kept.length) {
    listEl.innerHTML = `<div class="kept-empty">Nothing kept yet — generate some names and hit "+ keep" on the ones you like.</div>`;
    return;
  }
  listEl.innerHTML = kept.map((k, i) => `
    <div class="kept-item">
      <div>
        <span class="kept-text">${escapeHtml(k.conlang)}</span>
        <span class="kept-gloss">${escapeHtml(k.gloss)}</span>
      </div>
      <button onclick="removeKept(${i})" aria-label="Remove">✕</button>
    </div>
  `).join('');
}

function removeKept(index) {
  kept.splice(index, 1);
  renderKept();
}

function clearKeptList() {
  kept = [];
  renderKept();
}

function keptAsText() {
  return kept.map(k => `${k.conlang} — ${k.gloss}`).join('\n');
}

function copyKeptList() {
  if (!kept.length) return;
  navigator.clipboard.writeText(keptAsText());
}

function downloadKeptList() {
  if (!kept.length) return;
  const blob = new Blob([keptAsText()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aistvharkol-names.txt';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Init ─────────────────────────────────────────────────
document.getElementById('blocklist-input').addEventListener('change', () => {
  // no-op trigger point; blocklist is read live from the field on each generation
});

renderKept();
loadDictionary();
