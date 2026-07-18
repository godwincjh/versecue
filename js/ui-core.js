'use strict';

/* ================================================================
   Versecue — shared UI primitives ($, views, toast, animated reveal, search bars, language filters)
   ================================================================ */

/* ---------------- language filter helpers ---------------- */


function passesLangFilter(category, state) {
  return !!state[category];
}

function wireLangFilter(containerId, state, onChange) {
  const buttons = $(containerId).querySelectorAll('.lang-filter-btn');
  buttons.forEach(btn => {
    btn.onclick = () => {
      const lang = btn.dataset.lang;
      // Clicking a category while all four are selected "solos" it (only that
      // one stays selected) instead of just deselecting it — otherwise a
      // single click from the all-selected state would leave three still on.
      const allSelected = Object.keys(state).every(k => state[k]);
      if (allSelected) {
        buttons.forEach(b => {
          const l = b.dataset.lang;
          state[l] = l === lang;
          b.classList.toggle('active', state[l]);
        });
      } else {
        state[lang] = !state[lang];
        btn.classList.toggle('active', state[lang]);
      }
      onChange();
    };
  });
}


/* ---------------- toast ---------------- */

let toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  clearTimeout(toastTimer);
  el.classList.remove('show');
  el.textContent = msg;
  el.classList.remove('hidden');
  void el.offsetWidth; // force a reflow so the opacity transition actually runs, instead of relying on requestAnimationFrame (unreliable when the tab isn't actively rendering)
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, 2000);
}

/* ---------------- animated reveal (dropdowns, modals) ---------------- */

/*
 * Same forced-reflow trick as the toast: adding the "open" class in the
 * same tick as removing "hidden" would skip the transition (the element
 * only just became visible, so the browser hasn't painted a starting
 * frame to transition from yet). Forcing a reflow in between fixes that.
 */
function revealAnimated(el) {
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('open');
}
function hideAnimated(el, duration = 180) {
  el.classList.remove('open');
  setTimeout(() => el.classList.add('hidden'), duration);
}

/* ---------------- search ---------------- */

const JAPANESE_RE = /[぀-ヿ㐀-鿿々〆ヶ]/;
function hasJapaneseChar(s) { return JAPANESE_RE.test(s); }

function normalizeSearch(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function shouldSuggest(query) {
  const t = query.trim();
  if (!t) return false;
  return hasJapaneseChar(t) ? t.length >= 1 : t.length >= 3;
}

/*
 * Shared dropdown-suggestions + search-button wiring for the three search
 * bars (My List, Public Lists, Other Lists). Each caller supplies how to
 * fetch/filter suggestions and what happens on pick vs. full search.
 */
function attachSearchBar({ inputId, suggestionsId, btnId, clearBtnId, getSuggestions, onSuggestionClick, onSearch }) {
  const input = $(inputId);
  const wrap = $(suggestionsId);
  let debounceTimer = null;

  function closeDropdown() { hideAnimated(wrap); }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    if (!shouldSuggest(q)) { closeDropdown(); return; }
    debounceTimer = setTimeout(async () => {
      const items = await getSuggestions(q);
      renderSuggestionDropdown(wrap, items, item => { closeDropdown(); onSuggestionClick(item); });
    }, 200);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { closeDropdown(); onSearch(input.value); }
  });
  input.addEventListener('focus', () => { if (shouldSuggest(input.value)) input.dispatchEvent(new Event('input')); });
  $(btnId).onclick = () => { closeDropdown(); onSearch(input.value); };
  if (clearBtnId) {
    $(clearBtnId).onclick = () => {
      input.value = '';
      closeDropdown();
      onSearch('');
      input.focus();
    };
  }
  document.addEventListener('click', e => {
    if (e.target !== input && !wrap.contains(e.target)) closeDropdown();
  });
}

function renderSuggestionDropdown(wrap, items, onClick) {
  wrap.innerHTML = '';
  if (!items.length) { hideAnimated(wrap); return; }
  revealAnimated(wrap);
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'suggestion-item';
    if (item.icon) {
      const iconWrap = document.createElement('span');
      iconWrap.className = 'suggestion-icon';
      iconWrap.innerHTML = item.icon;
      row.appendChild(iconWrap);
    }
    const textWrap = document.createElement('div');
    textWrap.className = 'suggestion-text';
    const title = document.createElement('div');
    title.className = 'suggestion-title';
    title.lang = 'ja';
    title.textContent = item.title;
    textWrap.appendChild(title);
    if (item.sub) {
      const sub = document.createElement('div');
      sub.className = 'suggestion-sub';
      sub.textContent = item.sub;
      textWrap.appendChild(sub);
    }
    row.appendChild(textWrap);
    row.onclick = () => onClick(item);
    wrap.appendChild(row);
  }
}

/* ---------------- views ---------------- */

const $ = id => document.getElementById(id);

const views = {
  library: $('view-library'),
  public: $('view-public'),
  editor: $('view-editor'),
  perform: $('view-perform'),
  otherView: $('view-other-view'),
  otherAdd: $('view-other-add'),
  sharedLibrary: $('view-shared-library'),
};

function showView(name) {
  for (const [k, el] of Object.entries(views)) {
    el.classList.toggle('view-active', k === name);
  }
  if (name === 'perform') requestWakeLock();
  else releaseWakeLock();
}

