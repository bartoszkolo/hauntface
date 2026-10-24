// =====================================================================
//  HAUNTFACE — konfiguracja
// =====================================================================
const DESKTOP = window.hauntDesktop || null;   // aplikacja Electron (preload)
const STATIC_DEMO = !!window.HAUNTFACE_STATIC; // demo na stronie internetowej

const DEFAULTS = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('pl') ? 'pl' : 'en',
  look: 'reaper', theme: 'fire', ambient: 0.7, candle: 1.2, quality: '0.75', volume: 0.9,
  ambientSound: true, servo: true, auto: true, doze: true, camera: false, camInvert: false, bell: true, riddles: true, family: false,
  stt: 'whisper', whisperUrl: 'https://api.openai.com/v1/audio/transcriptions', whisperModel: 'whisper-1', threshold: 0.03,
  llm: 'nvidia', nvidiaModel: 'nvidia/nemotron-3.5-lightning-30b-a3b', model: 'claude-opus-5-5',
  persona: '', personaWitch: '', // puste = domyślna osobowość dla wybranego języka
  tts: 'openai', voice: 'onyx', voiceWitch: 'shimmer', pitch: 0.85,
  remote: false, aiOn: true,
};
// dozwolone wartości pól wyboru — chroni przed zepsutymi/starymi ustawieniami
const CHOICES = {
  lang: LANGS, look: ['reaper', 'skull', 'witch'], theme: ['fire', 'ghost', 'ice', 'blood', 'void'], quality: ['0.5', '0.75', '1'],
  stt: ['whisper', 'webspeech'], llm: ['nvidia', 'anthropic'], model: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], tts: ['openai', 'browser'],
};
const STORE = 'hauntface-config';
const cfg = { ...DEFAULTS };
const legacyKeys = {}; // klucze z wersji prototypowej (twarz.html) — przenoszone do bezpiecznego magazynu
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved) Object.assign(cfg, saved);
  else {
    const old = JSON.parse(localStorage.getItem('halloween-face-v3') || '{}');
    for (const k of ['look', 'theme', 'volume', 'camera', 'camInvert', 'stt', 'threshold', 'tts', 'voice', 'voiceWitch', 'pitch', 'llm', 'model', 'nvidiaModel'])
      if (old[k] != null) cfg[k] = old[k];
    if (old.openaiKey) legacyKeys.openai = old.openaiKey;
    if (old.anthropicKey) legacyKeys.anthropic = old.anthropicKey;
    if (old.nvidiaKey) legacyKeys.nvidia = old.nvidiaKey;
    for (const k of ['halloween-face', 'halloween-face-v2', 'halloween-face-v3']) localStorage.removeItem(k);
  }
} catch {}
function validateCfg() {
  for (const [k, list] of Object.entries(CHOICES)) if (!list.includes(String(cfg[k]))) cfg[k] = DEFAULTS[k];
  for (const k of ['ambient', 'candle', 'volume', 'pitch']) if (!Number.isFinite(+cfg[k])) cfg[k] = DEFAULTS[k];
  if (!(+cfg.threshold >= 0.005)) cfg.threshold = DEFAULTS.threshold;
  if (cfg.nvidiaModel === 'z-ai/glm-5.3-flash' || !cfg.nvidiaModel) cfg.nvidiaModel = DEFAULTS.nvidiaModel; // GLM odpowiadał ~70 s
  if (DESKTOP && cfg.stt === 'webspeech') cfg.stt = 'whisper'; // Web Speech nie działa w Electronie
}
validateCfg();
function saveCfg() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch {} }

const tx = () => L[cfg.lang] || L.en; // teksty w bieżącym języku
const isWitch = () => cfg.look === 'witch';
const charKey = () => (isWitch() ? 'witch' : 'skull');
const persona = () => (isWitch() ? cfg.personaWitch : cfg.persona) || tx().persona[charKey()];
const lines = () => tx().lines[charKey()];
// punkty charakterystyczne postaci (w układzie głowy) dla efektów 2D
const CHARS = {
  witch: { eyes: [-.21, .21], eyeY: .11, eyeZ: .62, fire: false, mouth: [0, -.47, .58], tearY: .03, tearZ: .66, origins: [[0, -.47, .6], [-.3, .6, .5], [.3, .6, .5]] },
  skull: { eyes: [-.30, .30], eyeY: -.06, eyeZ: .55, fire: true, mouth: [0, -.72, .5], tearY: -.16, tearZ: .62, origins: [[-.30, -.04, .55], [.30, -.04, .55], [0, -.74, .5]] },
};
const CHAR = () => CHARS[charKey()];

const THEMES = {
  fire:  ['#ff3d0a', '#ffc23a'], ghost: ['#19ff66', '#dcffd0'], ice: ['#2f8cff', '#d6f2ff'],
  blood: ['#ff0018', '#ff8a70'], void: ['#9a3cff', '#f2c8ff'],
};
const THEME_KEYS = Object.keys(THEMES);
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`; };
const lin = h => hexRgb(h).map(v => Math.pow(v / 255, 2.2));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clock = () => performance.now() / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// =====================================================================
//  WEBGL
// =====================================================================
const GLC = document.getElementById('gl');
const gl = GLC.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
let prog, U = {};
function initGL() {
  if (!gl) return false;
  const vs = `#version 300 es
    void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  VS = mk(gl.VERTEX_SHADER, vs);
  gl.bindVertexArray(gl.createVertexArray());
  startProgram(isWitch());
  if (PAR) startProgram(!isWitch()); // druga postać kompiluje się w tle
  return true;
}
// Każda postać ma własny shader. Kompilacja dużego shadera na Windows trwa nawet kilkanaście sekund
// (za pierwszym razem — potem przeglądarka trzyma go w pamięci), więc robimy ją w tle, bez zamrażania strony.
let VS, PROGS = {};
const PAR = gl && gl.getExtension('KHR_parallel_shader_compile');
const UNIFORMS = ['uRes', 'uTime', 'uRot', 'uPos', 'uJaw', 'uGaze', 'uFire', 'uC1', 'uC2', 'uAmb', 'uCandle', 'uFlash', 'uFlashDir', 'uHood', 'uGlitch', 'uRed', 'uChar', 'uBlink'];
function startProgram(witch) {
  const key = witch ? 'w' : 's';
  if (PROGS[key]) return PROGS[key];
  const src = document.getElementById('frag').textContent.replace('#version 300 es', '#version 300 es\n#define WITCH ' + (witch ? 1 : 0));
  const fs = gl.createShader(gl.FRAGMENT_SHADER); gl.shaderSource(fs, src); gl.compileShader(fs);
  const pr = gl.createProgram(); gl.attachShader(pr, VS); gl.attachShader(pr, fs); gl.linkProgram(pr);
  return PROGS[key] = { pr, fs, ready: false, failed: false, u: null };
}
function programReady(P) {
  if (!P || P.failed) return false;
  if (P.ready) return true;
  if (PAR && !gl.getProgramParameter(P.pr, PAR.COMPLETION_STATUS_KHR)) return false;
  if (!gl.getProgramParameter(P.pr, gl.LINK_STATUS)) {
    P.failed = true; S.lastText = '⚠ Shader: ' + (gl.getShaderInfoLog(P.fs) || gl.getProgramInfoLog(P.pr)); document.body.classList.remove('nodebug'); return false;
  }
  P.u = {}; for (const n of UNIFORMS) P.u[n] = gl.getUniformLocation(P.pr, n);
  return P.ready = true;
}
let loadingGL = true;
function pickProgram() { // chcemy shader bieżącej postaci; dopóki się kompiluje, rysujemy poprzedni (albo nic)
  const want = startProgram(isWitch());
  const P = programReady(want) ? want : [PROGS.s, PROGS.w].find(x => x && x.ready);
  loadingGL = !want.ready && !want.failed;
  if (P && prog !== P.pr) { prog = P.pr; U = P.u; gl.useProgram(prog); }
  return !!P && P.ready && (P === want || !isWitch() === (P === PROGS.s));
}

// kamera — te same liczby co w shaderze, żeby rzutować punkty 3D na ekran (ogień, łzy, dym)
const CAM = [0, 0, 3.6], TARGET = [0, -.14, 0], FOC = 2.6;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const CF = norm(sub(TARGET, CAM)), CR = norm(cross(CF, [0, 1, 0])), CU = cross(CR, CF);

function rotMat(yaw, pitch, roll) { // R = Ry * Rx * Rz (wiersze)
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const mul = (A, B) => { const C = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C; };
  return mul(mul([cy, 0, sy, 0, 1, 0, -sy, 0, cy], [1, 0, 0, 0, cp, -sp, 0, sp, cp]), [cr, -sr, 0, sr, cr, 0, 0, 0, 1]);
}
const mulMV = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
let ROT = rotMat(0, 0, 0), POS = [0, 0, 0];
function project(local) { // punkt w układzie czaszki -> piksele nakładki
  const w = mulMV(ROT, local).map((v, i) => v + POS[i]), v = sub(w, CAM);
  const z = dot(v, CF), ux = dot(v, CR) / z * FOC, uy = dot(v, CU) / z * FOC;
  return { x: (ux * OH + OW) / 2, y: OH - (uy * OH + OH) / 2, s: OH / 2 * FOC / z };
}
const facing = () => mulMV(ROT, [0, 0, 1])[2]; // ile twarz patrzy w kamerę
// widoczność oka: dalsze oko gaśnie, gdy głowa się odwraca
const eyeVis = x => clamp((facing() - .45) / .4, 0, 1) * (Math.sign(x) === Math.sign(HEAD.yaw) ? clamp(1 - Math.abs(HEAD.yaw) * 2.2, 0, 1) : 1);

// =====================================================================
//  NAKŁADKA 2D: ogień, iskry, mgła, dym, łzy
// =====================================================================
const FX = document.getElementById('fx'), ctx = FX.getContext('2d');
let OW = 0, OH = 0, DPR = 1, renderScale = .75, SPR = {}, SPR_P = {};
function sprite(stops, size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size); return c;
}
function buildSprites() {
  const make = (a, b) => ({
    hot: sprite([[0, 'rgba(255,255,255,1)'], [.25, rgba(b, .9)], [.6, rgba(a, .35)], [1, rgba(a, 0)]]),
    mid: sprite([[0, rgba(b, .9)], [.35, rgba(a, .6)], [1, rgba(a, 0)]]),
    cool: sprite([[0, rgba(a, .7)], [.5, rgba(a, .25)], [1, rgba(a, 0)]]), c1: a, c2: b,
  });
  const [e, e2] = THEMES[cfg.theme] || THEMES.fire;
  SPR = make(e, e2); SPR_P = make('#7dff2a', '#f4ffd0');
  SPR.fog = sprite([[0, 'rgba(150,158,170,.9)'], [.5, 'rgba(120,128,140,.35)'], [1, 'rgba(100,110,120,0)']], 128);
  SPR.smoke = sprite([[0, 'rgba(120,115,110,.8)'], [.6, 'rgba(90,85,80,.25)'], [1, 'rgba(80,80,80,0)']], 64);
}
function resize() {
  DPR = Math.min(1.5, devicePixelRatio || 1);
  OW = FX.width = Math.floor(innerWidth * DPR); OH = FX.height = Math.floor(innerHeight * DPR);
  resizeGL();
  fog.length = 0;
  for (let i = 0; i < 18; i++) fog.push({ x: rand(0, OW), y: OH * rand(.86, 1.12), r: rand(220, 480) * DPR, vx: rand(-14, 14) * DPR, a: rand(.012, .03) });
}
function resizeGL() {
  GLC.width = Math.max(64, Math.floor(innerWidth * DPR * renderScale)); GLC.height = Math.max(64, Math.floor(innerHeight * DPR * renderScale));
  if (gl) gl.viewport(0, 0, GLC.width, GLC.height);
}
addEventListener('resize', resize);

// =====================================================================
//  STAN
// =====================================================================
const S = {
  mode: 'sleep', eyesOn: true, micOn: true, dozing: false, fire: .12, flare: 0, mouth: 0,
  gazeX: 0, gazeY: 0, gazeTX: 0, gazeTY: 0, nextSaccade: 0, fastLookUntil: 0, asideUntil: 0,
  scareUntil: 0, glitchUntil: 0, chatterUntil: 0, flickerUntil: 0, flashes: [], flashDir: [1, .6, .5], nextBeat: 0,
  exStart: -99, exDir: 1, lid: 0, blinkT: -9, nextBlink: 2, twitchUntil: 0, nextAuto: clock() + 20, lastActivity: clock(), level: 0, lastText: '', spawnAcc: [0, 0],
};
const HEAD = { yaw: 0, pitch: .25, roll: 0, vy: 0, vp: 0, vr: 0, z: 0, nextLook: 0, lookYaw: 0, lookPitch: 0 };
const flames = [], embers = [], fog = [], smoke = [], tears = [], spiders = [], ghosts = [], cracks = [];
let lastToll = -1;
const setMode = m => { S.mode = m; if (m !== 'idle' && m !== 'sleep') activity(); };
function activity() { S.lastActivity = clock(); if (S.dozing) { S.dozing = false; S.flare = 1; if (ac) whoosh(); } }
let ttsAnalyser = null, ttsBuf = null, browserSpeaking = false;

// =====================================================================
//  AKTUALIZACJA: animatronika
// =====================================================================
function update(dt) {
  const T = clock(), scare = T < S.scareUntil, glitch = T < S.glitchUntil, chatter = T < S.chatterUntil;
  if (cfg.doze && !S.dozing && S.mode === 'idle' && T - S.lastActivity > 120) S.dozing = true;
  const asleep = S.mode === 'sleep' || S.dozing;

  // --- ogień w oczach ---
  let target = asleep ? .1 : ({ idle: .55, listening: 1, thinking: .7, speaking: .78 }[S.mode] ?? .5);
  if (S.mode === 'thinking') target *= .75 + .25 * Math.sin(T * 5);
  if (S.mode === 'speaking') target += S.mouth * .45;
  if (!S.eyesOn) target = 0;
  target += S.flare * 1.3; S.flare *= Math.exp(-dt * 1.8);
  if (scare) target = 2.4; else if (glitch) target = 1.3;
  S.fire += (target - S.fire) * (1 - Math.exp(-dt * (target > S.fire ? 6 : 1.4)));
  if (ac) {
    fireGain.gain.setTargetAtTime(Math.min(.14, S.fire * .055), ac.currentTime, .15);
    if (S.mode !== 'listening' && Math.random() < S.fire * dt * 7) crackle(); // nie zagłuszaj mikrofonu
  }

  // --- oczy (źrenice) ---
  const camOn = cam.active && T - cam.lastMotion < 1.6;
  if (camOn) { S.gazeTX = (cfg.camInvert ? 1 : -1) * (cam.x - .5) * 2.2; S.gazeTY = -(cam.y - .5) * 1.4; }
  else if (T > S.nextSaccade) {
    const focus = S.mode === 'listening' || S.mode === 'speaking', fast = T < S.fastLookUntil;
    S.gazeTX = focus ? rand(-.15, .15) : rand(-1, 1); S.gazeTY = focus ? rand(-.1, .15) : rand(-.6, .6);
    S.nextSaccade = T + (fast ? rand(.15, .35) : focus ? rand(1.2, 3) : rand(.7, 3.2));
  }
  if (S.mode === 'thinking') { S.gazeTX = Math.cos(T * 2.2) * .8; S.gazeTY = .6 + Math.sin(T * 2.2) * .2; }
  if (T < S.asideUntil) { S.gazeTX = 1; S.gazeTY = -.2; }
  if (glitch) { S.gazeTX = rand(-1, 1); S.gazeTY = rand(-1, 1); }
  const gk = 1 - Math.exp(-dt * 16);
  S.gazeX += (S.gazeTX - S.gazeX) * gk; S.gazeY += (S.gazeTY - S.gazeY) * gk;

  // --- szczęka ---
  let m = 0;
  if (ttsAnalyser) { ttsAnalyser.getFloatTimeDomainData(ttsBuf); let s = 0; for (const x of ttsBuf) s += x * x; m = Math.min(1, Math.sqrt(s / ttsBuf.length) * 6); }
  else if (browserSpeaking) m = .12 + .55 * Math.abs(Math.sin(T * 17) * Math.sin(T * 6.3));
  if (chatter) m = Math.sin(T * 2 * Math.PI * 9) > 0 ? .3 : 0;
  if (glitch && Math.random() < .2) m = rand(0, .9);
  if (scare) m = 1;
  S.mouth += (m - S.mouth) * (1 - Math.exp(-dt * (chatter ? 60 : 28)));

  // --- głowa: cele dla "serw" ---
  if (T > HEAD.nextLook) { HEAD.lookYaw = rand(-.32, .32); HEAD.lookPitch = rand(-.08, .08); HEAD.nextLook = T + rand(2.5, 7); }
  let ty = HEAD.lookYaw, tp = HEAD.lookPitch, tr = Math.sin(T * .3) * .03;
  if (camOn) { ty = (cfg.camInvert ? 1 : -1) * (cam.x - .5) * 1.0; tp = (cam.y - .5) * .4; }
  if (S.mode === 'listening') { tr = .12; ty *= .4; tp = -.04; }
  if (S.mode === 'speaking') { ty *= .5; tp = -.02 - S.mouth * .07; }
  if (S.mode === 'thinking') { tr = -.07; tp = -.1; ty = .15; }
  if (T < S.asideUntil) { ty = .45; tr = .1; }
  if (asleep) { ty = .05; tp = .32; tr = .08; }
  const ex = T - S.exStart; // egzorcysta: obrót skokami
  if (ex < 2.9) { ty = (ex < 1.4 ? 1.35 * Math.min(7, Math.floor(ex / .2) + 1) / 7 : ex < 2.1 ? 1.35 : 0) * S.exDir; tp = -.05; tr = ex < 2.1 ? .15 : 0; }
  if (T < S.twitchUntil && Math.random() < .12) { HEAD.vy += rand(-9, 9); HEAD.vr += rand(-7, 7); }
  if (glitch) { ty += rand(-.3, .3); tr += rand(-.25, .25); }
  if (scare) { tp = -.12; ty = 0; tr = 0; }
  // sprężyna z lekkim przestrzeleniem — wygląda jak serwo
  const spring = (x, v, t, k, c) => v + (k * (t - x) - c * v) * dt;
  const k = scare || ex < 2.9 ? 160 : 38, c = 2 * Math.sqrt(k) * .62;
  HEAD.vy = clamp(spring(HEAD.yaw, HEAD.vy, ty, k, c), -7, 7);
  HEAD.vp = clamp(spring(HEAD.pitch, HEAD.vp, tp, k, c), -5, 5);
  HEAD.vr = clamp(spring(HEAD.roll, HEAD.vr, tr, k, c), -5, 5);
  HEAD.yaw += HEAD.vy * dt; HEAD.pitch += HEAD.vp * dt; HEAD.roll += HEAD.vr * dt;
  const tz = scare ? .95 : 0;
  HEAD.z += (tz - HEAD.z) * (1 - Math.exp(-dt * (scare ? 16 : 3)));
  const speed = Math.abs(HEAD.vy) + Math.abs(HEAD.vp) + Math.abs(HEAD.vr);
  if (ac) {
    servoGain.gain.setTargetAtTime(cfg.servo ? Math.min(.05, Math.max(0, speed - .08) * .035) : 0, ac.currentTime, .03);
    servoOsc.frequency.setTargetAtTime(110 + speed * 90, ac.currentTime, .05);
  }
  const jitter = speed > .3 ? .004 : 0;
  ROT = rotMat(HEAD.yaw + rand(-jitter, jitter), HEAD.pitch + Math.sin(T * 3.1) * S.mouth * .02, HEAD.roll);
  POS = [0, Math.sin(T * .8) * .015 - (asleep ? .05 : 0) - (isWitch() ? .12 : 0), HEAD.z];
  // powieki czarownicy: mruganie, mrużenie przy słuchaniu, zamknięte we śnie, wybałuszone przy ataku
  if (T > S.nextBlink) { S.blinkT = T; S.nextBlink = T + rand(2, 6) * (Math.random() < .2 ? .25 : 1); }
  const bk = clamp(1 - Math.abs(T - S.blinkT - .08) / .08, 0, 1);
  let lidT = Math.max(bk, S.mode === 'listening' ? .35 : S.mode === 'thinking' ? .25 : 0, asleep ? 1 : 0);
  if (scare || glitch) lidT = -.5;
  S.lid += (lidT - S.lid) * (1 - Math.exp(-dt * 30));

  // --- serce, auto-straszenie ---
  const rate = (S.mode !== 'listening' && cam.active && T - cam.lastMotion < 3 && cam.amount > .04) ? 72 : 0;
  if (ac && rate && T > S.nextBeat) { heartbeat(); S.nextBeat = T + 60 / rate; }
  if (cfg.auto && ac && S.mode === 'idle' && !S.dozing && T > S.nextAuto) {
    S.nextAuto = T + rand(14, 38);
    const ev = pick(['chatter', 'chatter', 'whisper', 'whisper', 'look', 'look', 'flicker', 'flicker', 'lightning', 'twitch',
      'laugh', 'blood', 'exorcist', 'possess', 'spiders', 'ghosts', 'ghosts', 'howl', 'howl']);
    if (ev === 'look') S.fastLookUntil = T + 2.2;
    else if (ev === 'flicker') { S.flickerUntil = T + rand(.6, 1.4); buzz(); }
    else fx(ev);
  }
  S.flashes = S.flashes.filter(([, b]) => b > T);

  // --- cząsteczki (piksele nakładki) ---
  const L = Math.min(2.4, S.fire);
  const sc = (.55 + L * .55) * (scare ? 1.8 : 1), ch = CHAR();
  ch.eyes.forEach((x, i) => {
    const pr = project([x + S.gazeX * .03, ch.eyeY, ch.eyeZ]);
    S.spawnAcc[i] += ch.fire ? L * 110 * dt * eyeVis(x) : 0;
    while (S.spawnAcc[i] >= 1) { S.spawnAcc[i]--; const u = pr.s;
      flames.push({ eye: x, x: pr.x + rand(-.07, .07) * u * Math.min(1, L), y: pr.y + rand(0, .06) * u, vx: rand(-.02, .02) * u,
        vy: -rand(.1, .24) * u * sc, life: 0, max: rand(.45, .95), size: rand(.04, .08) * u * sc, w: rand(0, 6), u }); }
  });
  for (let i = flames.length - 1; i >= 0; i--) { const p = flames[i]; p.life += dt;
    if (p.life > p.max) { flames.splice(i, 1); continue; }
    p.x += (p.vx + Math.sin(T * 9 + p.w) * .035 * p.u) * dt; p.y += p.vy * dt; p.vy -= .08 * p.u * dt; }
  if (S.mouth > .35 && S.mode === 'speaking' && Math.random() < dt * 14) {
    const mo = CHAR().mouth, pr = project([mo[0] + rand(-.1, .1), mo[1], mo[2]]);
    smoke.push({ x: pr.x, y: pr.y, vx: rand(-.05, .05) * pr.s, vy: -rand(.06, .14) * pr.s, life: 0, max: rand(1.5, 2.6), r: .08 * pr.s });
  }
  for (let i = smoke.length - 1; i >= 0; i--) { const p = smoke[i]; p.life += dt; if (p.life > p.max) { smoke.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.r *= 1 + dt * .9; }
  if (Math.random() < dt * 7) embers.push({ x: rand(OW * .15, OW * .85), y: OH + 10, vx: rand(-20, 20) * DPR, vy: -rand(40, 110) * DPR,
    life: 0, max: rand(4, 9), s: rand(2, 5) * DPR, w: rand(0, 6) });
  for (let i = embers.length - 1; i >= 0; i--) { const p = embers[i]; p.life += dt;
    if (p.life > p.max) { embers.splice(i, 1); continue; }
    p.x += (p.vx + Math.sin(p.life * 2 + p.w) * 25 * DPR) * dt; p.y += p.vy * dt; }
  for (const f of fog) { f.x += f.vx * dt; if (f.x < -f.r) f.x = OW + f.r; if (f.x > OW + f.r) f.x = -f.r; }
  for (let i = tears.length - 1; i >= 0; i--) { const t = tears[i]; t.age += dt;
    t.len = Math.min(t.max, t.len + t.speed * dt * Math.max(.15, 1 - t.len / t.max)); if (t.age > 25) tears.splice(i, 1); }

  // pająki
  for (let i = spiders.length - 1; i >= 0; i--) { const p = spiders[i]; p.life += dt; p.grow = Math.min(1, p.life * 2.5);
    if (p.pause > 0) { p.pause -= dt; continue; }
    if (Math.random() < dt * .6) p.pause = rand(.2, .9);
    p.turn = p.turn * .96 + rand(-1, 1) * dt * 8; p.a += p.turn * dt * 3;
    p.x += Math.cos(p.a) * p.v * dt; p.y += Math.sin(p.a) * p.v * dt; p.ph += dt * p.v / p.s * 1.6;
    if (p.x < -100 || p.x > OW + 100 || p.y < -100 || p.y > OH + 100 || p.life > 25) spiders.splice(i, 1); }
  if (ac && spiders.length && Math.random() < dt * spiders.length * 5) click(ac.currentTime, rand(.02, .06));
  for (let i = ghosts.length - 1; i >= 0; i--) { const g = ghosts[i]; g.age += dt; g.x += g.vx * dt; g.y += g.vy * dt; if (g.age > g.max) ghosts.splice(i, 1); }
  for (let i = cracks.length - 1; i >= 0; i--) { cracks[i].age += dt; if (cracks[i].age > 8) cracks.splice(i, 1); }

  // dzwon o pełnej godzinie
  if (cfg.bell && ac) { const d = new Date();
    if (d.getMinutes() === 0 && d.getSeconds() < 3 && lastToll !== d.getHours()) { lastToll = d.getHours(); fx('bell'); } }
}

// =====================================================================
//  RYSOWANIE
// =====================================================================
function draw(t) {
  const T = clock(), scare = T < S.scareUntil, glitch = T < S.glitchUntil;
  const [c1, c2] = (glitch ? ['#7dff2a', '#f4ffd0'] : THEMES[cfg.theme] || THEMES.fire).map(lin);
  let amb = +cfg.ambient * (S.mode === 'sleep' ? .5 : 1);
  if (T < S.flickerUntil) amb *= Math.random() < .45 ? .1 : 1.1;
  const flash = S.flashes.some(([a, b]) => T >= a && T <= b) ? 1 : 0;
  const candle = +cfg.candle * (.85 + .15 * Math.sin(T * 7.3) * Math.sin(T * 2.9) + .05 * Math.random());

  if (gl && VS) pickProgram();
  if (gl && prog) {
    gl.uniform2f(U.uRes, GLC.width, GLC.height); gl.uniform1f(U.uTime, t);
    gl.uniformMatrix3fv(U.uRot, false, [ROT[0], ROT[3], ROT[6], ROT[1], ROT[4], ROT[7], ROT[2], ROT[5], ROT[8]]);
    gl.uniform3fv(U.uPos, POS); gl.uniform1f(U.uJaw, S.mouth * .45);
    gl.uniform3f(U.uGaze, S.gazeX * .045, S.gazeY * .035, 0);
    gl.uniform1f(U.uFire, Math.min(2.4, S.fire)); gl.uniform3fv(U.uC1, c1); gl.uniform3fv(U.uC2, c2);
    gl.uniform1f(U.uAmb, amb); gl.uniform1f(U.uCandle, candle); gl.uniform1f(U.uFlash, flash);
    gl.uniform3fv(U.uFlashDir, norm(S.flashDir)); gl.uniform1f(U.uHood, cfg.look === 'reaper' ? 1 : 0);
    gl.uniform1f(U.uChar, isWitch() ? 1 : 0); gl.uniform1f(U.uBlink, S.lid);
    gl.uniform1f(U.uGlitch, glitch ? 1 : 0); gl.uniform1f(U.uRed, scare && Math.random() < .3 ? .6 : scare ? .25 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const spr = glitch ? SPR_P : SPR;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, OW, OH);
  // duchy w tle
  ctx.globalCompositeOperation = 'screen';
  for (const g of ghosts) { const k = g.age / g.max;
    ctx.globalAlpha = Math.sin(k * Math.PI) * (.16 + .06 * Math.sin(g.age * 3 + g.wob));
    const w = GHOST.width * g.s, h = GHOST.height * g.s * (1 + .08 * Math.sin(g.age * 2.2 + g.wob));
    ctx.drawImage(GHOST, g.x - w / 2 + Math.sin(g.age * 1.3 + g.wob) * 20 * DPR, g.y - h / 2, w, h); }
  ctx.globalAlpha = 1;
  // krwawe łzy
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
  for (const tr of tears) {
    const ch = CHAR(), a = project([tr.x, ch.tearY, ch.tearZ]), b = project([tr.x + tr.drift * tr.len, ch.tearY - tr.len, ch.tearZ + .01 - tr.len * .25]);
    const fade = clamp(1 - (tr.age - 18) / 7, 0, 1), w = .018 * a.s * tr.w;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, `rgba(90,0,0,${.95 * fade})`); g.addColorStop(1, `rgba(150,0,4,${.95 * fade})`);
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo((a.x + b.x) / 2 + tr.wob * w, (a.y + b.y) / 2, b.x, b.y); ctx.stroke();
    ctx.fillStyle = `rgba(150,0,4,${fade})`; ctx.beginPath(); ctx.arc(b.x, b.y + w * .3, w * .9, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(255,120,120,${.5 * fade})`; ctx.beginPath(); ctx.arc(b.x - w * .25, b.y, w * .25, 0, 7); ctx.fill();
  }
  // ogień
  ctx.globalCompositeOperation = 'lighter';
  const L = Math.min(2.4, S.fire), face = clamp((facing() - .15) / .45, 0, 1);
  for (const p of flames) {
    const k = p.life / p.max, sz = p.size * (1 - k * .55);
    ctx.globalAlpha = Math.max(0, (1 - k) * .85 * eyeVis(p.eye));
    ctx.drawImage(k < .22 ? spr.hot : k < .55 ? spr.mid : spr.cool, p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  CHAR().eyes.forEach(x => { // poświata wokół oczu
    const pr = project([x, CHAR().eyeY + (isWitch() ? 0 : .06), isWitch() ? .6 : .5]), r = pr.s * (isWitch() ? .12 + L * .06 : .35 + L * .15);
    ctx.globalAlpha = Math.min(.55, L * .3) * eyeVis(x); ctx.drawImage(spr.cool, pr.x - r, pr.y - r, r * 2, r * 2);
  });
  if (S.mouth > .05) { const mo = CHAR().mouth, pr = project([mo[0], mo[1], mo[2] - .15]), r = pr.s * (isWitch() ? .2 : .35);
    ctx.globalAlpha = S.mouth * .6 * face; ctx.drawImage(spr.mid, pr.x - r, pr.y - r * .6, r * 2, r * 1.2); }
  ctx.globalAlpha = 1;
  // dym z ust
  ctx.globalCompositeOperation = 'source-over';
  for (const p of smoke) { const k = p.life / p.max; ctx.globalAlpha = Math.sin(k * Math.PI) * .22; ctx.drawImage(SPR.smoke, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
  // mgła i iskry
  for (const f of fog) { ctx.globalAlpha = f.a * (flash ? 3 : 1); ctx.drawImage(SPR.fog, f.x - f.r, f.y - f.r * .5, f.r * 2, f.r); }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of embers) { const k = p.life / p.max; ctx.globalAlpha = Math.sin(k * Math.PI) * (.5 + .5 * Math.sin(p.life * 14 + p.w));
    ctx.drawImage(spr.mid, p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (flash) { ctx.fillStyle = 'rgba(200,215,255,.12)'; ctx.fillRect(0, 0, OW, OH); }
  if (loadingGL) { // shader się kompiluje
    const first = !PROGS.s?.ready && !PROGS.w?.ready;
    ctx.globalAlpha = .55 + .35 * Math.sin(T * 3); ctx.fillStyle = '#ff7a2a'; ctx.textAlign = 'center';
    ctx.font = `600 ${Math.round((first ? 28 : 16) * DPR)}px Georgia, serif`;
    ctx.fillText(first ? tx().ui.loading : tx().ui.morphing, first ? OW / 2 : OW - 90 * DPR, first ? OH / 2 : OH - 24 * DPR);
    ctx.globalAlpha = 1;
  }
  for (const p of spiders) drawSpider(p);
  for (const c of cracks) drawCracks(c);
}

function drawSpider(p) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(p.s * p.grow, p.s * p.grow);
  ctx.strokeStyle = '#0b0606'; ctx.lineWidth = .07; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const sw = Math.sin(p.ph + i * 1.7 + (side > 0 ? Math.PI : 0)) * .3;
    const a = side * (.55 + i * .62) + sw * side * .6, bx = .12 - i * .1, by = side * .08;
    const kx = bx + Math.cos(a) * .55, ky = by + Math.sin(a) * .55;
    const a2 = a + side * (i < 2 ? -.6 : .6);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(kx, ky); ctx.lineTo(kx + Math.cos(a2) * .6, ky + Math.sin(a2) * .6); ctx.stroke();
  }
  const g = ctx.createRadialGradient(-.42, -.1, .02, -.38, 0, .42);
  g.addColorStop(0, '#3a2a28'); g.addColorStop(1, '#070303');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(-.38, 0, .4, .3, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#100808'; ctx.beginPath(); ctx.ellipse(.08, 0, .22, .17, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(200,0,0,.9)';
  for (const e of [-.05, .05]) { ctx.beginPath(); ctx.arc(.26, e, .028, 0, 7); ctx.fill(); }
  ctx.fillStyle = 'rgba(160,40,30,.55)'; ctx.beginPath(); ctx.ellipse(-.45, 0, .12, .05, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function drawCracks(c) {
  const a = c.age < 6 ? 1 : clamp(1 - (c.age - 6) / 2, 0, 1);
  ctx.save(); ctx.globalAlpha = a; ctx.lineJoin = 'miter';
  for (const [x, y, x2, y2, x3, y3] of c.shards) { ctx.fillStyle = 'rgba(220,235,255,.05)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.fill(); }
  for (const [dx, col, w] of [[1.2, 'rgba(0,0,0,.65)', 2.2], [0, 'rgba(225,238,255,.8)', 1.1]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w * DPR;
    for (const ray of c.rays) { ctx.beginPath(); ray.forEach(([x, y], i) => i ? ctx.lineTo(x + dx, y + dx) : ctx.moveTo(x + dx, y + dx)); ctx.stroke(); }
    for (const [[x1, y1], [x2, y2]] of c.rings) { ctx.beginPath(); ctx.moveTo(x1 + dx, y1 + dx); ctx.lineTo(x2 + dx, y2 + dx); ctx.stroke(); }
  }
  const g = ctx.createRadialGradient(c.cx, c.cy, 0, c.cx, c.cy, 40 * DPR);
  g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(c.cx - 40 * DPR, c.cy - 40 * DPR, 80 * DPR, 80 * DPR);
  ctx.restore();
}

function shatter(cx, cy) {
  const n = 14 + (Math.random() * 8 | 0), R = Math.hypot(OW, OH), rays = [];
  for (let i = 0; i < n; i++) { let a = i / n * Math.PI * 2 + rand(-.2, .2), r = 0; const pts = [[cx, cy]];
    while (r < R) { r += rand(20, 75) * DPR; a += rand(-.14, .14); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    rays.push(pts); }
  const at = (pts, r) => pts.find(([x, y]) => Math.hypot(x - cx, y - cy) >= r) || pts[pts.length - 1];
  const rings = [], shards = [];
  for (const rr of [35, 85, 160, 270, 420].map(v => v * DPR * rand(.8, 1.2)))
    for (let i = 0; i < n; i++) if (Math.random() < .7) {
      const p1 = at(rays[i], rr), p2 = at(rays[(i + 1) % n], rr * rand(.85, 1.15)); rings.push([p1, p2]);
      if (rr < 200 * DPR && Math.random() < .5) shards.push([cx, cy, ...p1, ...p2]); }
  cracks.push({ rays, rings, shards, cx, cy, age: 0 });
}

function spawnSpiders(n) {
  const origins = CHAR().origins;
  for (let i = 0; i < n; i++) setTimeout(() => { const pr = project(pick(origins));
    spiders.push({ x: pr.x, y: pr.y, a: rand(0, Math.PI * 2), v: rand(.3, .6) * pr.s, s: rand(.07, .12) * pr.s,
      ph: rand(0, 6), turn: 0, life: 0, grow: 0, pause: 0 }); }, i * rand(150, 600));
}
function spawnGhost() {
  const left = Math.random() < .5;
  ghosts.push({ x: OW * (left ? rand(.05, .28) : rand(.72, .95)), y: OH * rand(.35, .75), vx: rand(-25, 25) * DPR, vy: -rand(10, 35) * DPR,
    s: rand(.7, 1.4) * OH / 900, age: 0, max: rand(5, 8), wob: rand(0, 6) });
}
let GHOST = null;
function buildGhost() {
  const c = document.createElement('canvas'); c.width = 220; c.height = 340; const g = c.getContext('2d');
  g.filter = 'blur(7px)';
  const body = g.createRadialGradient(110, 120, 10, 110, 160, 160);
  body.addColorStop(0, 'rgba(225,238,255,.95)'); body.addColorStop(1, 'rgba(190,210,255,0)');
  g.fillStyle = body;
  g.beginPath(); g.ellipse(110, 130, 70, 95, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(42, 150); g.quadraticCurveTo(55, 290, 110, 335); g.quadraticCurveTo(165, 290, 178, 150); g.fill();
  g.filter = 'blur(4px)'; g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.95)';
  for (const [x, y, rx, ry, r] of [[82, 112, 14, 21, -.25], [138, 112, 14, 21, .25], [110, 180, 17, 30, 0]]) { g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 7); g.fill(); }
  GHOST = c;
}

// automatyczna rozdzielczość: jeśli komputer nie wyrabia, renderuj mniej pikseli
let perfAcc = 0, perfN = 0;
function adaptQuality(dt) {
  perfAcc += dt; perfN++;
  if (perfN < 60) return;
  const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
  const max = +cfg.quality;
  if (avg > 1 / 22 && renderScale > .45) { renderScale = Math.max(.45, renderScale - .1); resizeGL(); } // nie schodź do papki
  else if (avg < 1 / 50 && renderScale < max) { renderScale = Math.min(max, renderScale + .05); resizeGL(); }
}

let last = performance.now(), fpsShow = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  fpsShow = fpsShow * .95 + (1 / Math.max(dt, .001)) * .05;
  update(dt); draw(now / 1000); adaptQuality(dt);
  if (!document.body.classList.contains('nodebug') || S.lastText.startsWith('⚠')) document.getElementById('status').textContent =
    `mode: ${S.mode}${S.dozing ? ' (dozing)' : ''}  fps: ${fpsShow.toFixed(0)}  render: ${(renderScale * 100).toFixed(0)}%  mic: ${S.micOn ? 'ON' : 'off'}  level: ${S.level.toFixed(3)} / ${cfg.threshold}  camera: ${cam.active ? cam.amount.toFixed(3) : 'off'}\n` +
    `souls tonight: ${visitors}  last: ${S.lastText.slice(0, 140)}`;
  requestAnimationFrame(frame);
}

// =====================================================================
//  DŹWIĘK (syntezowany)
// =====================================================================
let ac, master, reverb, noiseBuf, brownBuf, ambientGain, fireGain, servoGain, servoOsc;
function impulse(sec, decay) {
  const len = ac.sampleRate * sec, b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
function distCurve(k) { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(x * k); } return c; }
function out(node, wet = .3) { node.connect(master); if (wet) { const g = ac.createGain(); g.gain.value = wet; node.connect(g).connect(reverb); } }
function noiseSrc(buf = noiseBuf) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; return s; }
function envGain(t, a, peak, d) { const g = ac.createGain(); g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); return g; }
function filt(type, f, q = 1) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
function osc(type, f) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; return o; }

function initSound() {
  ac = new AudioContext();
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5;
  master = ac.createGain(); master.gain.value = +cfg.volume; master.connect(comp).connect(ac.destination);
  reverb = ac.createConvolver(); reverb.buffer = impulse(3.4, 2.6); reverb.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  brownBuf = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  { const d = brownBuf.getChannelData(0); let v = 0; for (let i = 0; i < d.length; i++) { v = (v + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = v * 3.5; } }
  ambientGain = ac.createGain(); ambientGain.gain.value = 0; out(ambientGain, .5);
  const dl = filt('lowpass', 150, 7), dg = ac.createGain(); dg.gain.value = .16;
  [41.2, 41.9, 61.8, 82.1].forEach(f => { const o = osc('sawtooth', f); o.connect(dl); o.start(); });
  const lfo = osc('sine', .045), lg = ac.createGain(); lg.gain.value = 70; lfo.connect(lg).connect(dl.frequency); lfo.start();
  dl.connect(dg).connect(ambientGain);
  const wn = noiseSrc(), wb = filt('bandpass', 500, 1.4), wg = ac.createGain(); wg.gain.value = .32;
  const l2 = osc('sine', .08), l2g = ac.createGain(); l2g.gain.value = 380; l2.connect(l2g).connect(wb.frequency); l2.start();
  const l3 = osc('sine', .13), l3g = ac.createGain(); l3g.gain.value = .22; l3.connect(l3g).connect(wg.gain); l3.start();
  wn.connect(wb).connect(wg).connect(ambientGain); wn.start();
  setAmbient(cfg.ambientSound);
  fireGain = ac.createGain(); fireGain.gain.value = 0;
  const fn = noiseSrc(brownBuf), fl = filt('lowpass', 900); fn.connect(fl).connect(fireGain); out(fireGain, .1); fn.start();
  // serwo: brzęczenie silniczka, głośność zależna od prędkości głowy
  servoGain = ac.createGain(); servoGain.gain.value = 0;
  servoOsc = osc('sawtooth', 120); const so2 = osc('square', 61);
  const sb = filt('bandpass', 1100, 1.5); servoOsc.connect(sb); so2.connect(sb); sb.connect(servoGain); out(servoGain, .05);
  servoOsc.start(); so2.start();
}
function setAmbient(on) { if (ambientGain) ambientGain.gain.setTargetAtTime(on ? .4 : 0, ac.currentTime, 1.2); }

function crackle() {
  const t = ac.currentTime, s = noiseSrc(), g = envGain(t, .001, rand(.03, .16), rand(.01, .05));
  s.connect(filt('highpass', rand(1500, 5000))).connect(g); out(g, .15); s.start(t, rand(0, 2)); s.stop(t + .1);
}
function whoosh() {
  const t = ac.currentTime, s = noiseSrc(), b = filt('bandpass', 150, 1.6), g = envGain(t, .25, .7, 1.1);
  b.frequency.exponentialRampToValueAtTime(2600, t + .45); b.frequency.exponentialRampToValueAtTime(400, t + 1.3);
  s.connect(b).connect(g); out(g, .5); s.start(t); s.stop(t + 1.5);
  const o = osc('sine', 90), og = envGain(t, .02, .6, .5); o.frequency.exponentialRampToValueAtTime(35, t + .5);
  o.connect(og); out(og, .2); o.start(t); o.stop(t + .6);
}
function fizzle() {
  const t = ac.currentTime, s = noiseSrc(), g = envGain(t, .01, .25, .9);
  s.connect(filt('highpass', 3500)).connect(g); out(g, .4); s.start(t); s.stop(t + 1);
}
function heartbeat() {
  const t0 = ac.currentTime;
  [[0, 1], [.2, .65]].forEach(([d, v]) => { const t = t0 + d, o = osc('sine', 72), g = envGain(t, .006, .9 * v, .24);
    o.frequency.exponentialRampToValueAtTime(38, t + .14); o.connect(filt('lowpass', 160)).connect(g); out(g, .15); o.start(t); o.stop(t + .3); });
}
function click(t, v = .3) {
  const s = noiseSrc(), g = envGain(t, .001, v, .018); s.connect(filt('bandpass', rand(1800, 3200), 4)).connect(g); out(g, .25);
  s.start(t, rand(0, 2)); s.stop(t + .04);
  const o = osc('triangle', rand(700, 1100)), og = envGain(t, .001, v * .5, .025); o.connect(og); out(og, .2); o.start(t); o.stop(t + .04);
}
function boneCrack(t = ac.currentTime) {
  for (let i = 0, n = rand(3, 7); i < n; i++) { const tt = t + rand(0, .1), s = noiseSrc(), g = envGain(tt, .001, rand(.25, .6), rand(.01, .035));
    s.connect(filt('bandpass', rand(900, 3200), 2)).connect(g); out(g, .3); s.start(tt, rand(0, 2)); s.stop(tt + .06); }
  const o = osc('sine', 120), og = envGain(t, .002, .5, .12); o.frequency.exponentialRampToValueAtTime(45, t + .1); o.connect(og); out(og, .1); o.start(t); o.stop(t + .2);
}
function drip(t) { const o = osc('sine', 1400), g = envGain(t, .002, .25, .18); o.frequency.exponentialRampToValueAtTime(500, t + .12); o.connect(g); out(g, .8); o.start(t); o.stop(t + .25); }
function whisper() {
  const t0 = ac.currentTime, dur = rand(1.8, 3.4), s = noiseSrc();
  const f1 = filt('bandpass', 700, 9), f2 = filt('bandpass', 1500, 11), sib = filt('highpass', 5500);
  const env = ac.createGain(); env.gain.value = 0; const pan = ac.createStereoPanner(); pan.pan.value = rand(-.9, .9);
  const g1 = ac.createGain(); g1.gain.value = 5; const g2 = ac.createGain(); g2.gain.value = 4; const g3 = ac.createGain(); g3.gain.value = 0;
  s.connect(f1).connect(g1).connect(env); s.connect(f2).connect(g2).connect(env); s.connect(sib).connect(g3).connect(env);
  env.connect(pan); out(pan, 1.2);
  const V = [[800, 1200], [500, 1900], [300, 2300], [500, 900], [350, 800]];
  let t = t0;
  while (t < t0 + dur) { const d = rand(.08, .2), [a, b] = pick(V), sibil = Math.random() < .25;
    f1.frequency.setTargetAtTime(a, t, .02); f2.frequency.setTargetAtTime(b, t, .02); g3.gain.setTargetAtTime(sibil ? .6 : 0, t, .01);
    env.gain.setTargetAtTime(rand(.25, .55), t, .02); env.gain.setTargetAtTime(.02, t + d * .7, .03); t += d; }
  env.gain.setTargetAtTime(0, t, .1); pan.pan.linearRampToValueAtTime(rand(-.9, .9), t);
  s.start(t0); s.stop(t + .5);
}
function growl(dur = 1.3) {
  const t = ac.currentTime, g = envGain(t, .08, .6, dur), sh = ac.createWaveShaper(); sh.curve = distCurve(6);
  const am = ac.createGain(); const lfo = osc('square', 19), lg = ac.createGain(); lg.gain.value = .5;
  am.gain.value = .5; lfo.connect(lg).connect(am.gain);
  [52, 54.5, 78].forEach(f => { const o = osc('sawtooth', f); o.frequency.linearRampToValueAtTime(f * .8, t + dur); o.connect(sh); o.start(t); o.stop(t + dur + .2); });
  const n = noiseSrc(brownBuf); n.connect(sh); n.start(t); n.stop(t + dur + .2);
  sh.connect(filt('lowpass', 700)).connect(am).connect(g); out(g, .5); lfo.start(t); lfo.stop(t + dur + .2);
}
function scream() {
  const t = ac.currentTime, dur = 1.7, g = envGain(t, .03, 1, dur), sh = ac.createWaveShaper(); sh.curve = distCurve(3);
  const src = ac.createGain();
  [1, 1.012, .5].forEach(m => { const o = osc('sawtooth', 640 * m); o.frequency.setValueAtTime(640 * m, t);
    o.frequency.exponentialRampToValueAtTime(260 * m, t + dur);
    const vib = osc('sine', 7), vg = ac.createGain(); vg.gain.value = 30 * m; vib.connect(vg).connect(o.frequency);
    o.connect(src); o.start(t); vib.start(t); o.stop(t + dur + .1); vib.stop(t + dur + .1); });
  const n = noiseSrc(); const ng = ac.createGain(); ng.gain.value = .6; n.connect(ng).connect(src); n.start(t); n.stop(t + dur + .1);
  [[850, 1], [1250, .7], [2700, .45]].forEach(([f, v]) => { const b = filt('bandpass', f, 5), bg = ac.createGain(); bg.gain.value = v * 2.2; src.connect(b).connect(bg).connect(sh); });
  sh.connect(g); out(g, .6);
  const boom = osc('sine', 60), bg = envGain(t, .005, 1, .9); boom.frequency.exponentialRampToValueAtTime(28, t + .8);
  boom.connect(bg); out(bg, .3); boom.start(t); boom.stop(t + 1);
  deafFor(dur + .5);
}
function thunder(delay) {
  const t = ac.currentTime + delay;
  const c = noiseSrc(), cg = envGain(t, .005, .7, .35); c.connect(filt('highpass', 900)).connect(cg); out(cg, .8); c.start(t, rand(0, 2)); c.stop(t + .5);
  const r = noiseSrc(brownBuf), rl = filt('lowpass', 240), rg = envGain(t + .05, .35, 1, rand(3, 4.5));
  const lfo = osc('sine', rand(1.5, 3)), lg = ac.createGain(); lg.gain.value = 110; lfo.connect(lg).connect(rl.frequency);
  r.connect(rl).connect(rg); out(rg, .7); r.start(t, rand(0, 3)); r.stop(t + 5.5); lfo.start(t); lfo.stop(t + 5.5);
  deafFor(delay + 4);
}
function buzz() {
  const t = ac.currentTime, o = osc('sawtooth', 100), g = envGain(t, .01, .05, 1); o.connect(filt('bandpass', 400, 3)).connect(g); out(g, .1);
  o.start(t); o.stop(t + 1.1);
}

function shatterSound() {
  const t = ac.currentTime, s = noiseSrc(), g = envGain(t, .002, .9, .45); s.connect(filt('highpass', 1800)).connect(g); out(g, .5); s.start(t); s.stop(t + .6);
  const th = osc('sine', 90), tg = envGain(t, .002, .8, .3); th.frequency.exponentialRampToValueAtTime(35, t + .25); th.connect(tg); out(tg, .2); th.start(t); th.stop(t + .4);
  for (let i = 0; i < 28; i++) { const tt = t + rand(0, .9) * Math.random(), o = osc('sine', rand(2800, 7500)), og = envGain(tt, .001, rand(.04, .14), rand(.04, .3));
    o.connect(og); out(og, .6); o.start(tt); o.stop(tt + .4); }
  deafFor(1.5);
}
function howl(delay = 0, det = 1) {
  const t = ac.currentTime + delay, g = ac.createGain(), pan = ac.createStereoPanner(); pan.pan.value = rand(-.8, .8);
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.3, t + .5); g.gain.setValueAtTime(.3, t + 2.6); g.gain.exponentialRampToValueAtTime(.0001, t + 3.9);
  const vib = osc('sine', 5.5), vg = ac.createGain(); vg.gain.value = 9 * det; vib.connect(vg);
  const mix = ac.createGain();
  for (const [type, m] of [['sawtooth', 1], ['triangle', 1.003]]) { const o = osc(type, 300 * det * m);
    o.frequency.setValueAtTime(300 * det * m, t); o.frequency.exponentialRampToValueAtTime(620 * det * m, t + .9);
    o.frequency.setValueAtTime(620 * det * m, t + 1.7); o.frequency.exponentialRampToValueAtTime(370 * det * m, t + 3.8);
    vg.connect(o.frequency); o.connect(mix); o.start(t); o.stop(t + 4); }
  const f1 = filt('bandpass', 900, 4), f2 = filt('bandpass', 1700, 6), g1 = ac.createGain(), g2 = ac.createGain(); g1.gain.value = 1.6; g2.gain.value = .6;
  mix.connect(f1).connect(g1).connect(g); mix.connect(f2).connect(g2).connect(g);
  g.connect(filt('lowpass', 2400)).connect(pan); out(pan, 1.6); vib.start(t); vib.stop(t + 4);
  deafFor(delay + 4.2);
}
function wail() {
  const t = ac.currentTime, g = envGain(t, .9, .12, 2.6), pan = ac.createStereoPanner(), lp = filt('lowpass', 1500);
  pan.pan.setValueAtTime(-.8, t); pan.pan.linearRampToValueAtTime(.8, t + 3.5);
  const vib = osc('sine', 6), vg = ac.createGain(); vg.gain.value = 14; vib.connect(vg);
  for (const m of [1, 1.5]) { const o = osc('sine', 380 * m); o.frequency.setValueAtTime(380 * m, t);
    o.frequency.exponentialRampToValueAtTime(760 * m, t + 1.2); o.frequency.exponentialRampToValueAtTime(330 * m, t + 3.3);
    vg.connect(o.frequency); const og = ac.createGain(); og.gain.value = m === 1 ? 1 : .35; o.connect(og).connect(lp); o.start(t); o.stop(t + 3.6); }
  lp.connect(g).connect(pan); out(pan, 2); vib.start(t); vib.stop(t + 3.6);
  deafFor(4);
}
function bell(t) {
  for (const [r, a, d] of [[.5, .6, 9], [1, 1, 6], [1.19, .5, 4], [1.5, .45, 3.5], [2, .4, 3], [2.5, .3, 2.2], [3, .25, 1.8], [4.2, .15, 1.2]]) {
    const o = osc('sine', 98 * r), g = envGain(t, .004, a * .3, d); o.connect(g); out(g, .6); o.start(t); o.stop(t + d + .1); }
  const s = noiseSrc(), g = envGain(t, .001, .25, .05); s.connect(filt('bandpass', 2200, 2)).connect(g); out(g, .4); s.start(t); s.stop(t + .1);
}
let deafUntil = 0;
function deafFor(sec) { deafUntil = Math.max(deafUntil, performance.now() + sec * 1000); }

// =====================================================================
//  EFEKTY
// =====================================================================
const FX_KEYS = { s: 'scare', x: 'exorcist', l: 'lightning', g: 'possess', b: 'blood', t: 'twitch', c: 'chatter', w: 'whisper',
  r: 'laugh', e: 'eyes', z: 'doze', p: 'spiders', u: 'ghosts', n: 'howl', v: 'glass', j: 'bell' };
function fx(name) {
  const T = clock();
  if (!ac && name !== 'eyes') return;
  if (cfg.family && FAMILY_BLOCKED.has(name)) return;
  if (name !== 'doze') activity();
  switch (name) {
    case 'scare': S.scareUntil = T + 1.7; scream(); setTimeout(() => { shatter(OW * rand(.4, .6), OH * rand(.35, .5)); shatterSound(); }, 260); break;
    case 'lightning': {
      const a = T + .05; S.flashes.push([a, a + .07], [a + .16, a + .21], [a + .38, a + .52]); S.flare = .8;
      S.flashDir = [Math.random() < .5 ? -1 : 1, rand(.3, .9), rand(.2, .7)];
      HEAD.vy += rand(-2, 2); thunder(rand(.4, 1.3)); break;
    }
    case 'possess': S.glitchUntil = T + 1.4; growl(1.4); deafFor(2); break;
    case 'chatter': {
      const dur = rand(.7, 1.3); S.chatterUntil = T + dur;
      for (let k = 0; k < dur * 9; k++) click(ac.currentTime + k / 9 + .055, rand(.15, .35));
      deafFor(dur + .3); break;
    }
    case 'whisper': S.asideUntil = T + 2.5; whisper(); deafFor(4); break;
    case 'laugh': if (S.mode === 'idle' || S.mode === 'sleep') { S.flare = .5; speak(pick(lines().laugh)); } break;
    case 'eyes': S.eyesOn = !S.eyesOn; if (ac) (S.eyesOn ? whoosh : fizzle)(); break;
    case 'exorcist': {
      S.exStart = T; S.exDir = Math.random() < .5 ? -1 : 1;
      for (let k = 0; k < 7; k++) boneCrack(ac.currentTime + k * .2);
      boneCrack(ac.currentTime + 2.1); boneCrack(ac.currentTime + 2.25); growl(2.4); deafFor(3.5); break;
    }
    case 'twitch': S.twitchUntil = T + 1.2; for (let k = 0; k < 4; k++) boneCrack(ac.currentTime + rand(0, 1.1)); deafFor(1.6); break;
    case 'blood':
      for (const side of CHAR().eyes) for (let k = 0; k < 2; k++)
        tears.push({ x: side + rand(-.06, .06), len: 0, max: rand(.35, .75), speed: rand(.12, .3), drift: rand(-.05, .05), wob: rand(-1, 1), w: rand(.7, 1.3), age: 0 });
      drip(ac.currentTime + 1.2); drip(ac.currentTime + 2.1); S.flare = .4; break;
    case 'spiders': spawnSpiders(5 + (Math.random() * 5 | 0)); S.flare = .4; break;
    case 'ghosts': for (let k = 0; k < 3; k++) setTimeout(spawnGhost, k * rand(400, 1300)); wail(); break;
    case 'howl': howl(0, 1); if (Math.random() < .7) howl(rand(.8, 1.6), rand(1.15, 1.3)); break;
    case 'glass': shatter(rand(.3, .7) * OW, rand(.3, .6) * OH); shatterSound(); break;
    case 'bell': {
      const h = new Date().getHours(), n = h % 12 || 12;
      for (let k = 0; k < n; k++) bell(ac.currentTime + k * 2.4);
      deafFor(n * 2.4 + 3); S.flare = .6;
      setTimeout(() => {
        if (h === 0) { fx('lightning'); fx('ghosts'); speak(tx().midnight); }
        else speak(tx().bell(tx().hours[n % 12]));
      }, n * 2400 + 1500);
      break;
    }
    case 'doze': S.dozing = !S.dozing; if (!S.dozing) { S.lastActivity = T; S.flare = 1; whoosh(); } break;
  }
}

// =====================================================================
//  KAMERA: wykrywanie ruchu (klatki 64×48 analizowane lokalnie, nigdzie nie zapisywane)
// =====================================================================
const cam = { active: false, x: .5, y: .5, amount: 0, lastMotion: -99, lastGreet: -99, prev: null, timer: null, stream: null };
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 } });
    if (!cfg.camera) { stream.getTracks().forEach(tr => tr.stop()); return; } // wyłączono w trakcie
    cam.stream = stream;
    const v = document.createElement('video'); v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();
    const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d', { willReadFrequently: true });
    cam.active = true;
    cam.timer = setInterval(() => {
      g.drawImage(v, 0, 0, 64, 48);
      const d = g.getImageData(0, 0, 64, 48).data, gray = new Uint8Array(64 * 48);
      let n = 0, sx = 0, sy = 0;
      for (let i = 0; i < gray.length; i++) { gray[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
        if (cam.prev && Math.abs(gray[i] - cam.prev[i]) > 28) { n++; sx += i % 64; sy += (i / 64) | 0; } }
      cam.prev = gray; cam.amount = n / gray.length;
      if (n > 25) {
        const T = clock(); cam.x = cam.x * .5 + sx / n / 64 * .5; cam.y = cam.y * .5 + sy / n / 48 * .5;
        if (cam.amount > .05 && S.mode === 'idle' && (S.dozing || T - cam.lastMotion > 20) && T - cam.lastGreet > 30) greet();
        cam.lastMotion = T;
      }
    }, 100);
  } catch (e) { S.lastText = '⚠ Camera: ' + e.message; }
}
function stopCamera() { cam.active = false; clearInterval(cam.timer); cam.stream?.getTracks().forEach(tr => tr.stop()); cam.stream = null; }
function greet() {
  newVisitorCheck(); cam.lastGreet = clock(); activity(); S.flare = 1;
  if (ac) whoosh();
  setTimeout(() => speak(pick(lines().greet)), 600);
}

// =====================================================================
//  KLUCZE API — w aplikacji: szyfrowane w procesie głównym; w przeglądarce: localStorage
// =====================================================================
const KEY_NAMES = ['nvidia', 'anthropic', 'openai'];
const browserKeys = () => { try { return JSON.parse(localStorage.getItem('hauntface-keys') || '{}'); } catch { return {}; } };
const Keys = {
  status: {},
  async refresh() {
    this.status = DESKTOP ? await DESKTOP.keys.status() : Object.fromEntries(KEY_NAMES.map(n => [n, !!browserKeys()[n]]));
    renderKeyFields();
  },
  async set(name, value) {
    if (DESKTOP) await DESKTOP.keys.set(name, value);
    else { const k = browserKeys(); if (value) k[name] = value; else delete k[name]; try { localStorage.setItem('hauntface-keys', JSON.stringify(k)); } catch {} }
  },
};
function renderKeyFields() {
  for (const n of KEY_NAMES) {
    const e = document.getElementById('key-' + n);
    e.value = ''; e.placeholder = Keys.status[n] ? tx().ui.keySaved : (n === 'nvidia' ? 'nvapi-…' : n === 'anthropic' ? 'sk-ant-…' : 'sk-…');
  }
  document.getElementById('keys-note').textContent = DESKTOP ? tx().ui.keyDesktop : tx().ui.keyBrowser;
}

// =====================================================================
//  DOSTAWCY: w aplikacji przez proces główny, w przeglądarce bezpośrednio (NVIDIA przez tools/serve.py)
// =====================================================================
function withTimeout(promise, ms) {
  let timer; return Promise.race([promise, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(timer));
}
const browserCtx = ms => ({ key: n => browserKeys()[n] || '', nvidiaBase: '/api/nvidia', browser: true, signal: AbortSignal.timeout(ms) });
const brain = o => withTimeout(DESKTOP ? DESKTOP.chat(o) : HauntProviders.chat(o, browserCtx(20000)), 21000);
const ears = async o => withTimeout(DESKTOP
  ? DESKTOP.transcribe({ ...o, blob: undefined, audio: await o.blob.arrayBuffer(), mime: o.blob.type })
  : HauntProviders.transcribe(o, browserCtx(15000)), 16000);
const mouthTTS = o => withTimeout(DESKTOP ? DESKTOP.speak(o) : HauntProviders.speak(o, browserCtx(15000)), 16000);
const hasKey = n => !!Keys.status[n];

// =====================================================================
//  SŁUCHANIE: VAD + Whisper / Web Speech
// =====================================================================
let micStream, micAnalyser, micBuf, recorder = null, voiceSince = 0, silenceSince = 0;
const REC_MIME = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
async function initMic() {
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  micAnalyser = ac.createAnalyser(); micAnalyser.fftSize = 1024; micBuf = new Float32Array(1024);
  ac.createMediaStreamSource(micStream).connect(micAnalyser);
}
function vadLoop() {
  try {
    if (micAnalyser) { micAnalyser.getFloatTimeDomainData(micBuf); let s = 0; for (const x of micBuf) s += x * x; S.level = Math.sqrt(s / micBuf.length); }
    const now = performance.now();
    const sttReady = !HauntProviders.isOpenAI(cfg.whisperUrl) || hasKey('openai'); // bez klucza nie nagrywaj w kółko
    if (!sttReady && cfg.stt === 'whisper' && micStream && !S.warnedStt) { S.warnedStt = true; S.lastText = '⚠ ' + tx().ui.noEars; toast(tx().ui.noEars); }
    const can = cfg.stt === 'whisper' && sttReady && micStream && S.micOn && now > deafUntil && (S.mode === 'idle' || S.mode === 'listening');
    if (can) {
      const loud = S.level > cfg.threshold;
      if (!recorder) { if (loud) { voiceSince ||= now; if (now - voiceSince > 120) startRec(); } else voiceSince = 0; }
      else { if (loud) silenceSince = 0; else silenceSince ||= now;
        if ((silenceSince && now - silenceSince > 1100) || now - recorder.started > 15000) stopRec(true); }
    } else if (recorder) stopRec(false); // mikrofon wyłączony / zmiana trybu w trakcie nagrania — porzuć nagranie
  } catch (e) { console.error(e); recorder = null; if (S.mode === 'listening') setMode('idle'); }
  finally { setTimeout(vadLoop, 30); }
}
function startRec() {
  const chunks = [], started = performance.now();
  const r = new MediaRecorder(micStream, REC_MIME ? { mimeType: REC_MIME } : undefined);
  r.started = started; silenceSince = 0;
  r.ondataavailable = e => e.data.size && chunks.push(e.data);
  r.onstop = () => {
    if (!r.keep || performance.now() - started < 700) { if (S.mode === 'listening') setMode('idle'); return; }
    transcribe(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
  };
  r.start(250); recorder = r; setMode('listening');
}
function stopRec(keep) { const r = recorder; recorder = null; voiceSince = 0; r.keep = keep; r.stop(); }

async function transcribe(blob) {
  setMode('thinking');
  try {
    const text = await ears({ blob, url: cfg.whisperUrl, model: cfg.whisperModel, lang: tx().stt });
    if (!text || text.length < 2 || tx().hallucinations.test(text)) { setMode('idle'); return; }
    await respond(text);
  } catch (e) { reportError(e); setMode('idle'); }
}

let rec = null;
function startWebSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || DESKTOP) { S.lastText = '⚠ Web Speech unavailable — use Whisper'; return; }
  rec = new SR(); rec.lang = tx().speechLang; rec.interimResults = false; rec.continuous = false;
  rec.onspeechstart = () => { if (S.mode === 'idle') setMode('listening'); };
  rec.onresult = e => {
    const text = e.results[0][0].transcript.trim();
    if (text && (S.mode === 'idle' || S.mode === 'listening')) { setMode('thinking'); respond(text); } // nie odpowiadaj na własny głos
  };
  rec.onend = () => { if (S.mode === 'listening') setMode('idle'); if (rec) setTimeout(webSpeechTick, 300); };
  rec.onerror = e => { if (e.error === 'network' || e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.lastText = '⚠ Web Speech: ' + e.error; rec = null; } };
  webSpeechTick();
}
function webSpeechTick() {
  if (cfg.stt !== 'webspeech' || !rec) return;
  if (S.micOn && S.mode === 'idle' && !speaking && performance.now() > deafUntil) { try { rec.lang = tx().speechLang; rec.start(); } catch {} }
  else setTimeout(webSpeechTick, 300);
}

// =====================================================================
//  MÓZG
// =====================================================================
const history = [];
let repliesSinceFx = 9, turnId = 0;
function shortReply(s) { // najwyżej 3 zdania / ~260 znaków — dzieci nie będą czekać na wykład
  const parts = s.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [s];
  let out = '';
  for (const p of parts.slice(0, 3)) { if (out && (out + p).length > 260) break; out += p; }
  return out.trim();
}
function reportError(e) {
  console.error(e);
  S.lastText = '⚠ ' + (e.code === 'NO_KEY' ? tx().ui.noBrain : e.message);
  if (e.code === 'NO_KEY') toast(tx().ui.noBrain);
}
async function respond(userText) {
  S.heard = userText;
  if (!cfg.aiOn) { S.lastText = '👂 ' + userText; setMode('idle'); return; } // mówi tylko lalkarz z telefonu
  newVisitorCheck();
  const myTurn = ++turnId;
  S.lastText = '👂 ' + userText; setMode('thinking');
  history.push({ role: 'user', content: userText });
  while (history.length > 16) history.shift();
  while (history.length && history[0].role !== 'user') history.shift();
  // gdy mózg długo milczy, postać zagaduje (zapychacze są anulowane, gdy przyjdzie odpowiedź)
  let waiting = true, fillers = 0;
  (async () => {
    while (waiting) {
      await new Promise(r => setTimeout(r, fillers ? 12000 : 4000));
      if (!waiting || myTurn !== turnId) break;
      fillers++;
      speak(pick(lines().filler), { filler: true, after: 'thinking' });
    }
  })();
  let reply = '', fromModel = true;
  try {
    const provider = cfg.llm;
    const r = await brain({ provider, model: provider === 'nvidia' ? cfg.nvidiaModel : cfg.model, system: systemPrompt(), messages: history.slice() });
    reply = r.refusal ? lines().refusal : (r.text || pick(lines().laugh));
  } catch (e) { reportError(e); reply = pick(lines().offline); fromModel = false; }
  waiting = false;
  if (myTurn !== turnId) return; // w międzyczasie zaczęła się nowa rozmowa
  cancelFillers();
  if (fromModel) history.push({ role: 'assistant', content: reply }); else history.pop();
  let effect = null;
  const tags = tx().tags;
  let spoken = reply.replace(/\[([^\]]+)\]/g, (_, tag) => { effect ||= tags[tag.trim().toLowerCase()] || L.pl.tags[tag.trim().toLowerCase()]; return ' '; })
    .replace(/[*_#>`~"„”]/g, '').trim();
  spoken = shortReply(spoken);
  if (effect && (repliesSinceFx < 2 || (cfg.family && FAMILY_BLOCKED.has(effect)))) effect = null; // efekty najwyżej co trzecią odpowiedź
  repliesSinceFx = effect ? 0 : repliesSinceFx + 1;
  S.lastText = '💀 ' + reply;
  if (effect && effect !== 'laugh') { fx(effect); await new Promise(r => setTimeout(r, { scare: 1600, exorcist: 2700 }[effect] || 700)); }
  await speak((effect === 'laugh' ? pick(lines().laugh) + ' ' : '') + (spoken || '...'), { after: 'idle' });
}
function systemPrompt() {
  const d = new Date(), hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return [persona(), cfg.riddles ? tx().riddles : '', cfg.family ? tx().family : '', tx().stayInRole, '', tx().context(hhmm, visitors)].filter(x => x !== null).join('\n');
}
// licznik gości tej nocy (noc zaczyna się o 6:00 rano czasu lokalnego); nowy gość = rozmowa po dłuższej przerwie
const nightKey = () => { const d = new Date(Date.now() - 6 * 3600e3); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let visitors = 0, lastInteraction = -999;
try { const v = JSON.parse(localStorage.getItem('hauntface-visitors') || '{}'); if (v.night === nightKey()) visitors = v.n; } catch {}
function newVisitorCheck() {
  const T = clock();
  if (T - lastInteraction > 45) {
    try { const v = JSON.parse(localStorage.getItem('hauntface-visitors') || '{}'); if (v.night !== nightKey()) visitors = 0; } catch {}
    visitors++; history.length = 0; // nowy gość nie dziedziczy rozmowy poprzedniego
    try { localStorage.setItem('hauntface-visitors', JSON.stringify({ night: nightKey(), n: visitors })); } catch {}
  }
  lastInteraction = T;
}

// =====================================================================
//  GŁOS — kolejka wypowiedzi z limitami czasu (nic nie może jej zablokować)
// =====================================================================
let speaking = false, speechChain = Promise.resolve(), fillerGen = 0, stopCurrent = null;
function cancelFillers() { fillerGen++; if (speaking && speaking.filler && stopCurrent) stopCurrent(); }
function hush() { fillerGen++; speechChain = Promise.resolve(); if (stopCurrent) stopCurrent(); }
function speak(text, opts = {}) {
  const gen = fillerGen;
  const job = speechChain.then(async () => {
    if (opts.filler && gen !== fillerGen) return; // zapychacz już niepotrzebny
    speaking = { filler: !!opts.filler }; activity(); S.said = text;
    const prev = S.mode; setMode('speaking');
    if (rec) try { rec.abort(); } catch {}
    try {
      if (cfg.tts === 'openai' && hasKey('openai') && ac) await speakOpenAI(text);
      else await speakBrowser(text);
    } catch (e) { reportError(e); await speakBrowser(text).catch(() => {}); }
    deafFor(.7); speaking = false; stopCurrent = null;
    setMode(opts.after || (prev === 'sleep' ? 'sleep' : prev === 'thinking' ? 'thinking' : 'idle'));
    if (rec) webSpeechTick();
  });
  speechChain = job.catch(() => {});
  return job;
}
function speakBrowser(text) {
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text), voices = speechSynthesis.getVoices(), lang = tx().speechLang.slice(0, 2);
    const mine = voices.filter(v => v.lang.toLowerCase().startsWith(lang));
    u.voice = (isWitch() ? mine.find(v => /female|zira|paulina|zosia|ewa|samantha/i.test(v.name)) : mine.find(v => !/female/i.test(v.name) && /male|marek|krzysztof|david|daniel|alex/i.test(v.name))) || mine[0] || null;
    u.lang = tx().speechLang; u.pitch = isWitch() ? 1.8 : .1; u.rate = isWitch() ? .95 : .82;
    let done = false;
    const finish = () => { if (done) return; done = true; browserSpeaking = false; clearTimeout(guard); res(); };
    const guard = setTimeout(() => { speechSynthesis.cancel(); finish(); }, 3000 + text.length * 110); // Chrome czasem gubi onend
    stopCurrent = () => { speechSynthesis.cancel(); finish(); };
    u.onstart = () => { browserSpeaking = true; };
    u.onend = u.onerror = finish;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  });
}
async function speakOpenAI(text) {
  const mp3 = await mouthTTS({ text, voice: isWitch() ? cfg.voiceWitch : cfg.voice, instructions: tx().tts[charKey()] });
  const buf = await ac.decodeAudioData(mp3);
  if (ac.state === 'suspended') await ac.resume().catch(() => {});
  const witch = isWitch();
  const src = ac.createBufferSource(); src.buffer = buf; src.playbackRate.value = witch ? 1 : (+cfg.pitch || .85);
  const sh = ac.createWaveShaper(); sh.curve = distCurve(1.8);
  const low = filt('lowshelf', 220); low.gain.value = 9;
  const ring = ac.createGain(); ring.gain.value = 0; const rm = osc('sine', 34); rm.connect(ring.gain); rm.start();
  const ringMix = ac.createGain(); ringMix.gain.value = witch ? .12 : .45;
  const an = ac.createAnalyser(); an.fftSize = 512; ttsBuf = new Float32Array(512); ttsAnalyser = an;
  src.connect(sh).connect(low);
  low.connect(ring).connect(ringMix);           // modulacja pierścieniowa = demoniczny pomruk
  out(low, .45); out(ringMix, .3);
  low.connect(an);
  await new Promise(res => {
    const guard = setTimeout(res, (buf.duration / src.playbackRate.value) * 1000 + 2000); // gdy onended nie przyjdzie
    src.onended = () => { clearTimeout(guard); res(); };
    stopCurrent = () => { try { src.stop(); } catch {} clearTimeout(guard); res(); };
    src.start();
  });
  rm.stop(); [src, sh, low, ring, rm, ringMix, an].forEach(n => { try { n.disconnect(); } catch {} });
  if (ttsAnalyser === an) ttsAnalyser = null;
}

// =====================================================================
//  INTERFEJS
// =====================================================================
const FIELDS = ['lang', 'look', 'theme', 'quality', 'ambient', 'candle', 'volume', 'family', 'ambientSound', 'servo', 'auto', 'doze', 'camera', 'camInvert',
  'bell', 'riddles', 'remote', 'aiOn', 'llm', 'nvidiaModel', 'model', 'persona', 'personaWitch', 'stt', 'whisperUrl', 'whisperModel', 'threshold', 'tts', 'voice', 'voiceWitch', 'pitch'];
const el = k => document.getElementById('cfg-' + k);
function applyI18n() {
  const ui = tx().ui;
  document.documentElement.lang = cfg.lang;
  document.querySelectorAll('[data-i18n]').forEach(e => { const v = ui[e.dataset.i18n]; if (v != null) e.textContent = v; });
  document.querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = ui[e.dataset.i18nPh] || ''; });
  document.getElementById('hotkeys').innerHTML = ui.hotkeys; // statyczny tekst z i18n.js
  const box = document.getElementById('fx-buttons'); box.textContent = '';
  for (const [k, name] of Object.entries(FX_KEYS)) {
    if (cfg.family && FAMILY_BLOCKED.has(name)) continue;
    const b = document.createElement('button'); b.textContent = `${k.toUpperCase()} · ${tx().fx[name]}`;
    b.onclick = () => fx(name); box.appendChild(b);
  }
  el('stt').querySelector('[value=webspeech]').hidden = !!DESKTOP;
  renderKeyFields();
}
function loadForm() {
  for (const k of FIELDS) {
    const e = el(k);
    if (e.type === 'checkbox') e.checked = !!cfg[k];
    else if (k === 'persona' || k === 'personaWitch') e.value = cfg[k] || tx().persona[k === 'persona' ? 'skull' : 'witch'];
    else e.value = cfg[k];
  }
}
async function readForm() {
  const was = { remote: cfg.remote, camera: cfg.camera, quality: cfg.quality, lang: cfg.lang, look: cfg.look, family: cfg.family };
  for (const k of FIELDS) {
    const e = el(k);
    cfg[k] = e.type === 'checkbox' ? e.checked : (e.type === 'number' || e.type === 'range') ? +e.value : e.value;
  }
  // osobowość zapisujemy tylko, gdy różni się od domyślnej (żeby aktualizacje promptów docierały do ludzi)
  if (cfg.persona.trim() === L[was.lang].persona.skull.trim() || cfg.persona.trim() === tx().persona.skull.trim()) cfg.persona = '';
  if (cfg.personaWitch.trim() === L[was.lang].persona.witch.trim() || cfg.personaWitch.trim() === tx().persona.witch.trim()) cfg.personaWitch = '';
  validateCfg(); saveCfg(); buildSprites();
  for (const n of KEY_NAMES) { const v = document.getElementById('key-' + n).value.trim(); if (v) await Keys.set(n, v); }
  await Keys.refresh();
  if (cfg.quality !== was.quality) { renderScale = +cfg.quality; resizeGL(); }
  if (master) master.gain.value = +cfg.volume;
  setAmbient(cfg.ambientSound);
  if (cfg.look !== was.look || cfg.lang !== was.lang) history.length = 0; // inna postać = nowa rozmowa
  if (cfg.lang !== was.lang || cfg.family !== was.family) { applyI18n(); loadForm(); }
  if (cfg.camera !== was.camera && S.mode !== 'sleep') cfg.camera ? startCamera() : stopCamera();
  if (cfg.stt === 'webspeech' && !rec && S.mode !== 'sleep') startWebSpeech();
  if (cfg.remote !== was.remote) setRemote(cfg.remote);
}
let toastTimer;
function toast(msg) {
  const e = document.getElementById('toast'); e.textContent = msg; e.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('show'), 2200);
}
document.getElementById('save').onclick = () => readForm();
document.getElementById('test').onclick = async () => {
  await readForm(); const b = document.getElementById('test'); b.textContent = tx().ui.testing;
  const t0 = performance.now();
  try {
    const r = await brain({ provider: cfg.llm, model: cfg.llm === 'nvidia' ? cfg.nvidiaModel : cfg.model, system: systemPrompt(),
      messages: [{ role: 'user', content: cfg.lang === 'pl' ? 'Przedstaw się jednym zdaniem.' : 'Introduce yourself in one sentence.' }] });
    const reply = shortReply(r.text.replace(/\[[^\]]+\]/g, ''));
    S.lastText = `💀 (${((performance.now() - t0) / 1000).toFixed(1)} s) ${reply}`; toast(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
    if (ac) speak(reply);
  } catch (e) { reportError(e); toast(S.lastText); }
  b.textContent = tx().ui.test;
};
['theme', 'ambient', 'candle', 'quality', 'volume', 'look', 'lang', 'family'].forEach(k => el(k).addEventListener('change', () => readForm()));
document.getElementById('say').onkeydown = e => {
  if (e.key === 'Enter' && e.target.value.trim()) { const s = e.target.value.trim(); e.target.value = ''; S.lastText = '💀 ' + s; speak(s); }
};
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return; // nie przechwytuj skrótów systemowych ani przytrzymania
  const k = e.key.toLowerCase();
  if (FX_KEYS[k]) fx(FX_KEYS[k]);
  else if (k === 'h') document.body.classList.toggle('ui');
  else if (k === 'd') document.body.classList.toggle('nodebug');
  else if (k === 'f') { if (DESKTOP) DESKTOP.toggleFullscreen(); else document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (k === 'escape') hush();
  else if (k === 'a') { cfg.ambientSound = !cfg.ambientSound; setAmbient(cfg.ambientSound); loadForm(); saveCfg(); }
  else if (k === 'k') { const Ls = CHOICES.look; cfg.look = Ls[(Ls.indexOf(cfg.look) + 1) % Ls.length]; history.length = 0; loadForm(); saveCfg(); }
  else if (k >= '1' && k <= '5') { cfg.theme = CHOICES.theme[+k - 1]; loadForm(); saveCfg(); buildSprites(); }
  else if (k === ' ') { S.micOn = !S.micOn; e.preventDefault(); toast(S.micOn ? tx().ui.micOn : tx().ui.micOff); }
});

// =====================================================================
//  PILOT W TELEFONIE (serwer działa w procesie głównym — desktop/remote.js)
// =====================================================================
async function setRemote(on, newToken) {
  const box = document.getElementById('remote-qr');
  if (!DESKTOP) return;
  try {
    const r = await DESKTOP.remote.set(on, newToken);
    box.hidden = !r;
    if (r) { document.getElementById('remote-img').src = r.qr; document.getElementById('remote-url').textContent = r.url; }
  } catch (e) { box.hidden = true; reportError(e); }
}
function remoteStatus() {
  return {
    lang: cfg.lang, mode: S.dozing ? 'sleep' : S.mode, look: cfg.look, mic: S.micOn, ai: cfg.aiOn, family: cfg.family,
    heard: S.heard || '', said: S.said || '',
    fx: Object.values(FX_KEYS).filter(id => !(cfg.family && FAMILY_BLOCKED.has(id))).map(id => ({ id, label: tx().fx[id] })),
    quick: [...lines().greet.slice(0, 3), ...lines().laugh.slice(0, 2)],
  };
}
function handleRemote({ cmd, arg }) {
  document.getElementById('start')?.click(); // komenda z telefonu budzi potwora
  switch (cmd) {
    case 'say': if (arg) { S.lastText = '📱 ' + arg; speak(String(arg)); } break;
    case 'fx': if (Object.values(FX_KEYS).includes(arg)) fx(arg); break;
    case 'look': if (CHOICES.look.includes(arg)) { cfg.look = arg; history.length = 0; loadForm(); saveCfg(); } break;
    case 'mic': S.micOn = !!arg; toast(S.micOn ? tx().ui.micOn : tx().ui.micOff); break;
    case 'hush': hush(); break;
    case 'ai': cfg.aiOn = !!arg; loadForm(); saveCfg(); break;
    case 'family': cfg.family = !!arg; applyI18n(); loadForm(); saveCfg(); break;
  }
}
if (DESKTOP) {
  DESKTOP.remote.onCommand(handleRemote);
  setInterval(() => { if (cfg.remote) DESKTOP.remote.status(remoteStatus()); }, 400); // serwer wysyła tylko zmiany
  document.getElementById('remote-new').onclick = () => setRemote(true, true);
}

// utrata kontekstu WebGL (reset sterownika, uśpienie) — odtwórz shadery zamiast czarnego ekranu do rana
GLC.addEventListener('webglcontextlost', e => { e.preventDefault(); prog = null; });
GLC.addEventListener('webglcontextrestored', () => { PROGS = {}; VS = null; try { initGL(); } catch (err) { S.lastText = '⚠ Shader: ' + err.message; } });

document.getElementById('start').onclick = async () => {
  document.getElementById('start').remove();
  initSound();
  try { await initMic(); } catch (e) { S.lastText = '⚠ Mic: ' + e.message; }
  setMode('idle'); S.flare = 1.2; whoosh(); boneCrack();
  vadLoop();
  if (cfg.stt === 'webspeech') startWebSpeech();
  if (cfg.camera) startCamera();
  if (DESKTOP) DESKTOP.setFullscreen(true); else document.documentElement.requestFullscreen?.().catch(() => {});
};

(async () => {
  speechSynthesis.getVoices();
  renderScale = +cfg.quality;
  if (STATIC_DEMO) document.getElementById('demo-banner').hidden = false;
  loadForm(); buildSprites(); buildGhost();
  await Keys.refresh().catch(() => {});
  for (const [n, v] of Object.entries(legacyKeys)) await Keys.set(n, v); // przeniesienie kluczy z prototypu
  if (Object.keys(legacyKeys).length) await Keys.refresh();
  applyI18n();
  document.getElementById('remote-box').hidden = !DESKTOP; document.getElementById('remote-browser').hidden = !!DESKTOP;
  if (DESKTOP && cfg.remote) setRemote(true);
  if (!gl) { S.lastText = '⚠ ' + tx().ui.noWebgl; document.body.classList.remove('nodebug'); }
  else try { initGL(); } catch (e) { console.error(e); document.body.classList.remove('nodebug'); S.lastText = '⚠ Shader: ' + e.message; }
  resize();
  requestAnimationFrame(frame);
  if (DESKTOP && DESKTOP.flags.autostart) setTimeout(() => document.getElementById('start')?.click(), 1500); // tryb kiosku po restarcie
})();
