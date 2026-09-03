/* ---------------------------------------------------------------------
   DATA — loaded from words.json (same folder), or picked manually if
   fetch is blocked (e.g. opening this file directly via file://).
   Expected shape per entry:
     { word, pinyin, notones, translation, hsk, topic, type }
   Multi-character words are split into one syllable per character by
   splitting `pinyin` on whitespace (e.g. "mā ma"). If the syllable
   count doesn't match the character count, the whole word is treated
   as a single syllable instead of guessing a split.
--------------------------------------------------------------------- */
let WORDS = [];

const TONE_MAP = {
  "ā":["a",1],"á":["a",2],"ǎ":["a",3],"à":["a",4],
  "ē":["e",1],"é":["e",2],"ě":["e",3],"è":["e",4],
  "ī":["i",1],"í":["i",2],"ǐ":["i",3],"ì":["i",4],
  "ō":["o",1],"ó":["o",2],"ǒ":["o",3],"ò":["o",4],
  "ū":["u",1],"ú":["u",2],"ǔ":["u",3],"ù":["u",4],
  "ǖ":["ü",1],"ǘ":["ü",2],"ǚ":["ü",3],"ǜ":["ü",4],
};
function toneOfSyllable(syl){
  for(const ch of syl){ if(TONE_MAP[ch]) return TONE_MAP[ch][1]; }
  return 5; // neutral tone
}
function stripTone(syl){
  let out = "";
  for(const ch of syl){ out += TONE_MAP[ch] ? TONE_MAP[ch][0] : ch; }
  return out;
}
function baseCharOf(ch){
  return TONE_MAP[ch] ? TONE_MAP[ch][0] : ch.toLowerCase();
}

/* ---------------------------------------------------------------------
   Standard table of valid (toneless) Mandarin pinyin syllables. Most
   pinyin in the wild is written with no space between syllables in a
   word (e.g. "zěnme" for 怎么, not "zěn me"), so splitting on whitespace
   alone isn't enough to line up one syllable per character. This table
   lets splitConcatenatedPinyin() find the one valid way to cut a run of
   pinyin into exactly as many syllables as the word has characters.
--------------------------------------------------------------------- */
const VALID_SYLLABLES = new Set(`
a o e ai ei ao ou an en ang eng er
ba bo bai bei bao ban ben bang beng bi bie biao bian bin bing bu
pa po pai pei pao pou pan pen pang peng pi pie piao pian pin ping pu
ma mo me mai mei mao mou man men mang meng mi mie miao miu mian min ming mu
fa fo fei fou fan fen fang feng fu
da de dai dei dao dou dan den dang deng dong di die diao diu dian ding du duo dui duan dun
ta te tai tao tou tan tang teng tong ti tie tiao tian ting tu tuo tui tuan tun
na ne nai nei nao nou nan nen nang neng nong ni nie niao niu nian nin niang ning nu nuo nuan nun nv nve
la le lai lei lao lou lan lang leng long li lia lie liao liu lian lin liang ling lu luo luan lun lv lve
ga ge gai gei gao gou gan gen gang geng gong gu gua guo guai gui guan gun guang
ka ke kai kei kao kou kan ken kang keng kong ku kua kuo kuai kui kuan kun kuang
ha he hai hei hao hou han hen hang heng hong hu hua huo huai hui huan hun huang
ji jia jie jiao jiu jian jin jiang jing jiong ju jue juan jun
qi qia qie qiao qiu qian qin qiang qing qiong qu que quan qun
xi xia xie xiao xiu xian xin xiang xing xiong xu xue xuan xun
zha zhe zhi zhai zhei zhao zhou zhan zhen zhang zheng zhong zhu zhua zhuo zhuai zhui zhuan zhun zhuang
cha che chi chai chao chou chan chen chang cheng chong chu chua chuo chuai chui chuan chun chuang
sha she shi shai shei shao shou shan shen shang sheng shu shua shuo shuai shui shuan shun shuang
ra re ri rao rou ran ren rang reng rong ru rua ruo rui ruan run
za ze zi zai zei zao zou zan zen zang zeng zong zu zuo zui zuan zun
ca ce ci cai cao cou can cen cang ceng cong cu cuo cui cuan cun
sa se si sai sao sou san sen sang seng song su suo sui suan sun
ya ye yao you yan yang yin ying yong yi yu yue yuan yun yo
wa wo wai wei wan wang wen weng wu
`.trim().split(/\s+/));

/* Split a run of concatenated pinyin (no spaces) into `count` syllables,
   one per character. Works on the tone-marked string directly: matches
   are found on a toneless copy, then the same character offsets are cut
   out of the original tone-marked string, so tone marks are preserved. */
function splitConcatenatedPinyin(pinyinRaw, count){
  const raw = (pinyinRaw || "").trim();
  if(!raw || count < 1) return null;
  const chars = Array.from(raw);
  const baseStr = chars.map(baseCharOf).join('').toLowerCase();
  const n = baseStr.length;

  const memo = new Map();
  function solve(pos, k){
    if(pos === n) return k === 0 ? [] : null;
    if(k === 0) return null;
    const key = pos + '_' + k;
    if(memo.has(key)) return memo.get(key);
    let result = null;
    const maxLen = Math.min(6, n - pos);
    for(let L = maxLen; L >= 1; L--){
      if(n - (pos + L) < (k - 1)) continue; // not enough chars left for remaining syllables
      const cand = baseStr.substr(pos, L);
      if(VALID_SYLLABLES.has(cand)){
        const rest = solve(pos + L, k - 1);
        if(rest){ result = [L, ...rest]; break; }
      }
    }
    memo.set(key, result);
    return result;
  }

  const lens = solve(0, count);
  if(!lens) return null;
  const syllables = [];
  let idx = 0;
  for(const L of lens){
    syllables.push(chars.slice(idx, idx + L).join(''));
    idx += L;
  }
  return syllables;
}

function toEntry(raw){
  const chars = Array.from(raw.word || "");
  let syllables = (raw.pinyin || "").trim().split(/\s+/).filter(Boolean);
  if(syllables.length !== chars.length){
    // Pinyin wasn't space-separated per character — try to split the
    // concatenated pinyin into one valid syllable per character.
    const attempt = chars.length > 1 ? splitConcatenatedPinyin(raw.pinyin, chars.length) : null;
    // Fall back to treating the whole thing as one syllable only if
    // splitting genuinely isn't possible.
    syllables = attempt || [(raw.pinyin || "").trim()];
  }
  const entry = {
    word: raw.word || "",
    syllables,
    translation: raw.translation || "",
    topic: raw.topic || "other",
  };
  entry.tones = entry.syllables.map(toneOfSyllable);
  entry.toneless = entry.syllables.map(stripTone);
  return entry;
}


async function loadWords(){
  try{
    const res = await fetch('words.json');
    if(!res.ok) throw new Error('bad response');
    const raw = await res.json();
    onWordsLoaded(raw);
  }catch(e){
    document.getElementById('loadFallback').style.display = 'block';
  }
}
document.getElementById('fileInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const raw = JSON.parse(ev.target.result);
      onWordsLoaded(raw);
      document.getElementById('loadFallback').style.display = 'none';
    }catch(err){
      alert('That file could not be read as valid JSON.');
    }
  };
  reader.readAsText(file);
});

function onWordsLoaded(raw){
  WORDS = raw.map(toEntry).filter(w => w.word && w.syllables.length);
  els.startBtn.disabled = false;
  els.startBtn.textContent = 'Start practicing';
  buildTopicChips();
  updateSetupCount();
}

const TONE_DESCRIPTIONS = {
  1:"high &amp; flat — stays at the top the whole time",
  2:"rising — starts mid, climbs sharply to the top",
  3:"dipping — starts mid-low, dips to the bottom, then rises toward the top",
  4:"falling — starts at the top, drops sharply to the bottom",
  5:"neutral — a short tap, barely a mark",
};

/* ---------------------------------------------------------------------
   Theme
--------------------------------------------------------------------- */
function currentTheme(){ return document.documentElement.getAttribute('data-theme'); }
function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  renderThemeIcons();
}
function toggleTheme(){ setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
function sunSvg(){ return `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.6"/><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M10 1.5v2"/><path d="M10 16.5v2"/><path d="M18.5 10h-2"/><path d="M3.5 10h-2"/><path d="M15.6 4.4l-1.4 1.4"/><path d="M5.8 14.2l-1.4 1.4"/><path d="M15.6 15.6l-1.4-1.4"/><path d="M5.8 5.8L4.4 4.4"/></g></svg>`; }
function moonSvg(){ return `<svg viewBox="0 0 20 20" fill="none"><path d="M16.5 12.3A7 7 0 018 3.6a7 7 0 108.5 8.7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`; }
function renderThemeIcons(){
  const icon = currentTheme() === 'dark' ? sunSvg() : moonSvg();
  document.getElementById('themeToggleSetup').innerHTML = icon;
  document.getElementById('themeTogglePractice').innerHTML = icon;
}

/* ---------------------------------------------------------------------
   State
--------------------------------------------------------------------- */
let currentTopic = "all";
let selectedChipTopic = "all"; // provisional choice on setup screen
let currentWord = null;
let syllables = [];       // [{ base, tone }] for the current word
let currentIdx = 0;       // which syllable is being drawn right now
let results = [];         // per-syllable true/false/null for the current word
let awaitingAdvance = false; // true while drawing is briefly locked between syllables
let score = { correct:0, total:0 };
let lastWordIndex = -1;
let alwaysShowMeaning = false;
try{ alwaysShowMeaning = localStorage.getItem('toneDraw.alwaysShowMeaning') === '1'; }catch(e){}

const els = {
  topicChips: document.getElementById('topicChips'),
  setupCount: document.getElementById('setupCount'),
  startBtn: document.getElementById('startBtn'),
  alwaysMeaningToggle: document.getElementById('alwaysMeaningToggle'),
  topicPillBtn: document.getElementById('topicPillBtn'),
  topicPillLabel: document.getElementById('topicPillLabel'),
  hanzi: document.getElementById('hanzi'),
  pinyinToneless: document.getElementById('pinyinToneless'),
  meaning: document.getElementById('meaning'),
  clearBtn: document.getElementById('clearBtn'),
  checkBtn: document.getElementById('checkBtn'),
  nextBtn: document.getElementById('nextBtn'),
  feedbackLine: document.getElementById('feedbackLine'),
  scoreVal: document.getElementById('scoreVal'),
  refBtn: document.getElementById('refBtn'),
  modalBackdrop: document.getElementById('modalBackdrop'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  shapeList: document.getElementById('shapeList'),
  setupSection: document.getElementById('setup'),
  practiceSection: document.getElementById('practice'),
  resultStamp: document.getElementById('resultStamp'),
};

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------------------------------------------------------------
   Setup screen: topic chips
--------------------------------------------------------------------- */
function topicLabel(t){ return t === 'all' ? 'All topics' : t.charAt(0).toUpperCase() + t.slice(1); }
function poolForTopic(t){ return t === "all" ? WORDS : WORDS.filter(w=>w.topic===t); }

function buildTopicChips(){
  const topics = ["all", ...Array.from(new Set(WORDS.map(w=>w.topic))).sort()];
  els.topicChips.innerHTML = '';
  topics.forEach(t=>{
    const btn = document.createElement('button');
    btn.className = 'chip' + (t === selectedChipTopic ? ' selected' : '');
    btn.textContent = topicLabel(t);
    btn.addEventListener('click', ()=>{
      selectedChipTopic = t;
      buildTopicChips();
      updateSetupCount();
    });
    els.topicChips.appendChild(btn);
  });
}
function updateSetupCount(){
  const n = poolForTopic(selectedChipTopic).length;
  els.setupCount.textContent = `${n} word${n===1?'':'s'} in this set`;
}

/* ---------------------------------------------------------------------
   Preference: always show the meaning/translation, not just after a
   word is fully checked.
--------------------------------------------------------------------- */
function renderAlwaysMeaningToggle(){
  els.alwaysMeaningToggle.classList.toggle('on', alwaysShowMeaning);
  els.alwaysMeaningToggle.setAttribute('aria-checked', String(alwaysShowMeaning));
}
function setAlwaysShowMeaning(v){
  alwaysShowMeaning = v;
  try{ localStorage.setItem('toneDraw.alwaysShowMeaning', v ? '1' : '0'); }catch(e){}
  renderAlwaysMeaningToggle();
  updateMeaningVisibility();
}
function updateMeaningVisibility(){
  if(!currentWord) return;
  const wordFullyChecked = results.length > 0 && results.every(r => r !== null);
  if(alwaysShowMeaning || wordFullyChecked) els.meaning.classList.add('show');
  else els.meaning.classList.remove('show');
}

/* ---------------------------------------------------------------------
   Reference modal content
--------------------------------------------------------------------- */
function toneContourSvg(tone){
  const pathByTone = {
    1: "M6,14 L58,14",
    2: "M6,42 C22,30 34,14 58,6",
    3: "M6,20 C22,42 34,42 58,10",
    4: "M6,6 C22,20 34,40 58,44",
    5: "M20,34 L34,34",
  };
  return `<svg class="contour" viewBox="0 0 64 50" width="60" height="48" fill="none">
    <line x1="6" y1="6" x2="58" y2="6" stroke="var(--border)" stroke-dasharray="2 3"/>
    <line x1="6" y1="44" x2="58" y2="44" stroke="var(--border)" stroke-dasharray="2 3"/>
    <path d="${pathByTone[tone]}" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
function buildShapeReference(){
  els.shapeList.innerHTML = [1,2,3,4,5].map(t=>`
    <div class="shape-row">
      ${toneContourSvg(t)}
      <div class="t-num">${t}</div>
      <div class="t-desc">${TONE_DESCRIPTIONS[t]}</div>
    </div>
  `).join('');
}

/* ---------------------------------------------------------------------
   Word selection + rendering
--------------------------------------------------------------------- */
function pickWord(){
  const pool = poolForTopic(currentTopic);
  if(pool.length === 0) return null;
  if(pool.length === 1) return pool[0];
  let idx;
  do { idx = Math.floor(Math.random()*pool.length); } while(idx === lastWordIndex);
  lastWordIndex = idx;
  return pool[idx];
}

function renderWord(w){
  if(!w){
    currentWord = null;
    els.hanzi.innerHTML = '—';
    els.pinyinToneless.textContent = '';
    els.meaning.textContent = 'No words in this topic.';
    els.meaning.classList.add('show');
    els.checkBtn.disabled = true;
    els.clearBtn.disabled = true;
    return;
  }

  currentWord = w;
  syllables = w.syllables.map((syl,i)=>({ base: w.toneless[i], tone: w.tones[i] }));
  currentIdx = 0;
  results = new Array(syllables.length).fill(null);
  awaitingAdvance = false;

  els.meaning.textContent = w.translation;
  els.pinyinToneless.textContent = w.toneless.join(' ');
  els.checkBtn.disabled = false;
  els.clearBtn.disabled = false;

  renderHanziRow();
  updateMeaningVisibility();
  els.feedbackLine.textContent = syllables.length > 1
    ? 'Draw the pitch for the highlighted character, then check.'
    : 'Draw the pitch, then check.';
  els.feedbackLine.className = 'feedback-line';

  resetPad();
}

function renderHanziRow(){
  const chars = Array.from(currentWord.word);
  els.hanzi.innerHTML = chars.map((c,i)=>{
    let cls = 'hz';
    if(results[i] === true) cls += ' right';
    else if(results[i] === false) cls += ' wrong';
    else if(i === currentIdx) cls += ' current';
    return `<span class="${cls}">${escapeHtml(c)}</span>`;
  }).join('');
}

function nextWord(){ renderWord(pickWord()); }

/* ---------------------------------------------------------------------
   Canvas drawing (single reusable pad — pointer events work for touch + mouse)
--------------------------------------------------------------------- */
const canvas = document.getElementById('canvas');
const pad = { canvas, ctx: null, points: [] };

function setupCanvas(){
  function resize(){
    const rect = canvas.getBoundingClientRect();
    // While the practice screen is display:none the canvas has zero size —
    // skip so we never lock the drawing buffer in at 1x1px.
    if(rect.width < 2 || rect.height < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    pad.ctx = canvas.getContext('2d');
    pad.ctx.setTransform(dpr,0,0,dpr,0,0);
    redraw();
  }
  pad.resize = resize;

  if(window.ResizeObserver){
    new ResizeObserver(resize).observe(canvas);
  }else{
    window.addEventListener('resize', resize);
  }
  resize();

  let drawing = false;
  function toLocal(e){
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  canvas.addEventListener('pointerdown', e=>{
    if(awaitingAdvance || els.checkBtn.disabled) return;
    drawing = true;
    pad.points = [];
    canvas.setPointerCapture(e.pointerId);
    pad.points.push(toLocal(e));
    redraw();
  });
  canvas.addEventListener('pointermove', e=>{
    if(!drawing || awaitingAdvance) return;
    pad.points.push(toLocal(e));
    redraw();
  });
  function end(){ drawing = false; }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', ()=>{ drawing = false; });
}

function drawGuides(){
  const ctx = pad.ctx;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  ctx.clearRect(0,0,w,h);
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--guide-line').trim();
  ctx.lineWidth = 1;
  ctx.setLineDash([3,4]);
  for(let level=1; level<=5; level++){
    const y = h - (level-1)/4 * (h-16) - 8;
    ctx.beginPath();
    ctx.moveTo(8,y);
    ctx.lineTo(w-8,y);
    ctx.stroke();
  }
  ctx.restore();
}

function redraw(){
  drawGuides();
  if(pad.points.length < 2) return;
  const ctx = pad.ctx;
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--stroke').trim();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pad.points.forEach((p,i)=>{
    if(i===0) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);
  });
  ctx.stroke();
  ctx.restore();
}

function resetPad(){
  pad.points = [];
  if(pad.ctx) drawGuides();
  hideStamp();
}

function showStamp(isRight){
  els.resultStamp.innerHTML = isRight ? CHECK_ICON : CROSS_ICON;
  els.resultStamp.className = 'result-stamp show ' + (isRight ? 'correct' : 'wrong');
}
function hideStamp(){
  els.resultStamp.className = 'result-stamp';
  els.resultStamp.innerHTML = '';
}

/* ---------------------------------------------------------------------
   Grading: turn a drawn stroke into a guessed tone (1-4), or 5 for a
   short tap/dot (no tone mark = neutral). Ruling out "dip" and "flat"
   first — before ever looking at rise/fall — is what keeps tone 1
   (a level line) from being missed just because of hand jitter.
--------------------------------------------------------------------- */
function classifyStroke(){
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const pts = pad.points;
  if(pts.length < 2) return 5;

  const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpanPx = Math.max(...ys) - Math.min(...ys);

  // A short tap/dot with little movement = no tone mark = neutral tone.
  if(xSpan < w*0.22 && ySpanPx < h*0.22) return 5;

  // Normalize pitch: 0 = bottom of pad, 1 = top of pad.
  const pitch = pts.map(p => 1 - Math.min(1, Math.max(0, p.y / h)));
  const n = pitch.length;
  const segN = Math.max(1, Math.round(n * 0.28)); // wide sampling windows smooth out hand tremor
  const avg = arr => arr.reduce((a,b)=>a+b,0) / arr.length;

  const start = avg(pitch.slice(0, segN));
  const end   = avg(pitch.slice(n - segN));
  const midLo = Math.floor(n * 0.35), midHi = Math.ceil(n * 0.65);
  const midSlice = pitch.slice(midLo, midHi);
  const mid = avg(midSlice.length ? midSlice : [pitch[Math.floor(n/2)]]);

  const rise  = end - start;
  const dip   = (start + end) / 2 - mid;                          // positive => valley in the middle
  const range = Math.max(start, mid, end) - Math.min(start, mid, end);

  const DIP_T  = 0.10;
  const FLAT_T = 0.13;
  const EDGE_T = 0.06;

  // Dipping shape, clearly lower in the middle than at both ends -> tone 3
  if(dip > DIP_T && (start - mid) > EDGE_T && (end - mid) > EDGE_T){
    return 3;
  }
  // Level shape: little net rise and little overall spread -> tone 1
  if(Math.abs(rise) < FLAT_T && range < FLAT_T){
    return 1;
  }
  // Otherwise it's clearly heading one way or the other.
  return rise > 0 ? 2 : 4;
}

const CHECK_ICON = `<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2l2.3 2.3L9.5 3.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CROSS_ICON = `<svg viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

/* ---------------------------------------------------------------------
   Controls
--------------------------------------------------------------------- */
function checkCurrent(){
  if(awaitingAdvance || !currentWord) return;

  if(pad.points.length === 0){
    els.feedbackLine.textContent = 'Draw a tone mark first.';
    els.feedbackLine.className = 'feedback-line';
    return;
  }

  const guess = classifyStroke();
  const correctTone = syllables[currentIdx].tone;
  const isRight = guess === correctTone;

  results[currentIdx] = isRight;
  score.total++;
  if(isRight) score.correct++;
  els.scoreVal.textContent = `${score.correct}/${score.total}`;

  const isLast = currentIdx === syllables.length - 1;

  if(isLast){
    // Word is done — show the stamp, lock the pad, reveal the toned
    // pinyin in place of the toneless prompt, and wait for Next.
    showStamp(isRight);
    renderHanziRow();
    els.pinyinToneless.textContent = currentWord.syllables.join(' ');
    els.feedbackLine.textContent = (isRight
      ? `Correct — tone ${correctTone}.`
      : `That read as tone ${guess}. Correct tone is ${correctTone}.`) + '  Tap Next for another word.';
    els.feedbackLine.className = 'feedback-line ' + (isRight ? 'correct-all' : 'wrong-some');

    awaitingAdvance = true;
    els.checkBtn.disabled = true;
    els.clearBtn.disabled = true;
    updateMeaningVisibility();
  }else{
    // Not the last character — grade it, then immediately clear the pad
    // and move on to the next character in this word.
    currentIdx++;
    resetPad();
    renderHanziRow();

    els.feedbackLine.textContent = (isRight
      ? `Correct — tone ${correctTone}.`
      : `That read as tone ${guess}. Correct tone is ${correctTone}.`) + '  Draw the next one.';
    els.feedbackLine.className = 'feedback-line ' + (isRight ? 'correct-all' : 'wrong-some');
  }
}

/* ---------------------------------------------------------------------
   Screen transitions
--------------------------------------------------------------------- */
function goToPractice(){
  currentTopic = selectedChipTopic;
  els.topicPillLabel.textContent = topicLabel(currentTopic);
  lastWordIndex = -1;
  els.setupSection.style.display = 'none';
  els.practiceSection.style.display = 'block';
  if(pad.resize) requestAnimationFrame(pad.resize);
  nextWord();
}
function goToSetup(){
  selectedChipTopic = currentTopic;
  buildTopicChips();
  updateSetupCount();
  els.practiceSection.style.display = 'none';
  els.setupSection.style.display = 'flex';
}

/* ---------------------------------------------------------------------
   Wire up
--------------------------------------------------------------------- */
renderThemeIcons();
renderAlwaysMeaningToggle();
buildShapeReference();
setupCanvas();
loadWords();

els.alwaysMeaningToggle.addEventListener('click', ()=> setAlwaysShowMeaning(!alwaysShowMeaning));
document.getElementById('themeToggleSetup').addEventListener('click', toggleTheme);
document.getElementById('themeTogglePractice').addEventListener('click', toggleTheme);
els.startBtn.addEventListener('click', goToPractice);
els.topicPillBtn.addEventListener('click', goToSetup);
els.nextBtn.addEventListener('click', nextWord);
els.clearBtn.addEventListener('click', ()=>{
  if(awaitingAdvance) return;
  resetPad();
});
els.checkBtn.addEventListener('click', checkCurrent);
els.refBtn.addEventListener('click', ()=> els.modalBackdrop.classList.add('open'));
els.modalCloseBtn.addEventListener('click', ()=> els.modalBackdrop.classList.remove('open'));
els.modalBackdrop.addEventListener('click', e=>{ if(e.target === els.modalBackdrop) els.modalBackdrop.classList.remove('open'); });