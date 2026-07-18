'use strict';

/* ================================================================
   Versecue — sharing (share app, Public List, generate code, Other Lists, cross-list search)
   ================================================================ */

/* ---------------- share the app itself ---------------- */

/*
 * A single native share sheet covers every platform properly (Instagram,
 * Facebook, X, WhatsApp, Messages, whatever's installed) via the OS's own
 * hand-off, instead of faking each platform's web intent individually.
 * Only shown on devices that actually support it - see the feature-detect
 * below, which is a more reliable "is this a phone/tablet" signal than
 * guessing from screen width, and guarantees the button always works
 * when visible.
 */
async function shareApp() {
  try { await navigator.share({ title: 'Versecue', text: APP_SHARE_TEXT, url: APP_SHARE_URL }); }
  catch { /* user cancelled the native share sheet */ }
}

if (navigator.share) {
  document.querySelectorAll('.app-share-btn').forEach(btn => {
    btn.classList.remove('hidden');
    btn.onclick = shareApp;
  });
}

/* ---------------- public lists (anyone's published songs) ---------------- */

let publicIndexCache = null;

async function fetchPublicIndex(force) {
  if (publicIndexCache && !force) return publicIndexCache;
  try {
    const res = await fetch(`${API_ORIGIN}/api/publish-index`, { cache: 'no-store' });
    publicIndexCache = res.ok ? await res.json() : [];
  } catch { publicIndexCache = publicIndexCache || []; }
  return publicIndexCache;
}

function filterPublicIndex(index, query) {
  if (!query.trim()) return [];
  return index.filter(e => matchesQuery(query, e));
}

async function fetchPublicSong(id) {
  try {
    const res = await fetch(`${API_ORIGIN}/api/publish/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function openPublicSong(id) {
  const data = await fetchPublicSong(id);
  if (!data) { showToast('This song is no longer available.'); return; }
  fetch(`${API_ORIGIN}/api/publish/${encodeURIComponent(id)}/view`, { method: 'POST' }).catch(() => {});
  data.id = id; // the fetched record doesn't carry its own public-list id — attach it so Add to List (in the perform view) can reference it
  performReadOnly = true;
  performBackTo = 'public';
  openPerform(data);
}

let publicSortField = 'date'; // 'date' | 'views'
let publicSortDir = 'desc';   // 'asc' | 'desc'
const publicLangFilter = { japanese: true, korean: true, chinese: true, english: true };

function sortPublicEntries(entries) {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    const cmp = publicSortField === 'views' ? (a.views || 0) - (b.views || 0) : (a.publishedAt || 0) - (b.publishedAt || 0);
    return publicSortDir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

async function refreshPublicView(force) {
  const idx = await fetchPublicIndex(force);
  const query = $('public-search-input').value.trim();
  const base = query ? filterPublicIndex(idx, query) : idx;
  const filtered = base.filter(e => passesLangFilter(songCategory(e), publicLangFilter));
  renderPublicResults(sortPublicEntries(filtered), idx.length === 0);
}

function renderPublicResults(matches, indexEmpty) {
  const wrap = $('public-results');
  wrap.innerHTML = '';
  if (!matches.length) {
    const d = document.createElement('div');
    d.className = 'empty-library';
    d.textContent = indexEmpty
      ? 'No songs published yet. Publish one from My List to get it listed here! ♪'
      : 'No matches. Try a different search.';
    wrap.appendChild(d);
    return;
  }
  for (const e of matches.slice(0, 50)) {
    const card = document.createElement('div');
    card.className = 'song-card';
    const main = document.createElement('div');
    main.className = 'song-card-main';
    const t = document.createElement('div');
    t.className = 'song-card-title';
    t.lang = langAttrFor(songCategory(e));
    t.textContent = e.title;
    const sub = document.createElement('div');
    sub.className = 'song-card-sub';
    const plays = (e.views || 0) === 1 ? '1 play' : `${e.views || 0} plays`;
    sub.textContent = (e.artist ? e.artist + ' · ' : '') + plays;
    // Public List cards only ever reflect originalYoutubeId — never a viewer's
    // personal override, since that override isn't published anywhere.
    main.append(t, sub, buildSongCardTags(songCategory(e), !!e.originalYoutubeId));
    main.onclick = () => openPublicSong(e.id);

    const ownPublish = songs.some(s => s.publishId === e.id);
    const alreadyAdded = songs.some(s => s.importedFrom === e.id);
    const cantAdd = ownPublish || alreadyAdded;
    const bAdd = document.createElement('button');
    bAdd.className = 'song-card-btn';
    bAdd.textContent = '➕';
    bAdd.disabled = cantAdd;
    bAdd.title = ownPublish ? 'This is already in My List — you published it'
      : alreadyAdded ? 'Already in My List'
      : 'Add to List';
    bAdd.onclick = ev => {
      ev.stopPropagation();
      if (cantAdd) return;
      confirmAddToList(async () => {
        const data = await fetchPublicSong(e.id);
        if (data) { addSongToMyList(data, e.id); refreshPublicView(); }
        else showToast('Could not add — try again.');
      });
    };

    card.append(main, bAdd);
    wrap.appendChild(card);
  }
}

function attachPublicSearch() {
  attachSearchBar({
    inputId: 'public-search-input', suggestionsId: 'public-search-suggestions', btnId: 'public-search-btn', clearBtnId: 'public-search-clear',
    getSuggestions: async q => {
      const idx = await fetchPublicIndex();
      return filterPublicIndex(idx, q).slice(0, 10).map(e => ({ title: e.title, sub: e.artist, id: e.id }));
    },
    onSuggestionClick: item => openPublicSong(item.id),
    onSearch: () => refreshPublicView(),
  });
  $('public-sort-field').onchange = () => { publicSortField = $('public-sort-field').value; refreshPublicView(); };
  $('public-sort-dir').onclick = () => {
    publicSortDir = publicSortDir === 'asc' ? 'desc' : 'asc';
    $('public-sort-dir').textContent = publicSortDir === 'asc' ? '↑' : '↓';
    refreshPublicView();
  };
  $('public-refresh-btn').onclick = async () => {
    const btn = $('public-refresh-btn');
    btn.classList.add('spinning');
    await refreshPublicView(true);
    btn.classList.remove('spinning');
    showToast('List refreshed');
  };
}

/* ---------------- generate sharing code ---------------- */

function openGenCodeModal() {
  $('gen-code-setup').classList.remove('hidden');
  $('gen-code-result').classList.add('hidden');
  $('gen-code-status').classList.add('hidden');
  $('gen-list-name').value = '';
  $('gen-user-name').value = '';
  revealAnimated($('gen-code-modal-backdrop'));
}

function closeGenCodeModal() {
  hideAnimated($('gen-code-modal-backdrop'));
}

async function submitGenCode() {
  const listName = $('gen-list-name').value.trim();
  const userName = $('gen-user-name').value.trim();
  const status = $('gen-code-status');
  status.classList.remove('hidden');
  if (!listName) { status.textContent = 'Give your list a name.'; return; }
  if (!userName) { status.textContent = 'Enter your name.'; return; }
  if (!songs.length) { status.textContent = 'Add at least one song first.'; return; }

  status.textContent = 'Generating…';
  try {
    const res = await fetch(`${API_ORIGIN}/api/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songs, listName, userName }),
    });
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    const shares = myShares();
    shares.push({ code: data.code, listName, userName, createdAt: Date.now() });
    saveMyShares(shares);
    showGenCodeResult(data.code, listName, userName);
  } catch {
    status.textContent = 'Could not reach the server — check your connection.';
  }
}

function showGenCodeResult(code, listName, userName) {
  $('gen-code-setup').classList.add('hidden');
  $('gen-code-result').classList.remove('hidden');
  $('gen-code-display').textContent = code;
  const link = `${location.origin}${location.pathname}?join=${code}`;
  const message = `Your friend has shared with you a code to access their list on Versecue! The code is: ${code}. You can enter the code manually in your Versecue app, or just tap this link: ${link}`;
  $('gen-code-message').value = message;
}

function copyGenCodeMessage() {
  const ta = $('gen-code-message');
  ta.select();
  navigator.clipboard?.writeText(ta.value).catch(() => {});
}

function copyGenCode() {
  const code = $('gen-code-display').textContent;
  navigator.clipboard?.writeText(code).catch(() => {});
}

/* ---------------- other lists (received from others) ---------------- */

function normalizeCode(raw) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function fetchSharedList(code) {
  try {
    const res = await fetch(`${API_ORIGIN}/api/list/${encodeURIComponent(code)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function addSharedListByCode(code, statusEl) {
  code = normalizeCode(code);
  if (code.length < 4) { if (statusEl) { statusEl.classList.remove('hidden'); statusEl.textContent = 'That code looks too short.'; } return false; }

  if (statusEl) { statusEl.classList.remove('hidden'); statusEl.textContent = 'Looking up code…'; }
  const data = await fetchSharedList(code);
  if (!data) { if (statusEl) statusEl.textContent = 'Code not found — check it and try again.'; return false; }

  const list = otherLists();
  if (!list.some(o => o.code === code)) {
    list.unshift({ code, listName: data.listName || '(untitled list)', userName: data.userName || 'Someone', addedAt: Date.now() });
    saveOtherLists(list);
  }
  return true;
}

function renderOtherListItems() {
  const wrap = $('other-list-items');
  wrap.innerHTML = '';
  const list = otherLists();
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty-library';
    d.textContent = 'No lists added yet.\nAsk a friend for their sharing code, then use Add List. ♪';
    wrap.appendChild(d);
    return;
  }
  for (const item of list) {
    const card = document.createElement('div');
    card.className = 'song-card';

    const main = document.createElement('div');
    main.className = 'song-card-main';
    const t = document.createElement('div');
    t.className = 'song-card-title';
    t.textContent = item.listName;
    const sub = document.createElement('div');
    sub.className = 'song-card-sub';
    sub.textContent = item.userName;
    main.append(t, sub);
    main.onclick = () => openSharedLibrary(item.code, item.listName, item.userName);

    const bDel = document.createElement('button');
    bDel.className = 'song-card-btn';
    bDel.textContent = '🗑';
    bDel.onclick = e => { e.stopPropagation(); confirmRemoveOther(item.code); };

    card.append(main, bDel);
    wrap.appendChild(card);
  }
}

function confirmRemoveOther(code) {
  removeOtherCode = code;
  revealAnimated($('remove-other-backdrop'));
}

function doRemoveOther() {
  if (!removeOtherCode) return;
  saveOtherLists(otherLists().filter(o => o.code !== removeOtherCode));
  removeOtherCode = null;
  otherSearchPool = null;
  hideAnimated($('remove-other-backdrop'));
  renderOtherListItems();
}

async function openSharedLibrary(code, listName, userName) {
  sharedLibCode = code;
  $('shared-lib-title').textContent = listName;
  $('shared-lib-sub').textContent = userName;
  $('shared-song-list').innerHTML = '<div class="empty-library">Loading…</div>';
  showView('sharedLibrary');

  const data = await fetchSharedList(code);
  if (!data) {
    $('shared-song-list').innerHTML = '';
    const d = document.createElement('div');
    d.className = 'empty-library';
    d.textContent = 'This list is no longer available.';
    $('shared-song-list').appendChild(d);
    sharedLibSongs = null;
    return;
  }
  $('shared-lib-title').textContent = data.listName || listName;
  $('shared-lib-sub').textContent = data.userName || userName;
  sharedLibSongs = data.songs || [];
  renderSharedSongList();
}

function renderSharedSongList() {
  const wrap = $('shared-song-list');
  wrap.innerHTML = '';
  const list = (sharedLibSongs || []).filter(s => passesLangFilter(songCategory(s), sharedLangFilter));
  if (!sharedLibSongs || !sharedLibSongs.length) {
    const d = document.createElement('div');
    d.className = 'empty-library';
    d.textContent = 'This list has no songs yet.';
    wrap.appendChild(d);
    return;
  }
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'empty-library';
    d.textContent = 'No songs match this filter.';
    wrap.appendChild(d);
    return;
  }
  for (const song of list) {
    const card = document.createElement('div');
    card.className = 'song-card';
    const main = document.createElement('div');
    main.className = 'song-card-main';
    const t = document.createElement('div');
    t.className = 'song-card-title';
    t.lang = langAttrFor(songCategory(song));
    t.textContent = song.title || '(untitled)';
    const sub = document.createElement('div');
    sub.className = 'song-card-sub';
    sub.textContent = song.artist || '';
    main.append(t, sub, buildSongCardTags(songCategory(song), !!song.youtubeId));
    main.onclick = () => {
      performReadOnly = true;
      performBackTo = 'sharedLibrary';
      openPerform(song);
    };

    const alreadyAdded = songs.some(s => s.importedFrom === song.id);
    const bAdd = document.createElement('button');
    bAdd.className = 'song-card-btn';
    bAdd.textContent = '➕';
    bAdd.disabled = alreadyAdded;
    bAdd.title = alreadyAdded ? 'Already in My List' : 'Add to List';
    bAdd.onclick = e => {
      e.stopPropagation();
      if (alreadyAdded) return;
      confirmAddToList(() => {
        addSongToMyList(song, song.id);
        renderSharedSongList();
      });
    };

    card.append(main, bAdd);
    wrap.appendChild(card);
  }
}

/* ---------------- other lists search (list names + songs across all added lists) ---------------- */

let otherSearchPool = null;

async function buildOtherSearchPool(force) {
  if (otherSearchPool && !force) return otherSearchPool;
  const lists = otherLists();
  const pool = lists.map(l => ({ type: 'list', code: l.code, listName: l.listName, userName: l.userName }));
  const fetched = await Promise.all(lists.map(l => fetchSharedList(l.code).catch(() => null)));
  fetched.forEach((data, i) => {
    if (!data) return;
    for (const song of (data.songs || [])) {
      pool.push({
        type: 'song', code: lists[i].code, listName: lists[i].listName, userName: lists[i].userName,
        title: song.title || '(untitled)', artist: song.artist || '', song,
      });
    }
  });
  otherSearchPool = pool;
  return pool;
}

function filterOtherPool(pool, query) {
  if (!query.trim()) return [];
  return pool.filter(e => e.type === 'list'
    ? matchesQuery(query, { title: e.listName })
    : matchesQuery(query, { title: e.title, artist: e.artist, category: e.song && e.song.category }));
}

const ICON_LIST_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
const ICON_SONG_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

function openOtherEntry(entry) {
  if (entry.type === 'list') {
    openSharedLibrary(entry.code, entry.listName, entry.userName);
  } else {
    performReadOnly = true;
    performBackTo = 'otherView';
    openPerform(entry.song);
  }
}

let lastOtherMatches = null;

function renderOtherResults(matches) {
  lastOtherMatches = matches;
  const wrap = $('other-list-items');
  if (matches === null) { renderOtherListItems(); return; }
  wrap.innerHTML = '';
  if (!matches.length) {
    const d = document.createElement('div');
    d.className = 'empty-library';
    d.textContent = 'No matches in your lists.';
    wrap.appendChild(d);
    return;
  }
  for (const e of matches.slice(0, 50)) {
    const card = document.createElement('div');
    card.className = 'song-card';
    const main = document.createElement('div');
    main.className = 'song-card-main';
    const t = document.createElement('div');
    t.className = 'song-card-title';
    const sub = document.createElement('div');
    sub.className = 'song-card-sub';

    if (e.type === 'list') {
      t.textContent = e.listName;
      sub.textContent = e.userName;
      main.append(t, sub);
      main.onclick = () => openOtherEntry(e);
      card.appendChild(main);
    } else {
      t.lang = langAttrFor(songCategory(e.song));
      t.textContent = e.title;
      sub.textContent = (e.artist ? e.artist + ' · ' : '') + e.listName;
      main.append(t, sub);
      main.onclick = () => openOtherEntry(e);

      const alreadyAdded = songs.some(s => s.importedFrom === e.song.id);
      const bAdd = document.createElement('button');
      bAdd.className = 'song-card-btn';
      bAdd.textContent = '➕';
      bAdd.disabled = alreadyAdded;
      bAdd.title = alreadyAdded ? 'Already in My List' : 'Add to List';
      bAdd.onclick = ev => {
        ev.stopPropagation();
        if (alreadyAdded) return;
        addSongToMyList(e.song, e.song.id);
        renderOtherResults(lastOtherMatches);
      };

      card.append(main, bAdd);
    }
    wrap.appendChild(card);
  }
}

function attachOtherSearch() {
  attachSearchBar({
    inputId: 'other-search-input', suggestionsId: 'other-search-suggestions', btnId: 'other-search-btn', clearBtnId: 'other-search-clear',
    getSuggestions: async q => {
      const pool = await buildOtherSearchPool();
      return filterOtherPool(pool, q).slice(0, 10).map(e => ({
        title: e.type === 'list' ? e.listName : e.title,
        sub: e.type === 'list' ? e.userName : e.artist,
        icon: e.type === 'list' ? ICON_LIST_SVG : ICON_SONG_SVG,
        entry: e,
      }));
    },
    onSuggestionClick: item => openOtherEntry(item.entry),
    onSearch: async q => {
      const pool = await buildOtherSearchPool();
      renderOtherResults(q.trim() ? filterOtherPool(pool, q) : null);
    },
  });
}

