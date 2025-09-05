// shared helpers (exact behavior preserved)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
const uniq = (a) => [...new Set(a)];
const looksHttp = (u) => /^https?:\/\//i.test(u || "");

// tokenization stopwords (used in images module)
const STOP = new Set([
  "the","a","an","and","or","for","with","of","to","in","by","on",
  "this","that","from","at","is","are","be","it","you","your","our",
  "men","womens","women","woman","man","mens","girls","boys","unisex",
  "size","sizes","new","sale","now","off","deal","shop","buy","add",
  "color","colours","colour","colors","black","white","red","blue","green","grey","gray","beige","brown",
  "us","uk","eu"
]);
const tokenize = (s) => T(s)
  .toLowerCase()
  .replace(/[|\-–—_:/,(){}$+@™®©%^*<>]/g," ")
  .replace(/\s+/g," ")
  .split(" ")
  .filter(w => w && !STOP.has(w) && !/^\d+$/.test(w));

Object.assign(globalThis, { sleep, T, uniq, looksHttp, STOP, tokenize });