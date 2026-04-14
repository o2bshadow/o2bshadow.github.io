const TENSE_MORPHEMES = {
  pres:  v => v,
  fut:   'ta',
  past:  v => 'k' + v,
  imp:   'rat',
  fimp:  'er',
  dpast: v => 'ch' + v,
};

const VERB_ENDINGS = {
  '1s': 'm',  '2s': 'i',  '3s': 'r',
  '1p': 'n',  '2p': 'e',  '3p': 'er',
  'Ds': "'vra", 'Dp': "'vran",
  'Fs': "'ich", 'Fp': "'ech",
};

const NOUN_ENDINGS = {
  'pl': '\'an',  'poss': '\'il',
};

const NOUN_PREFIXES = {
  'nom': '', 'acc': 'odh\'', 'dat': 'av\'',
  'gen': 'il\'', 'voc': 'os\'',
}

const TENSE_LABELS = {
  pres: 'Present', past: 'Past', fut: 'Future',
  imp: 'Imperative', fimp: 'Fut. Imper.', dpast: 'Distant Past',
};

const IMP_ONLY = new Set(['2s', '2p']);

let searchMode = 'both';

function jumpToRoot(root) {
  document.getElementById('search').value = '';
  document.getElementById('clear-btn').style.display = 'none';
  document.getElementById('pos-filter').value = '';
  searchMode = 'word';
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === 'word');
  });
  render();
  requestAnimationFrame(() => {
    const entries = document.querySelectorAll('.entry');
    for (const el of entries) {
      const wordEl = el.querySelector('.entry-word');
      if (wordEl && wordEl.textContent.trim() === root) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'border-color 0.3s';
        el.style.borderColor = 'var(--blue-mid)';
        setTimeout(() => { el.style.borderColor = ''; }, 1200);
        break;
      }
    }
  });
}

function clearSearch() {
  document.getElementById('search').value = '';
  document.getElementById('clear-btn').style.display = 'none';
  render();
}

function setMode(btn) {
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  searchMode = btn.dataset.mode;
  render();
}

function nounDecl(root) {
  const map = {};
  for (const cl in NOUN_PREFIXES) {
    map[cl] = NOUN_PREFIXES[cl] + root
  };
  for (const cl in NOUN_ENDINGS) {
    map[cl] = root + NOUN_ENDINGS[cl]
  };
  return map
}

function conjugate(root) {
  const stem = root.slice(0, -1);
  const vowel = root.slice(-1);
  const map = {};
  for (const tense in TENSE_MORPHEMES) {
    const morpheme = TENSE_MORPHEMES[tense];
    const t = typeof morpheme === 'function' ? morpheme(vowel) : morpheme;
    map[tense] = {};
    for (const person in VERB_ENDINGS) {
      const isImp = tense === 'imp' || tense === 'fimp';
      if (isImp && !IMP_ONLY.has(person)) {
        map[tense][person] = '--';
      } else {
        map[tense][person] = stem + t + VERB_ENDINGS[person];
      }
    }
  }
  return map;
}

function buildConjTable(root) {
  const conj = conjugate(root);
  const tenses = Object.keys(TENSE_MORPHEMES);
  const persons = Object.keys(VERB_ENDINGS);

  let html = '<table class="conj-table"><thead><tr><th></th>';
  tenses.forEach(t => { html += `<th>${TENSE_LABELS[t]}</th>`; });
  html += '</tr></thead><tbody>';

  persons.forEach(p => {
    html += `<tr><td>${p}</td>`;
    tenses.forEach(t => {
      const cell = conj[t][p];
      html += cell === '--'
        ? `<td class="dash">—</td>`
        : `<td>${cell}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

function buildNounDeclTable(root) {
  const decl = nounDecl(root);
  const cases   = Object.keys(NOUN_PREFIXES);
  const endings = Object.keys(NOUN_ENDINGS);

  let html = '<table class="conj-table"><thead><tr><th></th><th>form</th></tr></thead><tbody>';

  cases.forEach(cl => {
    const cell = decl[cl];
    html += `<tr><td>${cl}</td>${cell === '--' ? '<td class="dash">—</td>' : `<td>${cell}</td>`}</tr>`;
  });

  endings.forEach(cl => {
    const cell = decl[cl];
    html += `<tr><td>${cl}</td>${cell === '--' ? '<td class="dash">—</td>' : `<td>${cell}</td>`}</tr>`;
  });

  html += '</tbody></table>';
  return html;
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

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
  return escaped.replace(re, '<mark class="highlight">$1</mark>');
}

function renderEntry(word, data, query) {
  const isVerb = data.pos && data.pos.toLowerCase() === 'verb';
  const isNoun = data.pos && data.pos.toLowerCase() === 'noun';
  const defs = (Array.isArray(data.def) ? data.def : [data.def]).filter(d => d && d.trim());

  const defsHtml = defs.map(d =>
    `<li>${highlightMatch(d, query)}</li>`
  ).join('');

  const conjHtml = isVerb ? `
    <button class="conj-toggle" data-word="${escapeHtml(word)}" onclick="toggleConj(this)">
      <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
        <path d="M1 1l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      conjugations
    </button>
    <div class="conj-table-wrap"></div>
  ` : '';

    const declHtml = isNoun ? `
    <button class="conj-toggle" data-word="${escapeHtml(word)}" onclick="toggleDecl(this)">
      <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
        <path d="M1 1l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      declensions
    </button>
    <div class="conj-table-wrap"></div>
  ` : '';

  return `
    <div class="entry">
        <div class="entry-header">
            <span class="entry-word">${highlightMatch(word, query)}</span>
            ${data.ipa ? `<span class="entry-ipa">${escapeHtml(Array.isArray(data.ipa) ? data.ipa[0] : data.ipa)}</span>` : ''}
            ${data.pos ? `<span class="pos-badge ${posClass(data.pos)}">${escapeHtml(data.pos)}</span>` : ''}
        </div>
        <ol class="entry-defs">${defsHtml}</ol>
        ${Array.isArray(data.root) && data.root.length > 0 ? `
        <div class="entry-roots">
            <span class="roots-label">roots:</span>
            ${data.root.map(r => `<button class="root-link" data-root="${escapeHtml(r)}" onclick="jumpToRoot(this.dataset.root)">${escapeHtml(r)}</button>`).join('')}
        </div>` : ''}
        ${conjHtml}
        ${declHtml}
    <button class="copy-btn" data-word="${escapeHtml(word)}" onclick="copyWord(this)">⎘ copy</button>
    </div>
  `;
}


function toggleConj(btn) {
  const word = btn.dataset.word;
  const wrap = btn.nextElementSibling;
  const isOpen = wrap.classList.contains('visible');
  if (isOpen) {
    wrap.classList.remove('visible');
    btn.classList.remove('open');
  } else {
    if (!wrap.dataset.built) {
      wrap.innerHTML = buildConjTable(word);
      wrap.dataset.built = '1';
    }
    wrap.classList.add('visible');
    btn.classList.add('open');
  }
}

function toggleDecl(btn) {
  const word = btn.dataset.word;
  const wrap = btn.nextElementSibling;
  const isOpen = wrap.classList.contains('visible');
  if (isOpen) {
    wrap.classList.remove('visible');
    btn.classList.remove('open');
  } else {
    if (!wrap.dataset.built) {
      wrap.innerHTML = buildNounDeclTable(word);
      wrap.dataset.built = '1';
    }
    wrap.classList.add('visible');
    btn.classList.add('open');
  }
}

let DICT = {};

function render() {
  const query = document.getElementById('search').value.trim().toLowerCase();
  const posFilter = document.getElementById('pos-filter').value.toLowerCase();
  const container = document.getElementById('dictionary');
  const countEl = document.getElementById('results-count');

  const entries = Object.entries(DICT).filter(([word, data]) => {
    const matchPos = !posFilter || (data.pos && data.pos.toLowerCase() === posFilter);
    if (!matchPos) return false;
    if (!query) return true;
    const inWord = word.toLowerCase().includes(query);
    const inDef = (Array.isArray(data.def) ? data.def : [data.def])
        .some(d => d && d.toLowerCase().includes(query));
    if (searchMode === 'word') return inWord;
    if (searchMode === 'def') return inDef;
    return inWord || inDef;
  });

  entries.sort((a, b) => a[0].localeCompare(b[0]));

  countEl.textContent = entries.length
    ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} found`
    : '';

  if (entries.length === 0) {
    container.innerHTML = `<div class="no-results">No entries found for "<em>${escapeHtml(query)}</em>"</div>`;
    return;
  }

  let html = '';
  let currentLetter = '';
  entries.forEach(([w, d]) => {
    const letter = w[0].toUpperCase();
    if (letter !== currentLetter) {
      currentLetter = letter;
      html += `<div class="letter-divider">${letter}</div>`;
    }
    html += renderEntry(w, d, query);
  });
  container.innerHTML = html;
}

async function loadDictionary() {
  try {
    const res = await fetch('dictionary.json');
    if (!res.ok) throw new Error('fetch failed');
    DICT = await res.json();
  } catch (e) {
    DICT = SAMPLE_DICT;
    console.warn('Could not load dictionary.json — using sample data');
  }
  const parts = [...new Set(Object.values(DICT).map(d => d.pos).filter(Boolean))].sort();
  const select = document.getElementById('pos-filter');
  parts.forEach(pos => {
    const opt = document.createElement('option');
    opt.value = pos.toLowerCase();
    opt.textContent = pos.charAt(0).toUpperCase() + pos.slice(1);
    select.appendChild(opt);
  });
  render();
}

document.getElementById('search').addEventListener('input', () => {
  const val = document.getElementById('search').value;
  document.getElementById('clear-btn').style.display = val ? 'inline' : 'none';
  render();
});
document.getElementById('pos-filter').addEventListener('change', render);

function copyWord(btn) {
  const word = btn.dataset.word;
  navigator.clipboard.writeText(word).then(() => {
    btn.textContent = '✓ copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '⎘ copy';
      btn.classList.remove('copied');
    }, 1500);
  });
}

const SAMPLE_DICT = {
  "ava": {
    "pos": "verb",
    "ipa": "'ævɔː",
    "def": ["to move swiftly", "to flee from danger"]
  },
  "koru": {
    "pos": "noun",
    "ipa": "'kɔru",
    "def": ["a spiral shape", "the fern frond in its unfurled state", "a symbol of new beginnings"]
  },
  "senli": {
    "pos": "adj",
    "ipa": "'sɛnli",
    "def": ["bright, luminous", "of a clear and open disposition"]
  },
  "tova": {
    "pos": "verb",
    "ipa": "'tɔvæ",
    "def": ["to speak carefully", "to choose words with deliberate intent"]
  },
  "miran": {
    "pos": "noun",
    "ipa": "mi'ɾan",
    "def": ["the deep ocean", "the unknowable depth of something"]
  },
  "elu": {
    "pos": "adv",
    "ipa": "'ɛlu",
    "def": ["gently, softly", "with restraint"]
  }
};

loadDictionary();

const topBtn = document.getElementById('top-btn');
window.addEventListener('scroll', () => {
  const show = window.scrollY > 300;
  topBtn.style.opacity = show ? '1' : '0';
  topBtn.style.pointerEvents = show ? 'auto' : 'none';
});