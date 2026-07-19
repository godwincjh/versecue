'use strict';

/* ================================================================
   Versecue — perform view — YouTube companion widget
   ================================================================ */

/* ---------------- youtube widget ---------------- */

let youtubePinned = false; // resets to false (unpinned) every time the panel (re)opens
let youtubeLoadedValue = ''; // the link text currently reflected by the iframe — the load button is disabled whenever the input matches this

const PIN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M12 11v10"/></svg>';
const UNPIN_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M12 11v10"/><path d="M4 4l16 16"/></svg>';

function canonicalYoutubeUrl(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/*
 * Recognizes a pasted YouTube link (watch/share/shorts URL, or a bare
 * 11-character video id) and pulls out the video id. Returns null for
 * anything that isn't a link to one specific playable video — that's
 * treated as invalid input, not a search (YouTube's embeddable-search
 * trick stopped working reliably, and a new tab was explicitly ruled
 * out, so there's nothing useful left to do with a plain query).
 */
function extractYoutubeId(input) {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let url;
  try { url = new URL(s); } catch { return null; }
  if (!/(^|\.)youtu\.be$/.test(url.hostname) && !/(^|\.)youtube(-nocookie)?\.com$/.test(url.hostname)) return null;
  if (url.hostname.endsWith('youtu.be')) return url.pathname.split('/')[1] || null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const m = url.pathname.match(/^\/(embed|shorts)\/([\w-]{11})/);
  return m ? m[2] : null;
}

function showYoutubeError() { $('youtube-error').classList.remove('hidden'); }
function hideYoutubeError() { $('youtube-error').classList.add('hidden'); }

function updateYoutubeRevertButton() {
  const song = currentSong;
  const hasOriginal = !!(song && song.originalYoutubeId);
  const isOriginal = hasOriginal && song.youtubeId === song.originalYoutubeId;
  $('youtube-revert-btn').disabled = !hasOriginal || isOriginal;
}

function updatePinIcon() {
  $('youtube-pin-btn').innerHTML = youtubePinned ? UNPIN_ICON : PIN_ICON;
  $('youtube-pin-btn').title = youtubePinned ? 'Unpin' : 'Pin';
}

function updateYoutubeLoadBtnState() {
  $('youtube-load-btn').disabled = $('youtube-search-input').value.trim() === youtubeLoadedValue.trim();
}

function stopYoutubePanel() {
  $('youtube-panel').classList.add('hidden');
  $('youtube-panel').classList.remove('pinned');
  $('youtube-frame').src = '';
  $('youtube-search-input').value = '';
  youtubeLoadedValue = '';
  hideYoutubeError();
  youtubePinned = false;
  updatePinIcon();
  updateYoutubeLoadBtnState();
}

function toggleYoutubePanel() {
  const panel = $('youtube-panel');
  const opening = panel.classList.contains('hidden');
  if (!opening) { stopYoutubePanel(); return; }
  youtubePinned = false;
  panel.classList.remove('pinned');
  updatePinIcon();
  panel.classList.remove('hidden');
  hideYoutubeError();
  // Prefer the current (possibly-overridden) video, but fall back to the
  // original so it's loaded and ready even when youtubeId isn't set yet
  // (e.g. songs opened from Public List / Other Lists carry only the original).
  const current = currentSong && (currentSong.youtubeId || currentSong.originalYoutubeId);
  youtubeLoadedValue = current ? canonicalYoutubeUrl(current) : '';
  $('youtube-search-input').value = youtubeLoadedValue;
  $('youtube-frame').src = current ? `https://www.youtube-nocookie.com/embed/${current}` : '';
  updateYoutubeRevertButton();
  updateYoutubeLoadBtnState();
}

// Pure CSS (position:sticky via the .pinned class) — no DOM move, so the
// iframe is never detached/reattached and playback isn't interrupted.
function toggleYoutubePin() {
  youtubePinned = !youtubePinned;
  $('youtube-panel').classList.toggle('pinned', youtubePinned);
  updatePinIcon();
}

function commitYoutubeLink() {
  const raw = $('youtube-search-input').value;
  if (raw.trim() === youtubeLoadedValue.trim()) return; // nothing changed — same guard as the button's disabled state, for the Enter-key path
  const id = extractYoutubeId(raw);
  if (!id) { if (raw.trim()) showYoutubeError(); return; }
  hideYoutubeError();
  $('youtube-frame').src = `https://www.youtube-nocookie.com/embed/${id}`;
  youtubeLoadedValue = canonicalYoutubeUrl(id);
  $('youtube-search-input').value = youtubeLoadedValue;
  if (currentSong && !performReadOnly) {
    currentSong.youtubeId = id;
    saveSongs();
  }
  updateYoutubeRevertButton();
  updateYoutubeLoadBtnState();
}

function revertYoutubeToOriginal() {
  if (!currentSong || !currentSong.originalYoutubeId) return;
  const id = currentSong.originalYoutubeId;
  currentSong.youtubeId = id;
  youtubeLoadedValue = canonicalYoutubeUrl(id);
  $('youtube-search-input').value = youtubeLoadedValue;
  $('youtube-frame').src = `https://www.youtube-nocookie.com/embed/${id}`;
  hideYoutubeError();
  updateYoutubeLoadBtnState();
  if (!performReadOnly) saveSongs();
  updateYoutubeRevertButton();
}

function setPerformReadingMode(mode) {
  if (mode === performReadingMode) return;
  performReadingMode = mode;
  updateReadingModeButtons(songCategory(currentSong));
  selection = null;
  updateSelectionBar();
  buildLyricsDom(currentSong);
  $('btn-sel-edit').textContent = editLabelFor(songCategory(currentSong));
}

