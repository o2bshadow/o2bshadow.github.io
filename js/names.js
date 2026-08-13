// ── Name Generator ──────────────────────────────────────────
// Builds street/place names from dictionary word classes, with
// optional bound morphology layered on top.
//
// Structure:
//  - MODIFIER slot: bare adjectives, optionally bare adverbs,
//    optionally noun+'id (derived adjective), optionally
//    verb+'ka (present participle, adjectival).
//  - HEAD slot: bare nouns, optionally noun+<suffix> for any
//    active regular noun suffix, optionally verb+'r or verb+'ir
//    (nominalizations — a verb becomes noun-like).
//  - A verb is NEVER used bare. It only ever appears already
//    combined with 'r, 'ir, or 'ka. If none of those three are
//    toggled on, verbs are excluded from generation entirely.
//  - 1-word names are restricted to a bare adjective or bare
//    noun, per spec: no suffixes, no verbs, no adverbs.

let DICT = {};
let nameMode = 'suffix';   // 'suffix' | 'plain'  (English street-type suffix or not)
let wordCount = 2;         // 1 | 2

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

// Suffix inventory. `applies` determines where each one is used:
//  - 'noun-optional'   : optional suffix on a chosen noun (HEAD)
//  - 'derive-adj'      : noun + suffix functions as a MODIFIER
//  - 'derive-adv'      : adjective + suffix (kept for future 1-word work, unused directly here)
//  - 'verb-head'       : verb + suffix is mandatory-eligible, functions as HEAD (nominalization)
//  - 'verb-modifier'   : verb + suffix is mandatory-eligible, functions as MODIFIER (participle)
const SUFFIXES = [
  { id: 'pl',     form: "'an",  gloss: 'PL',       label: 'Pluralization',                    applies: 'noun-optional' },
  { id: 'adjz',   form: "'id",  gloss: 'ADJ',      label: 'Adjective Formation',               applies: 'derive-adj' },
  { id: 'abst',   form: "'un",  gloss: 'ABST',     label: 'Abstract State',                    applies: 'noun-optional' },
  { id: 'advz',   form: "'it",  gloss: 'ADV',      label: 'Adverb Formation',                  applies: 'derive-adv' },
  { id: 'rln',    form: "'ri",  gloss: 'RLN',      label: 'Relational/Belonging',               applies: 'noun-optional' },
  { id: 'dim',    form: "'in",  gloss: 'DIM',      label: 'Diminutive',                        applies: 'noun-optional' },
  { id: 'aug',    form: "'odh", gloss: 'AUG',      label: 'Augmentative',                      applies: 'noun-optional' },
  { id: 'nom',    form: "'r",   gloss: 'NOM',      label: 'Verb Nominalization',                applies: 'verb-head' },
  { id: 'poss',   form: "'il",  gloss: 'POSS',     label: 'Possessive',                        applies: 'noun-optional' },
  { id: 'aprt',   form: "'ka",  gloss: 'APRT',     label: 'Present Participle',                applies: 'verb-modifier' },
];

let activeSuffixes = new Set(); // suffix ids currently toggled on

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
  renderSuffixChips();
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

function getBasePools() {
  const adjs = Object.entries(DICT).filter(([w, d]) =>
    d.pos && d.pos.toLowerCase().startsWith('adj') && !/\s/.test(w));
  const nouns = Object.entries(DICT).filter(([w, d]) =>
    d.pos && d.pos.toLowerCase() === 'noun' && !/\s/.test(w));
  const advs = Object.entries(DICT).filter(([w, d]) =>
    d.pos && d.pos.toLowerCase().startsWith('adv') && !/\s/.test(w));
  const verbs = Object.entries(DICT).filter(([w, d]) =>
    d.pos && d.pos.toLowerCase() === 'verb' && !/\s/.test(w));
  return { adjs, nouns, advs, verbs };
}

function pickRandom(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

// A "unit" is a renderable word: { conlang, gloss, rootData }
// rootData is used for the road-word blocklist check on HEAD units.
function bareUnit(word, data) {
  return { conlang: capitalize(word), gloss: shortGloss(firstDef(data)), rootData: data };
}

function suffixedUnit(word, data, suf) {
  return {
    conlang: capitalize(word) + suf.form,
    gloss: `${shortGloss(firstDef(data))} (${suf.gloss})`,
    rootData: data
  };
}

// ── Pool construction ─────────────────────────────────────
function buildModifierPool() {
  const { adjs, nouns, advs, verbs } = getBasePools();
  const useAdverbs = document.getElementById('use-adverbs-toggle').checked;
  const pool = adjs.map(([w, d]) => bareUnit(w, d));

  if (useAdverbs) {
    advs.forEach(([w, d]) => pool.push(bareUnit(w, d)));
  }

  const adjzSuffix = SUFFIXES.find(s => s.id === 'adjz');
  if (activeSuffixes.has('adjz')) {
    nouns.forEach(([w, d]) => pool.push(suffixedUnit(w, d, adjzSuffix)));
  }

  const aprtSuffix = SUFFIXES.find(s => s.id === 'aprt');
  if (activeSuffixes.has('aprt')) {
    verbs.forEach(([w, d]) => pool.push(suffixedUnit(w, d, aprtSuffix)));
  }

  return pool;
}

function buildHeadPool() {
  const { nouns, verbs } = getBasePools();
  const pool = nouns.map(([w, d]) => bareUnit(w, d));

  SUFFIXES.filter(s => s.applies === 'noun-optional' && activeSuffixes.has(s.id))
    .forEach(suf => {
      nouns.forEach(([w, d]) => pool.push(suffixedUnit(w, d, suf)));
    });

  SUFFIXES.filter(s => s.applies === 'verb-head' && activeSuffixes.has(s.id))
    .forEach(suf => {
      verbs.forEach(([w, d]) => pool.push(suffixedUnit(w, d, suf)));
    });

  return pool;
}

// ── Suffix chip UI ────────────────────────────────────────
function renderSuffixChips() {
  const container = document.getElementById('suffix-toggles');
  container.innerHTML = `<span class="small-label">Suffixes</span>` + SUFFIXES.map(suf => {
    const isVerb = suf.applies === 'verb-head' || suf.applies === 'verb-modifier';
    const active = activeSuffixes.has(suf.id);
    return `<button class="suffix-chip ${isVerb ? 'verb-chip' : ''} ${active ? 'active' : ''}" data-id="${suf.id}" onclick="toggleSuffix('${suf.id}')" title="${escapeHtml(suf.label)}">${escapeHtml(suf.form)} <span class="chip-gloss">${escapeHtml(suf.gloss)}</span></button>`;
  }).join('');
}

function toggleSuffix(id) {
  if (activeSuffixes.has(id)) {
    activeSuffixes.delete(id);
  } else {
    activeSuffixes.add(id);
  }
  renderSuffixChips();
}

function setWordCount(n) {
  wordCount = n;
  document.getElementById('count-2-btn').classList.toggle('active', n === 2);
  document.getElementById('count-1-btn').classList.toggle('active', n === 1);
  document.getElementById('adverb-toggle-label').style.opacity = n === 2 ? '1' : '0.4';
}

function setNameMode(mode) {
  nameMode = mode;
  document.getElementById('mode-suffix-btn').classList.toggle('active', mode === 'suffix');
  document.getElementById('mode-plain-btn').classList.toggle('active', mode === 'plain');
}

// ── Generation ───────────────────────────────────────────
function generateOne() {
  const blocklist = nameMode === 'suffix' ? getBlocklist() : null;

  if (wordCount === 1) {
    const { adjs, nouns, verbs } = getBasePools();
    const pool = [
      ...adjs.map(([w, d]) => bareUnit(w, d)),
      ...nouns.map(([w, d]) => bareUnit(w, d))
    ];

    // Add nominalized/relational verbs if toggled on
    const verbHeadSuffixes = SUFFIXES.filter(
      s => s.applies === 'verb-head' && activeSuffixes.has(s.id)
    );
    verbHeadSuffixes.forEach(suf => {
      verbs.forEach(([w, d]) => pool.push(suffixedUnit(w, d, suf)));
    });

    // Add participle verbs if APRT is toggled on
    const aprtSuffix = SUFFIXES.find(s => s.id === 'aprt');
    if (activeSuffixes.has('aprt')) {
      verbs.forEach(([w, d]) => pool.push(suffixedUnit(w, d, aprtSuffix)));
    }

    // Filter against road blocklist if street suffix mode is enabled
    const filtered = blocklist
      ? pool.filter(u => !isRoady(u.rootData, blocklist))
      : pool;
    const source = filtered.length ? filtered : pool;
    const pickedUnit = pickRandom(source);
    if (!pickedUnit) return null;

    const suffix = nameMode === 'suffix' ? pickRandom(STREET_SUFFIXES) : null;
    return {
      conlang: [pickedUnit.conlang, suffix].filter(Boolean).join(' '),
      gloss: [pickedUnit.gloss, suffix].filter(Boolean).join(' ')
    };
  }


// ── 2-Word Names ───────────────────────────────────────
  const modifierPool = buildModifierPool();
  let headPool = buildHeadPool();
  if (blocklist) {
    const filtered = headPool.filter(u => !isRoady(u.rootData, blocklist));
    if (filtered.length) headPool = filtered;
  }

  const modifier = pickRandom(modifierPool);
  const head = pickRandom(headPool);
  if (!modifier || !head) return null;

  // Randomize word order (50% Adj/Noun vs. 50% Noun/Adj)
  const isHeadFirst = Math.random() < 0.5;
  const firstUnit = isHeadFirst ? head : modifier;
  const secondUnit = isHeadFirst ? modifier : head;

  const suffix = nameMode === 'suffix' ? pickRandom(STREET_SUFFIXES) : null;

  return {
    conlang: [firstUnit.conlang, secondUnit.conlang, suffix].filter(Boolean).join(' '),
    gloss: [firstUnit.gloss, secondUnit.gloss, suffix].filter(Boolean).join(' ')
  };
}

function generateBatch() {
  const { adjs, nouns } = getBasePools();
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

  lucide.createIcons();
}

function renderGrid(results) {
  const gridEl = document.getElementById('name-grid');
  if (!results.length) {
    gridEl.innerHTML = `<div class="no-results">No valid combinations with the current toggles — try enabling a verb suffix, or check that your dictionary has both adjectives and nouns.</div>`;
    return;
  }
  gridEl.innerHTML = results.map((r, i) => `
    <div class="name-card" data-index="${i}">
      <input class="name-conlang-input" value="${escapeHtml(r.conlang)}">
      <input class="name-gloss-input" value="${escapeHtml(r.gloss)}">
      <div class="name-card-actions">
        <button class="name-mini-btn" onclick="rerollCard(this)">
          <i data-lucide="rotate-ccw" class="mini-icon"></i> reroll
        </button>
        <button class="name-mini-btn" onclick="pinCard(this)">
          <i data-lucide="circle-plus" class="mini-icon"></i> keep
        </button>
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
  
  // Revert keep button structure back to normal
  pinBtn.innerHTML = `<i data-lucide="circle-plus" class="mini-icon"></i> keep`;
  lucide.createIcons();
}

function pinCard(btn) {
  const card = btn.closest('.name-card');
  const conlang = card.querySelector('.name-conlang-input').value.trim();
  const gloss = card.querySelector('.name-gloss-input').value.trim();
  if (!conlang) return;
  kept.push({ conlang, gloss });
  
  btn.classList.add('pinned');
  // Swap to checkmark icon instantly
  btn.innerHTML = `<i data-lucide="clipboard-check" class="mini-icon"></i> kept`;
  
  lucide.createIcons();
  renderKept();
}


// ── Kept list ────────────────────────────────────────────
function renderKept() {
  const listEl = document.getElementById('kept-list');
  if (!kept.length) {
    listEl.innerHTML = `<div class="kept-empty">Nothing kept yet!</div>`;
    return;
  }
  
  listEl.innerHTML = kept.map((k, i) => `
    <div class="kept-item">
      <div>
        <span class="kept-text">${escapeHtml(k.conlang)}</span>
        <span class="kept-gloss">${escapeHtml(k.gloss)}</span>
      </div>
      <!-- Replaced the plain X button with a Lucide Trash button -->
      <button class="remove-kept-btn" onclick="removeKept(${i}, this)" aria-label="Remove">
        <i data-lucide="trash-2" class="remove-icon"></i>
      </button>
    </div>
  `).join('');

  // Critical: Tells Lucide to find and render the trash icons instantly
  lucide.createIcons();
}


function removeKept(index, btnEl) {
  // If the button wasn't passed directly by 'this', find it via index
  const btn = btnEl || document.querySelectorAll('.remove-kept-btn')[index];
  if (!btn) {
    // Fallback safety if button lookup fails
    kept.splice(index, 1);
    renderKept();
    return;
  }

  // 1. Trigger visual 'removed' state instantly
  btn.innerHTML = `<i data-lucide="trash-2" class="remove-icon"></i>`;
  btn.classList.add('removed');
  lucide.createIcons();

  // 2. Wait for the quick flash animation before removing from data array
  setTimeout(() => {
    kept.splice(index, 1);
    renderKept();
  }, 300); 
}

function clearKeptList() {
  if (!kept.length) return;
  const btn = document.getElementById("clear-list-btn") || document.querySelector('.kept-list-actions button:nth-child(3)');
  if (!btn) return;

  // Trigger visual 'cleared' flash feedback
  btn.innerHTML = `<i data-lucide="trash" class="copy-icon"></i> Cleared!`;
  btn.classList.add('cleared');
  lucide.createIcons();

  setTimeout(() => {
    kept = [];
    renderKept();
  }, 100); // Wipes the list view after the visual flash completes

  setTimeout(() => {
      btn.innerHTML = `<i data-lucide="trash-2" class="copy-icon"></i> Clear All`;
      btn.classList.remove('copied');
      lucide.createIcons();
    }, 1400);
}

function keptAsText() {
  return kept.map(k => `${k.conlang} — ${k.gloss}`).join('\n');
}

function copyKeptList() {
  if (!kept.length) return;
  const btn = document.getElementById('copy-list-btn');
  if (!btn) return;

  navigator.clipboard.writeText(keptAsText()).then(() => {
    btn.innerHTML = `<i data-lucide="clipboard-check" class="copy-icon"></i> Copied!`;
    btn.classList.add('copied');
    lucide.createIcons();

    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="clipboard-copy" class="copy-icon"></i> Copy List`;
      btn.classList.remove('copied');
      lucide.createIcons();
    }, 1500);
  });
}


function downloadKeptList() {
  if (!kept.length) return;
  const btn = document.querySelector('.download-btn') || document.querySelector('.kept-list-actions button:nth-child(2)');
  if (!btn) return;

  const blob = new Blob([keptAsText()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aistvharkol-names.txt';
  a.click();
  URL.revokeObjectURL(url);

  // Trigger visual 'downloaded' feedback
  btn.innerHTML = `<i data-lucide="check" class="mini-icon"></i> Downloaded!`;
  btn.classList.add('downloaded');
  lucide.createIcons();

  setTimeout(() => {
    btn.innerHTML = `<i data-lucide="download" class="mini-icon"></i> Download`;
    btn.classList.remove('downloaded');
    lucide.createIcons();
  }, 1500);
}

// ── Init ─────────────────────────────────────────────────
renderKept();
loadDictionary();