const POS_OPTIONS = ['noun','verb','adjective','adverb','pronoun','preposition','conjunction','particle','idiom','<TYPE NOT FOUND>'];

let GH = { owner:'', repo:'', path:'', pat:'', branch:'main' };
let DICT = {};
let MODIFIED = {};
let CURRENT_WORD = null;
let fileSha = '';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8001/repos'
  : 'https://api.github.com/repos';

// ── AUTH ──────────────────────────────────────────────
async function authenticate() {
  const owner = document.getElementById('gh-owner').value.trim();
  const repo  = document.getElementById('gh-repo').value.trim();
  const path  = document.getElementById('gh-path').value.trim() || 'dictionary.json';
  const pat   = document.getElementById('gh-pat').value.trim();
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';

  if (!owner || !repo || !pat) {
    errEl.textContent = 'All fields are required.';
    return;
  }

  errEl.textContent = 'Connecting…';

  try {
    const res = await fetch(`${API_BASE}/${owner}/${repo}/contents/${path}`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    fileSha = data.sha;
    const content = new TextDecoder('utf-8').decode(
        Uint8Array.from(atob(data.content.replace(/\n/g,'')), c => c.charCodeAt(0))
    );
    DICT = JSON.parse(content);
    GH = { owner, repo, path, pat, branch: document.getElementById('gh-branch').value.trim() || 'main' };
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('repo-meta').textContent = `${owner}/${repo} · ${path}`;
    setStatus(`Loaded ${Object.keys(DICT).length} entries`, 'ok');
    renderWordList();
  } catch(e) {
    errEl.textContent = `Error: ${e.message}`;
  }
}

function ghGet(endpoint) {
  const pat = document.getElementById('gh-pat')?.value.trim() || GH.pat;
  return fetch(`${API_BASE}/${GH.owner}/${GH.repo}/${endpoint}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json' }
  });
}

function ghRequest(method, endpoint, body) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${GH.pat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    }
  };
  if (body !== null && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }
  return fetch(`${API_BASE}/${GH.owner}/${GH.repo}/${endpoint}`, opts);
}

// ── STATUS ────────────────────────────────────────────
function setStatus(msg, type='info') {
  const bar = document.getElementById('status-bar');
  bar.innerHTML = `<span class="status-${type}">${msg}</span>`;
}

function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  setTimeout(() => { el.className = ''; }, 3000);
}

// ── WORD LIST ─────────────────────────────────────────
function renderWordList(filter='') {
  const list = document.getElementById('word-list');
  const words = Object.keys(DICT).sort();
  const lower = filter.toLowerCase();
  list.innerHTML = '';
  words.forEach(w => {
    if (lower && !w.toLowerCase().includes(lower)) return;
    const item = document.createElement('div');
    item.className = 'word-item' +
      (MODIFIED[w] ? ' modified' : '') +
      (w === CURRENT_WORD ? ' active' : '');
    item.innerHTML = `
      <span class="word-item-text">${w}</span>
      <span class="word-item-pos">${DICT[w].pos || ''}</span>`;
    item.onclick = () => selectWord(w);
    list.appendChild(item);
  });
  updateModifiedCount();
}

function filterWordList(val) { renderWordList(val); }

function updateModifiedCount() {
  const el = document.getElementById('modified-count');
  const n = Object.keys(MODIFIED).length;
  if (n === 0) { el.style.display = 'none'; return; }
  el.style.display = 'inline';
  el.textContent = `${n} unsaved change${n>1?'s':''}`;
}

// ── EDITOR ────────────────────────────────────────────
function selectWord(word) {
  CURRENT_WORD = word;
  renderWordList(document.getElementById('sidebar-search').value);
  renderEditor(word, DICT[word]);
}

function renderEditor(word, data) {
  const panel = document.getElementById('editor-panel');
  const isNew = !Object.prototype.hasOwnProperty.call(DICT, word) || (MODIFIED[word] && MODIFIED[word]._isNew);

  panel.innerHTML = `
    <div class="editor-word-title">
      ${word}
      ${isNew ? '<span style="font-size:0.7rem;color:var(--green);font-family:JetBrains Mono,monospace;">NEW</span>' : ''}
    </div>

    <div class="editor-grid">
      <div class="field-group">
        <label>Word (headword)</label>
        <input type="text" id="ed-word" value="${escHtml(word)}" ${isNew ? '' : 'readonly style="opacity:0.5;cursor:not-allowed"'}>
      </div>
      <div class="field-group">
        <label>Part of Speech</label>
        <select id="ed-pos">
          ${POS_OPTIONS.map(p => `<option value="${p}" ${data.pos===p?'selected':''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="editor-grid full">
      <div class="field-group">
        <label>IPA (one transcription per line)</label>
        <textarea id="ed-ipa" rows="2">${(Array.isArray(data.ipa)?data.ipa:data.ipa?[data.ipa]:[]).join('\n')}</textarea>
      </div>
    </div>

    <div class="field-group" style="margin-bottom:1rem">
      <label>Definitions (one per line)</label>
      <textarea id="ed-def" rows="4">${(Array.isArray(data.def)?data.def:data.def?[data.def]:[]).join('\n')}</textarea>
    </div>

    <div class="editor-grid">
      <div class="field-group">
        <label>Roots</label>
        <div class="roots-input-row" id="roots-row">
          ${(Array.isArray(data.root)?data.root:(data.root?[data.root]:[])).map(r=>rootTag(r)).join('')}
          <input type="text" id="root-input" placeholder="add root…" onkeydown="rootKeydown(event)">
        </div>
      </div>
      <div class="field-group">
        <label>Notes</label>
        <textarea id="ed-notes" rows="3">${escHtml(data.notes||'')}</textarea>
      </div>
    </div>

    <div class="editor-grid">
      <div class="field-group">
        <label>Antonyms</label>
        <div class="array-field" id="arr-antonyms">
          ${renderArrayRows(data.antonyms||[], 'antonyms')}
          <button class="array-add" onclick="addArrayRow('antonyms')">+ add antonym</button>
        </div>
      </div>
      <div class="field-group">
        <label>Synonyms</label>
        <div class="array-field" id="arr-synonyms">
          ${renderArrayRows(data.synonyms||[], 'synonyms')}
          <button class="array-add" onclick="addArrayRow('synonyms')">+ add synonym</button>
        </div>
      </div>
    </div>

    <div class="field-group" style="margin-bottom:1rem">
      <label>Related words</label>
      <div class="array-field" id="arr-related">
        ${renderArrayRows(data.related||[], 'related')}
        <button class="array-add" onclick="addArrayRow('related')">+ add related</button>
      </div>
    </div>

    <div class="editor-actions">
      <button class="btn btn-primary" style="width:auto;" onclick="saveEntry()">Save changes</button>
      <button class="btn btn-danger" onclick="deleteEntry('${escHtml(word)}')">Delete entry</button>
    </div>
  `;
}

function rootTag(r) {
  return `<span class="root-tag" data-root="${escHtml(r)}">${escHtml(r)}<button onclick="removeRoot(this)" title="remove">✕</button></span>`;
}

function removeRoot(btn) {
  btn.closest('.root-tag').remove();
}

function rootKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim();
    if (!val) return;
    const row = document.getElementById('roots-row');
    const input = document.getElementById('root-input');
    row.insertBefore(createEl(rootTag(val)), input);
    input.value = '';
  }
}

function createEl(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild;
}

function renderArrayRows(arr, fieldId) {
  return (Array.isArray(arr)?arr:[]).map((v,i) => `
    <div class="array-row">
      <input type="text" value="${escHtml(v)}" data-field="${fieldId}" data-idx="${i}">
      <button class="array-remove" onclick="this.closest('.array-row').remove()" title="remove">✕</button>
    </div>`).join('');
}

function addArrayRow(fieldId) {
  const container = document.getElementById(`arr-${fieldId}`);
  const addBtn = container.querySelector('.array-add');
  const row = document.createElement('div');
  row.className = 'array-row';
  row.innerHTML = `
    <input type="text" data-field="${fieldId}" placeholder="…">
    <button class="array-remove" onclick="this.closest('.array-row').remove()" title="remove">✕</button>`;
  container.insertBefore(row, addBtn);
  row.querySelector('input').focus();
}

function getArrayValues(fieldId) {
  return [...document.querySelectorAll(`#arr-${fieldId} input`)]
    .map(i => i.value.trim()).filter(Boolean);
}

function getRoots() {
  return [...document.querySelectorAll('#roots-row .root-tag')]
    .map(el => el.dataset.root).filter(Boolean);
}

function saveEntry() {
  const word = CURRENT_WORD;
  const pos  = document.getElementById('ed-pos').value;
  const ipa  = document.getElementById('ed-ipa').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const def  = document.getElementById('ed-def').value.split('\n').map(s=>s.trim()).filter(Boolean);
  const notes = document.getElementById('ed-notes').value.trim();
  const root  = getRoots();
  const antonyms = getArrayValues('antonyms');
  const synonyms = getArrayValues('synonyms');
  const related  = getArrayValues('related');

  const entry = { pos, ipa, def, root, antonyms, synonyms, related, notes };
  DICT[word] = entry;
  MODIFIED[word] = entry;

  renderWordList(document.getElementById('sidebar-search').value);
  setStatus(`Saved "${word}" locally — push to publish`, 'warn');
  toast(`"${word}" saved locally`, 'success');
}

function openNewWordEditor() {
  const word = prompt('Enter the new word:');
  if (!word || !word.trim()) return;
  const w = word.trim();
  if (DICT[w]) { toast(`"${w}" already exists`, 'error'); selectWord(w); return; }
  DICT[w] = { pos:'noun', ipa:[], def:[], root:[], antonyms:[], synonyms:[], related:[], notes:'' };
  MODIFIED[w] = { ...DICT[w], _isNew: true };
  CURRENT_WORD = w;
  renderWordList(document.getElementById('sidebar-search').value);
  renderEditor(w, DICT[w]);
}

function deleteEntry(word) {
  if (!confirm(`Delete "${word}"? This will be included in your next push.`)) return;
  delete DICT[word];
  MODIFIED[`__DELETED__${word}`] = null;
  if (CURRENT_WORD === word) {
    CURRENT_WORD = null;
    document.getElementById('editor-panel').innerHTML = '<div class="editor-empty">Entry deleted — select another word</div>';
  }
  renderWordList(document.getElementById('sidebar-search').value);
  toast(`"${word}" marked for deletion`, 'error');
}

// ── PUSH ──────────────────────────────────────────────
function branchName() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  return `dict-editor_${yy}${mm}${dd}`;
}

function openPushModal() {
  const n = Object.keys(MODIFIED).length;
  if (n === 0) { toast('No changes to push', ''); return; }
  document.getElementById('branch-name-display').textContent = branchName();
  document.getElementById('commit-message').value = 'Dictionary edits via browser editor';
  document.getElementById('push-error').textContent = '';

  const added   = Object.keys(MODIFIED).filter(k => !k.startsWith('__DELETED__') && MODIFIED[k]?._isNew).length;
  const edited  = Object.keys(MODIFIED).filter(k => !k.startsWith('__DELETED__') && !MODIFIED[k]?._isNew).length;
  const deleted = Object.keys(MODIFIED).filter(k => k.startsWith('__DELETED__')).length;

  let summary = '';
  if (added)   summary += `<span>${added}</span> new entr${added===1?'y':'ies'}<br>`;
  if (edited)  summary += `<span>${edited}</span> edited entr${edited===1?'y':'ies'}<br>`;
  if (deleted) summary += `<span>${deleted}</span> deleted entr${deleted===1?'y':'ies'}`;
  document.getElementById('changes-summary').innerHTML = summary;

  document.getElementById('push-modal').classList.add('open');
}

function closePushModal() {
  document.getElementById('push-modal').classList.remove('open');
}

async function confirmPush() {
  const branch  = branchName();
  const message = document.getElementById('commit-message').value.trim() || 'Dictionary edits via browser editor';
  const errEl   = document.getElementById('push-error');
  errEl.textContent = 'Working…';

  try {
    // 1 + 2. Get default branch SHA
    const defaultBranch = GH.branch;
    const refRes = await ghRequest('GET', `git/refs/heads/${defaultBranch}`, null);
    const refData = await refRes.json();
    const baseSha = refData.object.sha;

    // 3. Create branch
    const createBranch = await ghRequest('POST', 'git/refs', {
      ref: `refs/heads/${branch}`,
      sha: baseSha
    });
    if (!createBranch.ok) {
      const err = await createBranch.json();
      if (!err.message?.includes('already exists')) throw new Error(err.message);
    }

    // 4. Encode and push
    const sorted = Object.fromEntries(Object.entries(DICT).sort());
    const bytes = new TextEncoder().encode(JSON.stringify(sorted, null, 2));
    const content = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));

    const pushRes = await ghRequest('PUT', `contents/${GH.path}`, {
      message,
      content,
      sha: fileSha,
      branch
    });

    if (!pushRes.ok) {
      const err = await pushRes.json();
      throw new Error(err.message);
    }

    const pushData = await pushRes.json();
    fileSha = pushData.content.sha;
    MODIFIED = {};
    updateModifiedCount();
    closePushModal();
    setStatus(`Pushed to branch "${branch}" — open a PR on GitHub to merge`, 'ok');
    toast(`Branch "${branch}" pushed!`, 'success');

  } catch(e) {
    errEl.textContent = `Error: ${e.message}`;
  }
}

// ── UTILS ─────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}