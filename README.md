# Versecue

**Sing karaoke in a language you can't fully read — with the reading printed right above every line.**

Live at **https://godwincjh.github.io/versecue/** · works fully offline once loaded.

---

## The problem

Karaoke is one of the fastest ways to enjoy a language you're learning — but the
lyrics on screen assume you can already read the script fluently. If you're
learning Japanese you might read hiragana and katakana comfortably yet stall on
kanji. If you love K-pop but don't read Hangul, the words scroll past faster than
you can sound them out. The usual workaround — pulling up a romaji sheet on your
phone — means staring at a second screen, losing the original text, and often
fighting for signal in a windowless karaoke room.

**Versecue solves this by printing a reading aid directly above each word, in the
script _you_ can read**, and doing it 100% on-device so it works with zero signal.
Paste the lyrics once and every line carries its own pronunciation guide — the way
furigana appears over kanji on Japanese karaoke machines, extended to Korean,
Chinese, and cross-script readings.

## What it does

- **Japanese** — automatic **furigana** (hiragana above each kanji), chosen from
  sentence context by an on-device morphological analyzer, plus one-tap toggles to
  **romaji** (`A`) or even **Hangul** (`한`) for Korean speakers reading Japanese.
- **Korean** — **romaji** (`A`) with proper Revised-Romanization liaison and
  nasalization, plus a **katakana** (`ア`) toggle for Japanese speakers reading Korean.
- **Chinese** — **pinyin** above each character.
- **English** — shown plainly, no reading layer needed.

The reading mode is a row of script buttons on the lyric screen (`あ / A / 한` for
Japanese, `A / ア` for Korean), so the same song can be read the way each singer
prefers.

## Key features

- **Paste lyrics → instant reading guide.** No manual annotation. Japanese
  readings come from the [kuromoji](https://github.com/takuyaa/kuromoji.js)
  analyzer running fully on-device, so they respect context (明日 → あした,
  okurigana kept plain).
- **100% offline, in every language.** A service worker caches the entire app and
  everything each language needs — the ~17 MB Japanese dictionary (kuromoji) and
  the bundled Chinese pinyin library, while the Korean, romaji, Hangul, and
  katakana readings are pure on-device algorithms that need no dictionary at all.
  Add one song on Wi-Fi, then every reading mode works forever with no signal.
- **Fix any reading, non-destructively.** Songs use non-standard readings
  sometimes (運命 sung as さだめ). Tap a word — or tap a second to select a range
  and merge tokens under one reading — then edit. Dictionary readings for that
  exact word appear as tappable suggestions. Each reading mode keeps its **own
  independent set of edits**, and re-editing the lyrics later preserves your fixes
  through a real word-level diff — a fix is only dropped if its word is deleted.
- **Optional YouTube companion.** Attach a video to a song and a pinnable
  in-app player rides along with the lyrics — no new tabs, no leaving the app.
- **Share a list with a code.** *Generate Sharing Code* mints a short code
  (e.g. `K7XQ2R`) tied to a list name. Friends add it under **Other Lists** by
  typing the code or opening your link, and browse read-only. Removing it only
  affects their copy.
- **Built for the room.** Screen **wake lock** so the phone doesn't sleep
  mid-song, adjustable **font size**, and a library saved on-device that opens
  instantly (the dictionary only loads when you add or edit a song).

## Architecture

No build step, no framework — plain HTML/CSS and vanilla ES, split into focused
modules loaded in dependency order (foundation → domain → UI → features →
bootstrap). Each module is a classic script sharing one global scope; there's no
bundler to run, which keeps the offline story simple.

| Layer | File | Responsibility |
|---|---|---|
| Foundation | `js/state.js` | Storage constants, `localStorage` helpers, global app state |
| Domain | `js/translit.js` | Pure transliteration engines — JP↔romaji, JP→Hangul, KR→romaji, KR→katakana |
| Model | `js/tokenize.js` | kuromoji/pinyin tokenizing, per-category line builders, diff-preserving re-save, migration |
| UI core | `js/ui-core.js` | Shared primitives — `$`, view switching, toast, animated reveals, search bars, language filters |
| Feature | `js/library.js` | My List — render, publish, remove, add-to-list |
| Feature | `js/editor.js` | Song editor — category selector, lyrics entry, save |
| Feature | `js/perform.js` | Lyric screen — rendering, reading modes, word selection, reading-fix modal, wake lock, font |
| Feature | `js/perform-youtube.js` | The YouTube companion widget |
| Feature | `js/sharing.js` | Share app, Public List, sharing codes, Other Lists, cross-list search |
| Bootstrap | `js/main.js` | Event wiring, init, service-worker registration (loads **last**) |

| Other path | Purpose |
|---|---|
| `index.html`, `style.css` | Markup and styling |
| `sw.js` | Service worker — caches everything for offline use. **Bump `CACHE` on every change** or installed phones keep serving the old version |
| `manifest.webmanifest`, `icons/` | PWA install metadata |
| `lib/kuromoji.js` | Japanese morphological analyzer |
| `lib/pinyin-pro.js` | Chinese pinyin converter |
| `dict/*.dat.gz` | IPADIC dictionary files (~17 MB) used by kuromoji |
| `serve.ps1` | Local dev server |
| `../versecue-share/` | Separate Cloudflare Pages + KV project — the sharing-code API only. Doesn't host the app. |

## Run locally

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
# then open http://localhost:8321
```

## Get it on your phone

1. Open **https://godwincjh.github.io/versecue/** in Chrome (or Safari on iOS).
2. Add one song — this loads and caches everything, so do it on Wi-Fi once.
3. Menu → **Add to Home Screen** → Install.
4. Done. The home-screen icon now works fully offline, forever.
