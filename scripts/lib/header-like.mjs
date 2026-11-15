// Whether a line holds a comment (`--` or `/*`, anywhere on the line) whose first one to
// three words end in a colon: the shape of a control file's header line, misspelt or not
// (`scripts/controls.mjs` refuses one below the header). A word is a run of anything but
// whitespace and colons; words are separated by spaces or tabs.
//
// Keep it a scan. As one regex, `(?:--|\/\*)\s*[^\s:]+(?:[ \t]+[^\s:]+){0,2}\s*:`, it
// backtracked on a line of dashes, its time growing with the square of the line's length
// (IS #348's PR); `header-like.test.mjs` holds that regex as its oracle and compares the
// two on every short line over two small alphabets.
//
// The lookahead and backreference make each word atomic. When an opener fails, the next
// openers are skipped while their words would start inside its first word, up to and
// including that word's last character: they meet a suffix of the word and the same words
// after it, so they fail too. An opener whose words start right after the word can meet
// different words, so the search resumes at the first such opener (`firstWordEnd - 2`).
const WORDS = /\s*(?=([^\s:]+))\1(?:[ \t]+(?=([^\s:]+))\2){0,2}\s*:/y;
const FIRST_WORD = /\s*[^\s:]*/y;
const OPENER = /--|\/\*/g;

export function headerLike(line) {
  OPENER.lastIndex = 0;
  for (let m = OPENER.exec(line); m !== null; m = OPENER.exec(line)) {
    const wordsStart = m.index + 2;
    WORDS.lastIndex = wordsStart;
    if (WORDS.test(line)) return true;
    FIRST_WORD.lastIndex = wordsStart;
    const firstWordEnd = wordsStart + FIRST_WORD.exec(line)[0].length;
    OPENER.lastIndex = Math.max(m.index + 1, firstWordEnd - 2);
  }
  return false;
}
