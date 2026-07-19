'use strict';

/* ================================================================
   Versecue — transliteration engines (pure functions: JP↔romaji, JP→hangul, KR→romaji, KR→katakana)
   ================================================================ */

/* ---------------- japanese text helpers ---------------- */

const KANJI_RE = /[㐀-鿿豈-﫿々〆ヶ]/;
const DIGIT_RE = /[0-9０-９]/;

function hasKanji(s) { return KANJI_RE.test(s); }

function kataToHira(s) {
  return s.replace(/[ァ-ヶ]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * Split a surface string into kanji / non-kanji runs and distribute the
 * reading across the kanji runs, so okurigana keeps its own kana and only
 * the kanji get ruby. e.g. 歩き出す + あるきだす →
 *   [ {text:歩, ruby:ある}, {text:き}, {text:出, ruby:だ}, {text:す} ]
 */
function alignFurigana(surface, reading) {
  // Digits take ruby too (in addition to kanji), so a counter reading like
  // 3つ→みっつ can render over the "3"; kanji cases (三つ, 二人) align normally.
  const needsRuby = ch => KANJI_RE.test(ch) || DIGIT_RE.test(ch);
  if (!reading || ![...surface].some(needsRuby)) return [{ text: surface }];
  const hira = kataToHira(reading);

  const runs = [];
  for (const ch of surface) {
    const k = needsRuby(ch);
    const last = runs[runs.length - 1];
    if (last && last.kanji === k) last.text += ch;
    else runs.push({ text: ch, kanji: k });
  }

  let pattern = '^';
  for (const run of runs) {
    pattern += run.kanji ? '(.+?)' : escapeRegex(kataToHira(run.text));
  }
  pattern += '$';

  const m = hira.match(new RegExp(pattern));
  if (!m) return [{ text: surface, ruby: hira }]; // fallback: whole-word ruby

  const parts = [];
  let g = 1;
  for (const run of runs) {
    if (run.kanji) parts.push({ text: run.text, ruby: m[g++] });
    else parts.push({ text: run.text });
  }
  return parts;
}

/* ---------------- japanese counter words ---------------- */

/*
 * number + counter combinations have irregular readings the dictionary gets
 * wrong (2人 is ふたり not ににん; 3つ is みっつ not さんつ). After tokenizing,
 * detect a quantifier (arabic/fullwidth/kanji numeral, or 何/幾) immediately
 * followed by a known counter, and override the reading with the correct one,
 * merging the two into a single token. Only confidently-irregular counters are
 * tabled — ambiguous ones (月/年/時/分, where a bare number+char is often not a
 * counter at all: 十分 じゅうぶん "enough" vs じゅっぷん "10 min") are left to the
 * dictionary. Readings are katakana to match the tokenizer's reading field, so
 * furigana / romaji / hangul modes all pick them up. Users can still tap-edit
 * any word if a reading is off.
 */
const KANJI_DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

function parseJpNumber(s) {
  if (/^[0-9０-９]+$/.test(s)) {
    return parseInt(s.replace(/[０-９]/g, d => '０１２３４５６７８９'.indexOf(d)), 10);
  }
  if (s === '〇' || s === '零') return 0;
  const ti = s.indexOf('十');                    // kanji numerals up to 99 (enough for counters)
  if (ti === -1) return (s.length === 1 && s in KANJI_DIGITS) ? KANJI_DIGITS[s] : null;
  const before = s.slice(0, ti), after = s.slice(ti + 1);
  const tens = before === '' ? 1 : (before in KANJI_DIGITS ? KANJI_DIGITS[before] : null);
  const ones = after === '' ? 0 : (after in KANJI_DIGITS ? KANJI_DIGITS[after] : null);
  return (tens === null || ones === null) ? null : tens * 10 + ones;
}

const COUNTER_READINGS = {
  'つ': { 1: 'ヒトツ', 2: 'フタツ', 3: 'ミッツ', 4: 'ヨッツ', 5: 'イツツ', 6: 'ムッツ', 7: 'ナナツ', 8: 'ヤッツ', 9: 'ココノツ', '幾': 'イクツ' },
  '人': { 1: 'ヒトリ', 2: 'フタリ', 3: 'サンニン', 4: 'ヨニン', 5: 'ゴニン', 6: 'ロクニン', 7: 'シチニン', 8: 'ハチニン', 9: 'キュウニン', 10: 'ジュウニン', '何': 'ナンニン' },
  '個': { 1: 'イッコ', 2: 'ニコ', 3: 'サンコ', 4: 'ヨンコ', 5: 'ゴコ', 6: 'ロッコ', 7: 'ナナコ', 8: 'ハッコ', 9: 'キュウコ', 10: 'ジュッコ', '何': 'ナンコ' },
  '本': { 1: 'イッポン', 2: 'ニホン', 3: 'サンボン', 4: 'ヨンホン', 5: 'ゴホン', 6: 'ロッポン', 7: 'ナナホン', 8: 'ハッポン', 9: 'キュウホン', 10: 'ジュッポン', '何': 'ナンボン' },
  '匹': { 1: 'イッピキ', 2: 'ニヒキ', 3: 'サンビキ', 4: 'ヨンヒキ', 5: 'ゴヒキ', 6: 'ロッピキ', 7: 'ナナヒキ', 8: 'ハッピキ', 9: 'キュウヒキ', 10: 'ジュッピキ', '何': 'ナンビキ' },
  '枚': { 1: 'イチマイ', 2: 'ニマイ', 3: 'サンマイ', 4: 'ヨンマイ', 5: 'ゴマイ', 6: 'ロクマイ', 7: 'ナナマイ', 8: 'ハチマイ', 9: 'キュウマイ', 10: 'ジュウマイ', '何': 'ナンマイ' },
  '冊': { 1: 'イッサツ', 2: 'ニサツ', 3: 'サンサツ', 4: 'ヨンサツ', 5: 'ゴサツ', 6: 'ロクサツ', 7: 'ナナサツ', 8: 'ハッサツ', 9: 'キュウサツ', 10: 'ジュッサツ', '何': 'ナンサツ' },
  '杯': { 1: 'イッパイ', 2: 'ニハイ', 3: 'サンバイ', 4: 'ヨンハイ', 5: 'ゴハイ', 6: 'ロッパイ', 7: 'ナナハイ', 8: 'ハッパイ', 9: 'キュウハイ', 10: 'ジュッパイ', '何': 'ナンバイ' },
  '回': { 1: 'イッカイ', 2: 'ニカイ', 3: 'サンカイ', 4: 'ヨンカイ', 5: 'ゴカイ', 6: 'ロッカイ', 7: 'ナナカイ', 8: 'ハッカイ', 9: 'キュウカイ', 10: 'ジュッカイ', '何': 'ナンカイ' },
  '歳': { 1: 'イッサイ', 2: 'ニサイ', 3: 'サンサイ', 4: 'ヨンサイ', 5: 'ゴサイ', 6: 'ロクサイ', 7: 'ナナサイ', 8: 'ハッサイ', 9: 'キュウサイ', 10: 'ジュッサイ', 20: 'ハタチ', '何': 'ナンサイ' },
  '才': { 1: 'イッサイ', 2: 'ニサイ', 3: 'サンサイ', 4: 'ヨンサイ', 5: 'ゴサイ', 6: 'ロクサイ', 7: 'ナナサイ', 8: 'ハッサイ', 9: 'キュウサイ', 10: 'ジュッサイ', 20: 'ハタチ', '何': 'ナンサイ' },
  '日': { 2: 'フツカ', 3: 'ミッカ', 4: 'ヨッカ', 5: 'イツカ', 6: 'ムイカ', 7: 'ナノカ', 8: 'ヨウカ', 9: 'ココノカ', 10: 'トオカ', 14: 'ジュウヨッカ', 20: 'ハツカ', 24: 'ニジュウヨッカ' }, // 1日 omitted: ついたち vs いちにち is context-dependent
};

const COUNTER_CHARS = new Set(Object.keys(COUNTER_READINGS));
const QUANTIFIER_RE = /^[0-9０-９〇零一二三四五六七八九十百千]+$/;

function isQuantifier(s) { return QUANTIFIER_RE.test(s) || s === '何' || s === '幾'; }

function counterReadingFor(numSurface, counter) {
  const table = COUNTER_READINGS[counter];
  if (!table) return null;
  const key = (numSurface === '何' || numSurface === '幾') ? numSurface : parseJpNumber(numSurface);
  return (key === null) ? null : (table[key] || null);
}

// A surface that is a quantifier directly followed by a known counter char
// (dictionary sometimes emits the pair as one token: 二人 / 三つ / 2人).
function splitCounter(s) {
  for (const c of COUNTER_CHARS) {
    if (s.length > c.length && s.endsWith(c)) {
      const num = s.slice(0, -c.length);
      if (isQuantifier(num)) return { num, counter: c };
    }
  }
  return null;
}

// Post-process a Japanese token list, fixing counter readings in place. The
// number can be split across several tokens (kuromoji cuts 二十歳 into 二/十/歳),
// so we gather a maximal run of consecutive numeral tokens, then look at what
// follows: a bare counter (歳), or a token that is itself number+counter (十歳).
function applyCounterReadings(toks) {
  const out = [];
  let i = 0;
  while (i < toks.length) {
    let j = i;
    while (j < toks.length && isQuantifier(toks[j].s)) j++;   // toks[i..j) are numerals
    if (j > i && j < toks.length) {
      const num = toks.slice(i, j).map(t => t.s).join('');
      const nextS = toks[j].s;
      let counter = null, fullNum = num;
      if (COUNTER_CHARS.has(nextS)) counter = nextS;           // …number + 歳
      else {
        const sc = splitCounter(nextS);                        // …number + 十歳 (leftover digit stuck to the counter)
        if (sc && QUANTIFIER_RE.test(sc.num)) { counter = sc.counter; fullNum = num + sc.num; }
      }
      if (counter) {
        const r = counterReadingFor(fullNum, counter);
        if (r) { out.push({ s: toks.slice(i, j + 1).map(t => t.s).join(''), r }); i = j + 1; continue; }
      }
    }
    const single = splitCounter(toks[i].s);                    // one token already number+counter: 二人 / 三つ / 8個
    if (single) {
      const r = counterReadingFor(single.num, single.counter);
      if (r) { out.push({ s: toks[i].s, r }); i++; continue; }
    }
    out.push(toks[i]);
    i++;
  }
  return out;
}

/* ---------------- japanese romaji ---------------- */

/*
 * Plain-ASCII Hepburn-style romaji, computed directly from the hiragana
 * reading — no macrons (おう → "ou" not "ō"), which reads more naturally
 * for casual karaoke use than formal transliteration. Unlike furigana,
 * romaji is shown per whole word rather than split across kanji/okurigana
 * (there's no clean per-character alignment between romaji and kanji the
 * way there is between kana and kanji), so this only needs to convert a
 * reading string, not align it against a surface.
 */
const KANA_ROMAJI = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ゎ': 'wa',
};
const KANA_ROMAJI_YOON = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
};

/*
 * lookaheadKana is the reading of whatever comes right after this string
 * in the line (typically the next token) — needed only to resolve a
 * trailing っ/ッ that falls exactly on a token boundary, so the doubled
 * consonant it produces still lines up correctly with the next word's
 * first sound. If there's truly nothing after it (end of the line), the
 * sokuon contributes no romaji at all, per standard convention.
 */
function kanaToRomaji(kana, lookaheadKana) {
  const hira = kataToHira(kana);
  const lookahead = lookaheadKana ? kataToHira(lookaheadKana) : '';
  let result = '';
  let i = 0;
  while (i < hira.length) {
    const ch = hira[i];

    if (ch === 'っ') {
      const isLast = i === hira.length - 1;
      const peek = isLast ? lookahead : hira.slice(i + 1, i + 3);
      const next = KANA_ROMAJI_YOON[peek.slice(0, 2)] || KANA_ROMAJI[peek[0]];
      if (next) result += next.startsWith('ch') ? 't' : next[0];
      i++;
      continue;
    }
    if (ch === 'ー') {
      const lastVowel = result.slice(-1);
      if ('aiueo'.includes(lastVowel)) result += lastVowel;
      i++;
      continue;
    }
    const yoon = KANA_ROMAJI_YOON[hira.slice(i, i + 2)];
    if (yoon) { result += yoon; i += 2; continue; }
    if (ch === 'ん') {
      const next = hira[i + 1];
      const nextRomaji = next ? (KANA_ROMAJI_YOON[hira.slice(i + 1, i + 3)] || KANA_ROMAJI[next]) : null;
      result += 'n' + (nextRomaji && /^[aiueoy]/.test(nextRomaji) ? "'" : '');
      i++;
      continue;
    }
    result += KANA_ROMAJI[ch] || ch; // pass through anything not kana (kanji, punctuation, latin)
    i++;
  }
  return result;
}

/*
 * は and へ as grammatical particles are pronounced "wa"/"e", not the
 * literal kana readings "ha"/"he" — a well-known romaji exception. Since
 * kuromoji already segments them into their own single-character token
 * whenever they're used as particles (as opposed to being part of a
 * larger word, where they'd stay attached to that word's token), a token
 * whose whole surface is exactly は or へ is reliably the particle case.
 */
function tokenRomaji(tok, nextTok) {
  if (!tok.r) return null;
  if (tok.s === 'は') return 'wa';
  if (tok.s === 'へ') return 'e';
  return kanaToRomaji(tok.r, nextTok && nextTok.r);
}

/*
 * Kana-to-hangul transliteration, the convention used for Japanese words
 * and names in Korean (도쿄 for 東京/とうきょう, 다나카 for 田中/たなか).
 * The tricky part: unvoiced か/た-row sounds use the PLAIN Korean
 * consonant (가/다) at the start of a word but the ASPIRATED one (카/타)
 * mid-word — verified against real place names/surnames (도쿄 not 토쿄,
 * but 다나카 not 다나가 — the medial か in たなか lands on 카, not 가).
 * This is the opposite alternation from the Korean-to-katakana direction,
 * which follows Korean's own initial/medial voicing instead — the two
 * are genuinely different rules, not mirror images of each other. Voiced
 * が/だ/ば-row sounds always map to the plain consonant regardless of
 * position, since they're already "soft". Long vowels spelled with う
 * after an o-column mora (とう, きょう) are collapsed rather than spelled
 * out as a separate 우 syllable, matching how they're pronounced.
 */
const HANGUL_MORA = {
  'あ': '아', 'い': '이', 'う': '우', 'え': '에', 'お': '오',
  'が': '가', 'ぎ': '기', 'ぐ': '구', 'げ': '게', 'ご': '고',
  'ざ': '자', 'じ': '지', 'ず': '즈', 'ぜ': '제', 'ぞ': '조',
  'だ': '다', 'ぢ': '지', 'づ': '즈', 'で': '데', 'ど': '도',
  'ば': '바', 'び': '비', 'ぶ': '부', 'べ': '베', 'ぼ': '보',
  'ぱ': '파', 'ぴ': '피', 'ぷ': '푸', 'ぺ': '페', 'ぽ': '포',
  'な': '나', 'に': '니', 'ぬ': '누', 'ね': '네', 'の': '노',
  'ま': '마', 'み': '미', 'む': '무', 'め': '메', 'も': '모',
  'ら': '라', 'り': '리', 'る': '루', 'れ': '레', 'ろ': '로',
  'は': '하', 'ひ': '히', 'ふ': '후', 'へ': '헤', 'ほ': '호',
  'や': '야', 'ゆ': '유', 'よ': '요',
  'わ': '와', 'を': '오',
  'さ': '사', 'し': '시', 'す': '스', 'せ': '세', 'そ': '소',
};
// [word-initial, word-medial] pairs for the two rows with a position-based alternation
const HANGUL_KROW = { 'か': ['가', '카'], 'き': ['기', '키'], 'く': ['구', '쿠'], 'け': ['게', '케'], 'こ': ['고', '코'] };
const HANGUL_TROW = { 'た': ['다', '타'], 'ち': ['지', '치'], 'つ': ['즈', '츠'], 'て': ['데', '테'], 'と': ['도', '토'] };
const HANGUL_YOON_KROW = { 'きゃ': ['갸', '캬'], 'きゅ': ['규', '큐'], 'きょ': ['교', '쿄'] };
const HANGUL_YOON_TROW = { 'ちゃ': ['자', '차'], 'ちゅ': ['주', '추'], 'ちょ': ['조', '초'] };
const HANGUL_YOON_FIXED = {
  'しゃ': '샤', 'しゅ': '슈', 'しょ': '쇼',
  'にゃ': '냐', 'にゅ': '뉴', 'にょ': '뇨',
  'ひゃ': '햐', 'ひゅ': '휴', 'ひょ': '효',
  'みゃ': '먀', 'みゅ': '뮤', 'みょ': '묘',
  'りゃ': '랴', 'りゅ': '류', 'りょ': '료',
  'ぎゃ': '갸', 'ぎゅ': '규', 'ぎょ': '교',
  'じゃ': '자', 'じゅ': '주', 'じょ': '조',
  'びゃ': '뱌', 'びゅ': '뷰', 'びょ': '뵤',
  'ぴゃ': '퍄', 'ぴゅ': '퓨', 'ぴょ': '표',
  'ぢゃ': '자', 'ぢゅ': '주', 'ぢょ': '조',
};
const O_COLUMN_HIRA = new Set(['こ', 'そ', 'と', 'の', 'ほ', 'も', 'よ', 'ろ', 'ご', 'ぞ', 'ど', 'ぼ', 'ぽ', 'お']);

// Adds a jongseong to the last character of str by decomposing that
// precomposed syllable and recomposing it with the new final — used for
// っ (→ ㅅ batchim) and ん (→ ㄴ batchim), since Hangul syllables are
// single codepoints that can't just be concatenated with a bare jamo.
function addBatchimToLast(str, finalIdx) {
  if (!str) return null;
  const code = str.codePointAt(str.length - 1);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return null;
  if ((code - HANGUL_BASE) % 28 !== 0) return null; // already has a batchim
  return str.slice(0, -1) + String.fromCodePoint(code + finalIdx);
}

function kanaToHangul(kana) {
  const hira = kataToHira(kana);
  let result = '';
  let isWordStart = true;
  let lastWasOSound = false;
  let i = 0;
  while (i < hira.length) {
    const ch = hira[i];

    if (lastWasOSound && ch === 'う') { lastWasOSound = false; i++; continue; }
    lastWasOSound = false;

    if (ch === 'っ') { result = addBatchimToLast(result, 19) ?? result; i++; continue; } // ㅅ
    if (ch === 'ー') { i++; continue; }
    if (ch === 'ん') { result = addBatchimToLast(result, 4) ?? (result + '은'); i++; continue; } // ㄴ

    const two = hira.slice(i, i + 2);
    if (HANGUL_YOON_KROW[two]) { result += HANGUL_YOON_KROW[two][isWordStart ? 0 : 1]; lastWasOSound = true; i += 2; isWordStart = false; continue; }
    if (HANGUL_YOON_TROW[two]) { result += HANGUL_YOON_TROW[two][isWordStart ? 0 : 1]; lastWasOSound = true; i += 2; isWordStart = false; continue; }
    if (HANGUL_YOON_FIXED[two]) { result += HANGUL_YOON_FIXED[two]; lastWasOSound = two.endsWith('ょ'); i += 2; isWordStart = false; continue; }

    if (HANGUL_KROW[ch]) { result += HANGUL_KROW[ch][isWordStart ? 0 : 1]; lastWasOSound = O_COLUMN_HIRA.has(ch); i++; isWordStart = false; continue; }
    if (HANGUL_TROW[ch]) { result += HANGUL_TROW[ch][isWordStart ? 0 : 1]; lastWasOSound = O_COLUMN_HIRA.has(ch); i++; isWordStart = false; continue; }
    if (HANGUL_MORA[ch]) { result += HANGUL_MORA[ch]; lastWasOSound = O_COLUMN_HIRA.has(ch); i++; isWordStart = false; continue; }

    result += ch; // not kana — pass through, and the next mora is a fresh "word" for voicing purposes
    isWordStart = true;
    i++;
  }
  return result;
}

function tokenHangul(tok) {
  if (!tok.r) return null;
  if (tok.s === 'は') return '와';
  if (tok.s === 'へ') return '에';
  return kanaToHangul(tok.r);
}

/*
 * Auto romaji for a run of tokens [start, end] within a line — each
 * token still gets its lookahead from the line's actual next token
 * (toks[i + 1]), even past the end of the run, so a sokuon that lands on
 * the run's own last token can still double correctly into whatever
 * follows it in the full line.
 */
function romajiForRange(toks, start, end) {
  let out = '';
  for (let i = start; i <= end; i++) out += tokenRomaji(toks[i], toks[i + 1]) || '';
  return out;
}


/* ---------------- korean romanization ---------------- */

/*
 * Revised Romanization of Korean, computed directly from Unicode's Hangul
 * syllable decomposition — unlike Japanese furigana, this needs no
 * dictionary at all. Every precomposed Hangul syllable (U+AC00-U+D7A3) is
 * algorithmically built from an initial consonant + vowel + optional final
 * consonant, and each has one fixed romanization per jamo.
 *
 * romanizeWord also applies the two most common cross-syllable sound
 * changes, since single-syllable table lookup alone gets these wrong:
 *   - liaison (연음화): a batchim followed by a vowel-initial syllable
 *     moves into that syllable's onset (없이 → eopsi, not eobs-i). For a
 *     complex (double) batchim, only the second jamo moves; the first
 *     stays behind as a simplified final.
 *   - nasalization (비음화): a plosive-representative batchim (ㄱ/ㄷ/ㅂ)
 *     followed by a nasal-initial syllable (ㄴ/ㅁ) becomes the matching
 *     nasal (없는 → eomneun, not eobs-neun).
 * Also handles ㄴ+ㄹ / ㄹ+ㄴ liquidization (신라 → silla, 실내 → sillae) and
 * ㄷ/ㅌ + 이/y-vowel palatalization (같이 → gachi, 굳이 → guji). Tensification
 * is left out (official Revised Romanization doesn't reflect it anyway).
 */
const HANGUL_BASE = 0xAC00;
const HANGUL_LAST = 0xD7A3;
const RR_INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RR_MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const RR_FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

// Per jongseong index (0=none, Unicode order): what stays behind as this
// syllable's (simplified) final when liaising, and what moves over to
// become the next syllable's onset. ㅎ as a second component elides
// silently rather than transferring (좋아 → joa, not joha). ㅇ (21) is
// omitted deliberately — its liaison behavior is inconsistent enough in
// practice that leaving it alone is safer than guessing.
const JONGSEONG_LIAISON = {
  1: { carry: '', move: 'g' },   2: { carry: '', move: 'kk' },  3: { carry: 'k', move: 's' },
  4: { carry: '', move: 'n' },   5: { carry: 'n', move: 'j' },  6: { carry: 'n', move: '' },
  7: { carry: '', move: 'd' },   8: { carry: '', move: 'r' },   9: { carry: 'l', move: 'g' },
  10: { carry: 'l', move: 'm' }, 11: { carry: 'l', move: 'b' }, 12: { carry: 'l', move: 's' },
  13: { carry: 'l', move: 't' }, 14: { carry: 'l', move: 'p' }, 15: { carry: 'l', move: '' },
  16: { carry: '', move: 'm' },  17: { carry: '', move: 'b' },  18: { carry: 'p', move: 's' },
  19: { carry: '', move: 's' },  20: { carry: '', move: 'ss' },
  22: { carry: '', move: 'j' },  23: { carry: '', move: 'ch' }, 24: { carry: '', move: 'k' },
  25: { carry: '', move: 't' },  26: { carry: '', move: 'p' },  27: { carry: '', move: '' },
};
const NASAL_MAP = { k: 'ng', t: 'n', p: 'm' };
const PALATAL_MEDIALS = new Set([2, 3, 6, 7, 12, 17, 20]); // 이 and y-vowels (ya/yae/yeo/ye/yo/yu/i)

function isHangulSyllable(ch) {
  const code = ch.codePointAt(0);
  return code >= HANGUL_BASE && code <= HANGUL_LAST;
}

function hasHangul(s) {
  for (const ch of s) if (isHangulSyllable(ch)) return true;
  return false;
}

function decomposeSyllable(ch) {
  const code = ch.codePointAt(0) - HANGUL_BASE;
  return {
    initial: Math.floor(code / (21 * 28)),
    medial: Math.floor((code % (21 * 28)) / 28),
    final: code % 28,
  };
}

function romanizeSyllable(ch) {
  const { initial, medial, final } = decomposeSyllable(ch);
  return RR_INITIALS[initial] + RR_MEDIALS[medial] + RR_FINALS[final];
}

function romanizeWord(word) {
  const chars = Array.from(word);
  const syllables = chars.map(ch => (isHangulSyllable(ch) ? decomposeSyllable(ch) : null));

  let result = '';
  let forcedInitial = null; // onset letter forced onto the current syllable by the previous syllable's liaison
  for (let i = 0; i < chars.length; i++) {
    const syl = syllables[i];
    if (!syl) { result += chars[i]; forcedInitial = null; continue; }

    const initialLetter = forcedInitial !== null ? forcedInitial : RR_INITIALS[syl.initial];
    forcedInitial = null;
    const next = syllables[i + 1];

    if (syl.final !== 0 && next) {
      if (next.initial === 11 && JONGSEONG_LIAISON[syl.final]) {
        const rule = JONGSEONG_LIAISON[syl.final];
        let move = rule.move;
        // palatalization: ㄷ/ㅌ before 이 or a y-vowel → ㅈ/ㅊ (같이 gachi, 굳이 guji)
        if ((syl.final === 7 || syl.final === 25) && PALATAL_MEDIALS.has(next.medial)) move = syl.final === 7 ? 'j' : 'ch';
        result += initialLetter + RR_MEDIALS[syl.medial] + rule.carry;
        forcedInitial = move;
        continue;
      }
      // ㄴ+ㄹ / ㄹ+ㄴ liquidization → ll (신라 silla, 실내 sillae, 설날 seollal)
      if ((syl.final === 4 && next.initial === 5) || (syl.final === 8 && next.initial === 2)) {
        result += initialLetter + RR_MEDIALS[syl.medial] + 'l';
        forcedInitial = 'l';
        continue;
      }
      let finalSound = RR_FINALS[syl.final];
      if ((next.initial === 2 || next.initial === 6) && NASAL_MAP[finalSound]) finalSound = NASAL_MAP[finalSound];
      result += initialLetter + RR_MEDIALS[syl.medial] + finalSound;
      continue;
    }

    result += initialLetter + RR_MEDIALS[syl.medial] + RR_FINALS[syl.final];
  }
  return result;
}

/*
 * Hangul-to-katakana transliteration, the convention used throughout
 * Japanese media for Korean words and names (e.g. 사랑 → サラン, 김치 →
 * キムチ). Built compositionally rather than as one giant table: each
 * consonant maps to a "row" of 5 base katakana (a/i/u/e/o), y-glide
 * medials (ya/yeo/yo/yu/ye-ish) attach a small ゃゅょぇ to the row's i-form,
 * w-glide medials (wa/wo/wi/we) attach a small ぁぃぅぇぉ to the row's
 * u-form — except the plain vowel row, which uses the dedicated single
 * kana (ワ/ヤ/ユ/ヨ) instead of composing. ㄱ/ㄷ/ㅂ/ㅈ alternate between
 * their unvoiced and voiced row depending on whether they open the word
 * (없어 → for example a word-medial ㅂ sounds and is written voiced, e.g.
 * 아버지 → アボジ) — this mirrors real Korean pronunciation, not just a
 * stylistic choice. Tensed consonants (ㄲㄸㅃㅆㅉ) get a small ッ prefix.
 * Codas collapse to ン (nasal) or ッ (stop) or ル/ム, since katakana has
 * no way to represent a bare final consonant otherwise.
 */
const KATA_ROW = {
  vowel: ['ア', 'イ', 'ウ', 'エ', 'オ'],
  k: ['カ', 'キ', 'ク', 'ケ', 'コ'],
  g: ['ガ', 'ギ', 'グ', 'ゲ', 'ゴ'],
  n: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'],
  t: ['タ', 'ティ', 'トゥ', 'テ', 'ト'],
  d: ['ダ', 'ディ', 'ドゥ', 'デ', 'ド'],
  r: ['ラ', 'リ', 'ル', 'レ', 'ロ'],
  m: ['マ', 'ミ', 'ム', 'メ', 'モ'],
  p: ['パ', 'ピ', 'プ', 'ペ', 'ポ'],
  b: ['バ', 'ビ', 'ブ', 'ベ', 'ボ'],
  s: ['サ', 'シ', 'ス', 'セ', 'ソ'],
  j: ['ジャ', 'ジ', 'ジュ', 'ジェ', 'ジョ'],
  ch: ['チャ', 'チ', 'チュ', 'チェ', 'チョ'],
  h: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'],
};
// Per RR_MEDIALS index: which of the row's 5 base slots it lands on, and
// whether it's a plain vowel, a y-glide (ya/yu/yo family), or a w-glide
// (wa/wi/we/wo family).
const MEDIAL_TO_KATA = [
  { base: 'a', glide: null }, { base: 'e', glide: null }, { base: 'a', glide: 'y' }, { base: 'e', glide: 'y' },
  { base: 'o', glide: null }, { base: 'e', glide: null }, { base: 'o', glide: 'y' }, { base: 'e', glide: 'y' },
  { base: 'o', glide: null }, { base: 'a', glide: 'w' }, { base: 'e', glide: 'w' }, { base: 'e', glide: 'w' },
  { base: 'o', glide: 'y' }, { base: 'u', glide: null }, { base: 'o', glide: 'w' }, { base: 'e', glide: 'w' },
  { base: 'i', glide: 'w' }, { base: 'u', glide: 'y' }, { base: 'u', glide: null }, { base: 'i', glide: 'w' },
  { base: 'i', glide: null },
];
const KATA_CODA = { '': '', k: 'ッ', n: 'ン', t: 'ッ', l: 'ル', m: 'ム', p: 'ッ', ng: 'ン' };
const KATA_VOWEL_INDEX = { a: 0, i: 1, u: 2, e: 3, o: 4 };

function kataRowFor(initialIdx, isWordStart) {
  switch (initialIdx) {
    case 0: return { row: isWordStart ? KATA_ROW.k : KATA_ROW.g, tense: false };  // ㄱ
    case 1: return { row: KATA_ROW.k, tense: true };                             // ㄲ
    case 2: return { row: KATA_ROW.n, tense: false };                            // ㄴ
    case 3: return { row: isWordStart ? KATA_ROW.t : KATA_ROW.d, tense: false };  // ㄷ
    case 4: return { row: KATA_ROW.t, tense: true };                             // ㄸ
    case 5: return { row: KATA_ROW.r, tense: false };                            // ㄹ
    case 6: return { row: KATA_ROW.m, tense: false };                            // ㅁ
    case 7: return { row: isWordStart ? KATA_ROW.p : KATA_ROW.b, tense: false };  // ㅂ
    case 8: return { row: KATA_ROW.p, tense: true };                             // ㅃ
    case 9: return { row: KATA_ROW.s, tense: false };                            // ㅅ
    case 10: return { row: KATA_ROW.s, tense: true };                            // ㅆ
    case 11: return { row: KATA_ROW.vowel, tense: false };                       // ㅇ
    case 12: return { row: isWordStart ? KATA_ROW.ch : KATA_ROW.j, tense: false }; // ㅈ
    case 13: return { row: KATA_ROW.ch, tense: true };                           // ㅉ
    case 14: return { row: KATA_ROW.ch, tense: false };                          // ㅊ
    case 15: return { row: KATA_ROW.k, tense: false };                           // ㅋ
    case 16: return { row: KATA_ROW.t, tense: false };                           // ㅌ
    case 17: return { row: KATA_ROW.p, tense: false };                           // ㅍ
    default: return { row: KATA_ROW.h, tense: false };                           // ㅎ
  }
}

function composeKata(row, isVowelRow, base, glide) {
  if (!glide) return row[KATA_VOWEL_INDEX[base]];
  if (isVowelRow) {
    if (glide === 'y') return { a: 'ヤ', u: 'ユ', o: 'ヨ', e: 'イェ', i: row[1] }[base];
    return { a: 'ワ', i: 'ウィ', e: 'ウェ', o: 'ウォ', u: row[2] }[base]; // w
  }
  if (glide === 'y') return row[1] + ({ a: 'ャ', u: 'ュ', o: 'ョ', e: 'ェ', i: '' }[base]);
  return row[2] + ({ a: 'ァ', i: 'ィ', e: 'ェ', o: 'ォ', u: '' }[base]); // w
}

// Same nasalization rule as romanizeWord: a stop coda (ㄱ/ㄷ/ㅂ, here as
// their katakana-coda equivalents k/t/p) followed by a nasal-initial
// syllable (ㄴ/ㅁ) sounds nasalized — 합니다 sounds like "hamnida", so it
// should come out ハムニダ, not ハップニダ.
const KATA_NASAL_MAP = { k: 'ng', t: 'n', p: 'm' };

function hangulToKatakana(word) {
  const chars = Array.from(word);
  const syllables = chars.map(ch => (isHangulSyllable(ch) ? decomposeSyllable(ch) : null));

  let result = '';
  let isWordStart = true;
  for (let i = 0; i < chars.length; i++) {
    const syl = syllables[i];
    if (!syl) { result += chars[i]; isWordStart = true; continue; }

    const { row, tense } = kataRowFor(syl.initial, isWordStart);
    const { base, glide } = MEDIAL_TO_KATA[syl.medial];
    const kanaSyl = composeKata(row, syl.initial === 11, base, glide);

    let finalSound = RR_FINALS[syl.final];
    const next = syllables[i + 1];
    if (next && (next.initial === 2 || next.initial === 6) && KATA_NASAL_MAP[finalSound]) {
      finalSound = KATA_NASAL_MAP[finalSound];
    }
    result += (tense ? 'ッ' : '') + kanaSyl + KATA_CODA[finalSound];
    isWordStart = false;
  }
  return result;
}

/*
 * Korean lines split on whitespace (Korean writing already spaces words,
 * unlike Japanese, so no morphological analyzer is needed at all) with
 * the spaces kept as their own tokens so re-joining is lossless.
 */
