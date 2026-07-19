'use strict';

/* ================================================================
   Versecue — song editor (category selector, lyrics entry, save)
   ================================================================ */

/* ---------------- editor ---------------- */

let editorCategory = null;

const BUILD_FRESH_BY_CATEGORY = {
  japanese: buildLineFresh,
  korean: buildKoreanLineFresh,
  chinese: buildChineseLineFresh,
  english: buildEnglishLineFresh,
};

const LYRICS_PLACEHOLDER_BY_CATEGORY = {
  japanese: 'Paste the full Japanese lyrics here…\n\n歌詞をここに貼り付けてください',
  korean: 'Paste the full Korean lyrics here…\n\n한국어 가사를 여기에 붙여넣으세요',
  chinese: 'Paste the full Chinese lyrics here…\n\n请将中文歌词粘贴在这里',
  english: 'Paste the full English lyrics here…',
};

function setEditorCategory(cat) {
  editorCategory = cat;
  $('lang-btn-japanese').classList.toggle('active', cat === 'japanese');
  $('lang-btn-korean').classList.toggle('active', cat === 'korean');
  $('lang-btn-chinese').classList.toggle('active', cat === 'chinese');
  $('lang-btn-english').classList.toggle('active', cat === 'english');
  $('inp-lyrics').placeholder = LYRICS_PLACEHOLDER_BY_CATEGORY[cat] || 'Paste the full lyrics here…';
  if (cat === 'japanese') ensureTokenizer().catch(() => {}); // only fetch the 17MB dictionary once Japanese is actually chosen
}

function openEditor(song) {
  editingSongId = song ? song.id : null;
  $('editor-title').textContent = song ? 'Edit Song' : 'New Song';
  $('inp-title').value = song ? song.title : '';
  $('inp-artist').value = song ? (song.artist || '') : '';
  $('inp-lyrics').value = song ? song.rawLyrics : '';
  // Editing an existing song's link here changes only its current youtubeId
  // (same effect as overriding it in the perform-view widget) — the
  // immutable originalYoutubeId set at creation is never touched here.
  $('inp-youtube').value = song && song.youtubeId ? canonicalYoutubeUrl(song.youtubeId) : '';
  setEditorCategory(song ? songCategory(song) : null);
  setEditorStatus(null);
  hideAnimated($('artist-suggestions'));
  showView('editor');
}

// Distinct existing artist names matching what's typed (same romaji-aware
// matching as the search bars). Clicking one fills the field (still editable).
function artistSuggestions(query) {
  const seen = new Set(), out = [];
  for (const s of songs) {
    const a = (s.artist || '').trim();
    if (!a || seen.has(a.toLowerCase())) continue;
    if (matchesQuery(query, { title: a, category: songCategory(s) })) { seen.add(a.toLowerCase()); out.push(a); }
  }
  return out.slice(0, 8);
}

function wireArtistSuggestions() {
  const input = $('inp-artist');
  const wrap = $('artist-suggestions');
  let timer = null;
  const close = () => hideAnimated(wrap);
  input.addEventListener('input', () => {
    clearTimeout(timer);
    if (!shouldSuggest(input.value)) { close(); return; }
    timer = setTimeout(() => {
      renderSuggestionDropdown(wrap, artistSuggestions(input.value).map(n => ({ title: n })), item => { input.value = item.title; close(); });
    }, 150);
  });
  input.addEventListener('focus', () => { if (shouldSuggest(input.value)) input.dispatchEvent(new Event('input')); });
  document.addEventListener('click', e => { if (e.target !== input && !wrap.contains(e.target)) close(); });
}

function setEditorStatus(msg) {
  const el = $('editor-status');
  el.classList.toggle('hidden', !msg);
  el.textContent = msg || '';
}

async function saveSong() {
  const title = $('inp-title').value.trim();
  const raw = $('inp-lyrics').value.replace(/\s+$/, '');
  if (!title) { setEditorStatus('Song title is required.'); return; }
  if (!editorCategory) { setEditorStatus('Please select a language.'); return; }
  if (!raw.trim()) { setEditorStatus('Paste some lyrics first 🙂'); return; }

  let newYoutubeId = null;
  const ytRaw = $('inp-youtube').value.trim();
  if (ytRaw) {
    newYoutubeId = extractYoutubeId(ytRaw);
    if (!newYoutubeId) { setEditorStatus('Please enter a valid YouTube video link, or leave it blank.'); return; }
  }

  const buildFresh = BUILD_FRESH_BY_CATEGORY[editorCategory];
  const btn = $('btn-save-song');
  btn.disabled = true;
  try {
    if (editorCategory === 'japanese') {
      await ensureTokenizer(setEditorStatus);
      setEditorStatus('Adding furigana…');
    }

    let song;
    if (editingSongId) {
      song = songs.find(s => s.id === editingSongId);
      const lines = mergeRetokenize(song, raw, buildFresh);
      song.title = title || song.title || '(untitled)';
      song.artist = $('inp-artist').value.trim();
      song.rawLyrics = raw;
      song.lines = lines;
      song.category = editorCategory;
      song.youtubeId = newYoutubeId;
      if (!song.originalYoutubeId && newYoutubeId) song.originalYoutubeId = newYoutubeId;
      if (editorCategory === 'japanese') song.titleRomaji = titleToRomaji(title);
    } else {
      song = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: title || '(untitled)',
        artist: $('inp-artist').value.trim(),
        rawLyrics: raw,
        category: editorCategory,
        lines: rawLines(raw).map(buildFresh),
        titleRomaji: editorCategory === 'japanese' ? titleToRomaji(title) : '',
        originalYoutubeId: newYoutubeId,
        youtubeId: newYoutubeId,
      };
      songs.unshift(song);
    }
    saveSongs();
    setEditorStatus(null);
    renderLibrary();
    showView('library');
  } catch (e) {
    setEditorStatus('Dictionary failed to load — check that the app finished installing, then try again.');
    console.error(e);
  } finally {
    btn.disabled = false;
  }
}

