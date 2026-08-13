// ── Pronunciation Tool ─────────────────────────────────────
// Reuses the same phonology.json rule set and dictionary.json
// lookup logic as the dictionary editor, wrapped in a
// paste-a-word-or-passage interface with interlinear IPA gloss.

let IPA_RULES = [];
let DICT = {};
let DICT_LOWER = {}; // lowercase headword -> canonical headword

const HISTORY_KEY = 'aistvharkol_pronunciation_history';
const MAX_HISTORY = 15;

// ── Data loading ─────────────────────────────────────────
async function loadPhonology() {
  try {
    const res = await fetch('phonology.json');
    if (!res.ok) throw new Error('phonology.json not found');
    const phonology = await res.json();
    // Sort longest literal match first, same rule as the editor
    IPA_RULES = Object.entries(phonology).sort((a, b) => {
      const litLen = p => p.replace(/\(\?<![^)]+\)/g, '').replace(/[$^]/g, '').length;
      return litLen(b[0]) - litLen(a[0]);
    });
  } catch (e) {
    console.warn('Could not load phonology rules:', e.message);
  }
}

async function loadDictionary() {
  try {
    const res = await fetch('dictionary.json');
    if (!res.ok) throw new Error('dictionary.json not found');
    DICT = await res.json();
  } catch (e) {
    DICT = {};
    console.warn('Could not load dictionary.json:', e.message);
  }
  DICT_LOWER = {};
  for (const key in DICT) {
    DICT_LOWER[key.toLowerCase()] = key;
  }
}

// ── IPA conversion (mirrors dictionary-editor.js) ──────────
function convertToIPA(word) {
  if (!IPA_RULES.length) return '';
  const input = word.toLowerCase();
  let out = '';
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const [pattern, repl] of IPA_RULES) {
      const re = new RegExp(pattern, 'y'); // sticky flag — matches at position i only
      re.lastIndex = i;
      const m = re.exec(input);
      if (m) {
        out += repl;
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += input[i];
      i++;
    }
  }
  return out;
}

// ── Utils ──────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function posClass(pos) {
  if (!pos) return 'pos-other';
  const p = pos.toLowerCase();
  if (p === 'verb') return 'pos-verb';
  if (p === 'noun') return 'pos-noun';
  if (p.startsWith('adj')) return 'pos-adj';
  if (p.startsWith('adv')) return 'pos-adv';
  return 'pos-other';
}

function firstDef(data) {
  const defs = Array.isArray(data.def) ? data.def : [data.def];
  return defs.find(Boolean) || '';
}

// ── Tokenizer ────────────────────────────────────────────
// Recognizes multi-word dictionary entries (idioms) first,
// longest match wins, then falls back to single-word tokens.
// Everything else (spaces, punctuation) is passed through as-is.
function buildTokenRegex() {
  const phraseKeys = Object.keys(DICT)
    .filter(k => /\s/.test(k))
    .sort((a, b) => b.length - a.length);
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const phrasePattern = phraseKeys.map(escapeRe).join('|');
  const wordPattern = "[\\p{L}'\u2019]+";
  const combined = phrasePattern ? `(?:${phrasePattern})|${wordPattern}` : wordPattern;
  return new RegExp(combined, 'giu');
}

function tokenize(text) {
  const tokenRe = buildTokenRegex();
  const tokens = [];
  let lastIndex = 0;
  let m;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ type: 'gap', text: text.slice(lastIndex, m.index) });
    }
    tokens.push({ type: 'word', text: m[0] });
    lastIndex = m.index + m[0].length;
    if (m[0].length === 0) tokenRe.lastIndex++; // safety against zero-length matches
  }
  if (lastIndex < text.length) {
    tokens.push({ type: 'gap', text: text.slice(lastIndex) });
  }
  return tokens;
}

function lookup(word) {
  const key = DICT_LOWER[word.toLowerCase()];
  return key ? { key, data: DICT[key] } : null;
}

// ── Rendering ─────────────────────────────────────────────
function convertText() {
  const raw = document.getElementById('phon-input').value;
  const text = raw.trim();
  const emptyEl = document.getElementById('phon-empty');
  const interlinearEl = document.getElementById('interlinear');
  const summaryEl = document.getElementById('phon-summary-actions');
  const breakdownEl = document.getElementById('breakdown');

  if (!text) {
    emptyEl.style.display = '';
    interlinearEl.innerHTML = '';
    interlinearEl.style.display = 'none';
    summaryEl.style.display = 'none';
    breakdownEl.innerHTML = '';
    return;
  }

  emptyEl.style.display = 'none';
  interlinearEl.style.display = 'flex';

  const tokens = tokenize(text);
  let interlinearHtml = '';
  const seen = new Map(); // lowercase -> { display, ipa, hit }
  const ipaParts = [];

  tokens.forEach(tok => {
    if (tok.type === 'gap') {
      interlinearHtml += `<span class="gloss-punct">${escapeHtml(tok.text)}</span>`;
      return;
    }
    const hit = lookup(tok.text);
    const ipa = convertToIPA(tok.text);
    ipaParts.push(ipa);
    const tooltip = hit ? firstDef(hit.data) : 'not found in dictionary — generated pronunciation only';
    interlinearHtml += `
      <span class="gloss-word ${hit ? 'known' : ''}" title="${escapeHtml(tooltip)}">
        <span class="gloss-orig">${escapeHtml(tok.text)}</span>
        <span class="gloss-ipa">${escapeHtml(ipa)}</span>
      </span>`;
    const lower = tok.text.toLowerCase();
    if (!seen.has(lower)) {
      seen.set(lower, { display: tok.text, ipa, hit });
    }
  });

  interlinearEl.innerHTML = interlinearHtml;
  summaryEl.style.display = 'flex';
  summaryEl.dataset.fullIpa = ipaParts.join(' ');

  let breakdownHtml = `<div class="breakdown-title">Word by word</div>`;
  seen.forEach(({ display, ipa, hit }) => {
    const defs = hit ? (Array.isArray(hit.data.def) ? hit.data.def : [hit.data.def]).filter(Boolean) : [];
    breakdownHtml += `
      <div class="entry">
        <div class="entry-header">
          <span class="entry-word">${escapeHtml(hit ? hit.key : display)}</span>
          <span class="entry-ipa">${escapeHtml(ipa)}</span>
          ${hit && hit.data.pos ? `<span class="pos-badge ${posClass(hit.data.pos)}">${escapeHtml(hit.data.pos)}</span>` : ''}
        </div>
        ${defs.length
          ? `<ol class="entry-defs">${defs.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ol>`
          : `<div class="entry-unknown">No dictionary entry — pronunciation generated from phonology rules only.</div>`}
        
        <!-- Updated to match copy-btn framework -->
        <button class="copy-btn" data-text="${escapeHtml(ipa)}" onclick="copyText(this)">
          <i data-lucide="clipboard-copy" class="copy-icon"></i> copy IPA
        </button>
      </div>`;
  });
  breakdownEl.innerHTML = breakdownHtml;

  lucide.createIcons();

  saveHistory(text);


  saveHistory(text);
}

function clearTool() {
  document.getElementById('phon-input').value = '';
  convertText();
}

// ── Copy helpers ────────────────────────────────────────────
function copyText(btn) {
  const text = btn.dataset.text;
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = `<i data-lucide="clipboard-check" class="copy-icon"></i> copied`;
    btn.classList.add('copied');
    lucide.createIcons();

    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="clipboard-copy" class="copy-icon"></i> copy IPA`;
      btn.classList.remove('copied');
      lucide.createIcons();
    }, 1500);
  });
}

function copyAllIPA() {
  const summaryEl = document.getElementById('phon-summary-actions');
  const text = summaryEl.dataset.fullIpa || '';
  const btn = document.getElementById('copy-all-btn');
  if (!btn || !text) return;

  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = `<i data-lucide="clipboard-check" class="copy-icon"></i> Copied All!`;
    btn.classList.add('copied');
    lucide.createIcons();

    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="clipboard-copy" class="copy-icon"></i> Copy All IPA`;
      btn.classList.remove('copied');
      lucide.createIcons();
    }, 1500);
  });
}


// ── History (localStorage only — no cookies) ────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(text) {
  let hist = getHistory().filter(h => h !== text);
  hist.unshift(text);
  hist = hist.slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  renderHistory();
}

function renderHistory() {
  const hist = getHistory();
  const listEl = document.getElementById('history-list');
  if (!hist.length) {
    listEl.innerHTML = `<div class="history-empty">Nothing converted yet.</div>`;
    return;
  }
  listEl.innerHTML = hist.map(h => `
    <span class="history-chip" onclick="loadHistoryItem(this)" data-text="${escapeHtml(h)}">
      <span class="chip-text">${escapeHtml(h)}</span>
      <button onclick="event.stopPropagation(); removeHistoryItem(this)" aria-label="Remove">✕</button>
    </span>
  `).join('');
}

function loadHistoryItem(el) {
  document.getElementById('phon-input').value = el.dataset.text;
  convertText();
}

function removeHistoryItem(btn) {
  const chip = btn.closest('.history-chip');
  const text = chip.dataset.text;
  const hist = getHistory().filter(h => h !== text);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  renderHistory();
}

function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

// ── Init ─────────────────────────────────────────────────
document.getElementById('phon-input').addEventListener('input', () => {
  if (document.getElementById('live-toggle').checked) {
    clearTimeout(window.__liveTimer);
    window.__liveTimer = setTimeout(convertText, 250);
  }
});

async function init() {
  await Promise.all([loadPhonology(), loadDictionary()]);
  renderHistory();
  convertText();
}

init();
