/* Hauntface landing page — tiny, dependency-free. Everything here is progressive enhancement. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = document.documentElement;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- storage (may throw in private modes) ----------
  const store = {
    get(k) { try { return localStorage.getItem('hf.' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('hf.' + k, v); } catch (e) { /* ignore */ } },
  };

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------- i18n ----------
  const DL = 'https://github.com/bartoszkolo/hauntface/releases/latest/download/';
  const T = {
    en: {
      title: 'Hauntface — a living, talking AI monster face for your Halloween prop',
      away: 'Come back…', back: 'I saw you leave.',
      dl: 'Download', win: 'Download for Windows', mac: 'Download for macOS', linux: 'Download for Linux',
      demo: 'Try the demo', latest: 'Latest:', calm: 'Calm mode on — no flashes', calmOff: 'Calm mode off',
      touched: "Don't touch me.", notyet: 'Not yet…',
    },
    pl: {
      title: 'Hauntface — żywa, gadająca twarz potwora AI do twojej dekoracji na Halloween',
      away: 'Wróć… widzę cię', back: 'Widziałam, jak wychodzisz.',
      dl: 'Pobierz', win: 'Pobierz na Windows', mac: 'Pobierz na macOS', linux: 'Pobierz na Linuksa',
      demo: 'Wypróbuj demo', latest: 'Najnowsza wersja:', calm: 'Tryb spokojny włączony — bez błysków', calmOff: 'Tryb spokojny wyłączony',
      touched: 'Nie dotykaj mnie.', notyet: 'Jeszcze nie…',
    },
  };
  let lang = store.get('lang') || ((navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en');
  const t = (k) => T[lang][k];
  const ATTRS = [['plTitle', 'title'], ['plLabel', 'aria-label'], ['plAlt', 'alt']];

  function applyLang(l) {
    lang = l;
    root.lang = l;
    $$('[data-pl]').forEach((el) => {
      if (el.dataset.en === undefined) el.dataset.en = el.innerHTML;
      el.innerHTML = l === 'pl' ? el.dataset.pl : el.dataset.en;
    });
    ATTRS.forEach(([key, attr]) => {
      $$('[data-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ']').forEach((el) => {
        const enKey = 'en' + attr.replace(/-/g, '');
        if (el.dataset[enKey] === undefined) el.dataset[enKey] = el.getAttribute(attr) || '';
        el.setAttribute(attr, l === 'pl' ? el.dataset[key] : el.dataset[enKey]);
      });
    });
    $$('#langBtn [data-l]').forEach((s) => s.classList.toggle('on', s.dataset.l === l));
    if (!document.hidden) document.title = t('title');
    headline.dataset.text = headline.textContent;
    setupDownloadCTA();
    showVersion();
    whisperIn(true);
  }

  // ---------- OS detection & download CTA ----------
  function detectOS() {
    const ua = navigator.userAgent || '';
    const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    const s = p + ' ' + ua;
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Mac/i.test(p) && navigator.maxTouchPoints > 1)) return 'mobile';
    if (/Win/i.test(s)) return 'win';
    if (/Mac/i.test(s)) return 'mac';
    if (/Linux|X11|CrOS/i.test(s)) return 'linux';
    return 'unknown';
  }
  const os = detectOS();
  const FILES = { win: 'Hauntface-win-x64.exe', mac: 'Hauntface-mac-arm64.dmg', linux: 'Hauntface-linux-x86_64.AppImage' };

  function setupDownloadCTA() {
    const btn = $('#heroDl'), demo = $('#heroDemo');
    $$('.stone').forEach((s) => s.classList.toggle('is-yours', s.dataset.os === os));
    if (os === 'mobile') {
      btn.textContent = t('demo');
      btn.href = '/demo/';
      demo.hidden = true;
      $('#heroNote').hidden = true;
      $('#mobileNote').hidden = false;
    } else if (FILES[os]) {
      btn.textContent = t(os);
      btn.href = DL + FILES[os];
    } else {
      btn.textContent = t('dl');
      btn.href = '#download';
    }
  }

  // ---------- latest version (best effort, silent) ----------
  let version = '';
  function showVersion() {
    const el = $('#dlVersion');
    if (el) el.textContent = version ? t('latest') + ' ' + version + ' ·' : '';
  }
  function fetchVersion() {
    if (!window.fetch) return;
    fetch('https://api.github.com/repos/bartoszkolo/hauntface/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && j.tag_name) { version = String(j.tag_name).slice(0, 24); showVersion(); } })
      .catch(() => {});
  }

  // ---------- calm mode ----------
  let calm = store.get('calm') === null ? reduced() : store.get('calm') === '1';
  function applyCalm(v, persist) {
    calm = v;
    root.classList.toggle('calm', v);
    $('#calmBtn').setAttribute('aria-pressed', String(v));
    if (persist) store.set('calm', v ? '1' : '0');
  }

  // ---------- sound (Web Audio, synthesized, off by default) ----------
  const Sound = {
    ctx: null, master: null, on: false, noise: null, beatTimer: 0, proximity: 0, heroVisible: true, lastWhisper: 0,
    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const c = this.ctx = new AC();
      this.master = c.createGain();
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      // shared 2 s white-noise buffer
      const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      this.drone();
      this.wind();
      return true;
    },
    lfo(freq, depth, target) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = freq; g.gain.value = depth;
      o.connect(g).connect(target); o.start();
    },
    drone() { // low, slowly breathing detuned saws
      const c = this.ctx, f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 170; f.Q.value = 7;
      g.gain.value = 0.11;
      [43.65, 43.95, 87.1].forEach((hz, i) => {
        const o = c.createOscillator();
        o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = hz;
        o.connect(f); o.start();
      });
      this.lfo(0.07, 60, f.frequency);
      f.connect(g).connect(this.master);
    },
    wind() {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.loop = true;
      f.type = 'bandpass'; f.frequency.value = 480; f.Q.value = 0.9;
      g.gain.value = 0.05;
      this.lfo(0.11, 280, f.frequency);
      this.lfo(0.17, 0.03, g.gain);
      s.connect(f).connect(g).connect(this.master); s.start();
    },
    thump(t, amp) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.14);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.3);
    },
    heartbeat() { // speeds up as the cursor nears the eyes
      clearTimeout(this.beatTimer);
      if (!this.on) return;
      const bpm = 52 + this.proximity * 98;
      if (this.heroVisible) {
        const now = this.ctx.currentTime + 0.02, a = 0.35 + this.proximity * 0.45;
        this.thump(now, a); this.thump(now + 0.27, a * 0.65);
      }
      this.beatTimer = setTimeout(() => this.heartbeat(), 60000 / bpm);
    },
    whisper() { // breathy formant-swept noise, randomly panned
      if (!this.on) return;
      const nowMs = performance.now();
      if (nowMs - this.lastWhisper < 1400) return;
      this.lastWhisper = nowMs;
      const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), h = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; s.playbackRate.value = 0.9;
      f.type = 'bandpass'; f.Q.value = 5; h.type = 'highpass'; h.frequency.value = 900;
      const dur = rand(0.8, 1.3);
      for (let x = 0; x < dur; x += 0.12) f.frequency.setValueAtTime(rand(1400, 3800), t + x);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
      g.gain.setValueAtTime(0.35, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = s.connect(f).connect(h).connect(g);
      if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = rand(-0.9, 0.9); node = node.connect(p); }
      node.connect(this.master);
      s.start(t, rand(0, 1)); s.stop(t + dur + 0.05);
    },
    scream() { // boom + distorted screech + shattering glass
      if (!this.on) return;
      const c = this.ctx, t = c.currentTime, sh = c.createWaveShaper(), curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 4); }
      sh.curve = curve;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
      sh.connect(g).connect(this.master);
      [1, 1.49].forEach((m) => {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(620 * m, t); o.frequency.linearRampToValueAtTime(1250 * m, t + 0.25); o.frequency.exponentialRampToValueAtTime(380 * m, t + 1.3);
        const v = c.createOscillator(), vg = c.createGain(); v.frequency.value = 28; vg.gain.value = 45 * m;
        v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + 1.35);
        o.connect(sh); o.start(t); o.stop(t + 1.35);
      });
      this.thump(t, 0.9);
      // glass: noise burst + random high pings
      const n = c.createBufferSource(), hp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = this.noise; hp.type = 'highpass'; hp.frequency.value = 3000;
      ng.gain.setValueAtTime(0.4, t + 0.05); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      n.connect(hp).connect(ng).connect(this.master); n.start(t + 0.05); n.stop(t + 0.7);
      for (let i = 0; i < 22; i++) {
        const st = t + 0.05 + Math.random() * 0.6, o = c.createOscillator(), og = c.createGain();
        o.type = 'triangle'; o.frequency.value = rand(2200, 7000);
        og.gain.setValueAtTime(0.12, st); og.gain.exponentialRampToValueAtTime(0.0001, st + rand(0.05, 0.25));
        o.connect(og).connect(this.master); o.start(st); o.stop(st + 0.3);
      }
    },
    enable() {
      if (!this.ctx && !this.init()) return;
      this.ctx.resume();
      this.on = true;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.6);
      this.heartbeat();
    },
    disable() {
      this.on = false;
      clearTimeout(this.beatTimer);
      if (!this.ctx) return;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      setTimeout(() => { if (!this.on) this.ctx.suspend(); }, 500);
    },
  };
  function setSound(v) {
    v ? Sound.enable() : Sound.disable();
    $('#soundBtn').setAttribute('aria-pressed', String(Sound.on));
    $('#dareBtn').setAttribute('aria-pressed', String(Sound.on));
  }

  // ---------- hero: darkness, light, embers, eyes ----------
  const hero = $('.hero'), canvas = $('#night'), ctx = canvas.getContext('2d'), eyesBtn = $('#eyes'), headline = $('#headline');
  let W = 0, H = 0, dpr = 1, eyeX = 0, eyeY = 0, eyeW = 70, gap = 140;
  const light = { x: 0, y: 0, tx: 0, ty: 0, auto: !finePointer, lastMove: 0 };
  const eye = { lookX: 0, lookY: 0, open: 1, target: 1, blinkT: 0, nextBlink: 2500, lunge: 0, stare: 0 };
  let embers = [], heroOn = true, raf = 0, last = 0;

  function resize() {
    const r = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const e = eyesBtn.getBoundingClientRect();
    eyeX = e.left - r.left + e.width / 2; eyeY = e.top - r.top + e.height / 2;
    eyeW = clamp(W * 0.065, 44, 104); gap = eyeW * 2.9;
    const n = W < 600 ? 22 : 46;
    if (embers.length !== n) embers = Array.from({ length: n }, () => newEmber(true));
    if (!light.tx) { light.x = light.tx = W / 2; light.y = light.ty = eyeY + 40; }
  }
  function newEmber(anywhere) {
    return { x: rand(0, W), y: anywhere ? rand(0, H) : H + 10, v: rand(12, 40), s: rand(0.6, 2.2), ph: rand(0, 6.28), life: rand(0.5, 1) };
  }

  function almond(cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx - w, cy);
    ctx.quadraticCurveTo(cx, cy - h * 2, cx + w, cy + h * 0.15);
    ctx.quadraticCurveTo(cx, cy + h * 1.6, cx - w, cy);
    ctx.closePath();
  }
  function drawEye(cx, cy, side, open, now) {
    const w = eyeW * (1 + eye.lunge * 0.7), h = w * 0.44 * open;
    if (!isFinite(cx + cy + w + h)) { eye.lunge = 0; eye.open = 1; return; } // never let a NaN kill the loop
    // glow in the dark
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 2.6);
    glow.addColorStop(0, 'rgba(255,90,20,' + (0.28 + eye.lunge * 0.4) * Math.max(open, 0.25) + ')');
    glow.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - w * 2.6, cy - w * 2.6, w * 5.2, w * 5.2);
    if (h < 0.6) { ctx.fillStyle = 'rgba(255,120,40,.6)'; ctx.fillRect(cx - w, cy, w * 2, 1); return; }
    ctx.save();
    ctx.scale(side, 1); // mirror the almond for the left eye
    almond(cx * side, cy, w, h);
    ctx.restore();
    ctx.save();
    ctx.clip();
    const flick = 0.92 + Math.sin(now * 0.013 + side) * 0.05 + Math.random() * 0.04;
    const ix = cx + eye.lookX * w * 0.38, iy = cy + eye.lookY * h * 0.5;
    const iris = ctx.createRadialGradient(ix, iy, 0, ix, iy, w * 1.1);
    iris.addColorStop(0, 'rgba(255,236,170,' + flick + ')');
    iris.addColorStop(0.25, '#ffc23a');
    iris.addColorStop(0.6, '#ff4a12');
    iris.addColorStop(1, '#3a0600');
    ctx.fillStyle = iris;
    ctx.fillRect(cx - w * 1.2, cy - h * 2.2, w * 2.4, h * 4.4);
    // slit pupil — thinner when narrowed / staring
    const pw = w * (0.09 + (1 - eye.target) * 0.02 - eye.stare * 0.04);
    ctx.fillStyle = '#080000';
    ctx.beginPath();
    ctx.ellipse(ix, iy, Math.max(pw, 1.5), h * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    raf = 0;
    if (!heroOn || document.hidden) return;
    if (!W || !H) { resize(); if (!W || !H) return; }
    const dt = clamp(((now - last) / 1000) || 0, 0, 0.05); last = now; // first frame: last is unset
    const still = reduced();

    // light: follows pointer; on touch / idle it sweeps by itself
    if (!still && (light.auto || now - light.lastMove > 6000)) {
      const k = now / 1000;
      light.tx = W / 2 + Math.sin(k * 0.37) * W * 0.34;
      light.ty = H * 0.42 + Math.sin(k * 0.53 + 1) * H * 0.25;
    }
    const ease = still ? 1 : 0.12;
    light.x += (light.tx - light.x) * ease; light.y += (light.ty - light.y) * ease;
    const lr = (W < 600 ? 190 : 290) * (calm || still ? 1 : 0.96 + Math.random() * 0.06);
    hero.style.setProperty('--lx', light.x.toFixed(1) + 'px');
    hero.style.setProperty('--ly', light.y.toFixed(1) + 'px');
    hero.style.setProperty('--lr', lr.toFixed(0) + 'px');

    // eyes look toward the light, slowly
    const dx = light.x - eyeX, dy = light.y - eyeY, dist = Math.hypot(dx, dy);
    eye.lookX += (clamp(dx / (W * 0.4), -1, 1) - eye.lookX) * 0.06;
    eye.lookY += (clamp(dy / (H * 0.5), -1, 1) - eye.lookY) * 0.06;
    if (!isFinite(eye.lookX + eye.lookY)) eye.lookX = eye.lookY = 0;
    Sound.proximity = clamp(1 - dist / 700, 0, 1);
    eye.target = dist < 170 ? 0.45 : 1; // narrow when you get close
    if (eye.stare > 0) { eye.target = 1.25; eye.stare = Math.max(0, eye.stare - dt * 0.6); }
    // blink
    eye.nextBlink -= dt * 1000;
    if (eye.nextBlink <= 0) { eye.blinkT = 1; eye.nextBlink = Math.random() < 0.2 ? 260 : rand(2600, 7000); }
    let open = eye.target;
    if (eye.blinkT > 0) { eye.blinkT = Math.max(0, eye.blinkT - dt * 6); open *= Math.abs(eye.blinkT * 2 - 1); }
    eye.open += (open - eye.open) * 0.35;
    eye.lunge = Math.max(0, eye.lunge - dt * 1.6);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // embers
    ctx.globalCompositeOperation = 'lighter';
    for (const p of embers) {
      if (!still) { p.y -= p.v * dt; p.x += Math.sin(now / 900 + p.ph) * 0.3; p.life -= dt * 0.05; }
      if (p.y < -10 || p.life <= 0) Object.assign(p, newEmber(false));
      const a = clamp(p.life, 0, 1) * (0.5 + 0.5 * Math.sin(now / 160 + p.ph));
      ctx.fillStyle = 'rgba(255,' + (110 + (p.ph * 20 | 0)) + ',30,' + (a * 0.8).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.283); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const sc = 1 + eye.lunge * 0.5;
    drawEye(eyeX - gap / 2 * sc, eyeY, -1, eye.open, now);
    drawEye(eyeX + gap / 2 * sc, eyeY, 1, Math.min(eye.open * 1.03, 1.3), now);
    schedule();
  }
  function schedule() { if (!raf && heroOn && !document.hidden) raf = requestAnimationFrame(frame); }

  function pointer(e) {
    const r = hero.getBoundingClientRect();
    light.tx = e.clientX - r.left; light.ty = e.clientY - r.top;
    light.lastMove = performance.now();
    if (e.pointerType !== 'touch') light.auto = false;
  }

  // ---------- scares ----------
  let souls = Number(store.get('souls') || 0);
  function cracks(x, y) {
    const svg = $('#cracks'), n = 9;
    let d = '';
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), px = x, py = y;
      d += 'M' + px + ' ' + py;
      for (let s = 0; s < 6; s++) { const len = rand(40, 130); a += rand(-0.5, 0.5); px += Math.cos(a) * len; py += Math.sin(a) * len; d += 'L' + px.toFixed(0) + ' ' + py.toFixed(0); }
    }
    svg.setAttribute('viewBox', '0 0 ' + innerWidth + ' ' + innerHeight);
    svg.innerHTML = '<path d="' + d + '"/>';
    svg.classList.add('on');
    setTimeout(() => svg.classList.remove('on'), 120);
  }
  function scare(e) {
    souls += 1; store.set('souls', souls); $('#souls').textContent = souls;
    eye.stare = 1.5; eye.blinkT = 0;
    if (calm || reduced()) { Sound.whisper(); whisperSay(t('notyet')); return; }
    eye.lunge = 1;
    hero.classList.remove('shake'); void hero.offsetWidth; hero.classList.add('shake');
    const f = $('.fx-flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 90);
    const r = eyesBtn.getBoundingClientRect();
    cracks(e && e.clientX ? e.clientX : r.left + r.width / 2, e && e.clientY ? e.clientY : r.top + r.height / 2);
    Sound.scream();
    whisperSay(t('touched'));
    schedule();
  }

  // ---------- typed whisper line ----------
  const typed = $('#typed'), typedWrap = typed.parentElement;
  let typeTimer = 0, revertTimer = 0;
  function typeText(text) {
    clearTimeout(typeTimer);
    if (reduced()) { typed.textContent = text; return; }
    let i = 0;
    typed.textContent = '';
    typedWrap.classList.add('typing');
    const step = () => {
      typed.textContent = text.slice(0, ++i);
      if (i < text.length) typeTimer = setTimeout(step, text[i - 1] === ' ' ? rand(120, 260) : rand(60, 150));
      else typeTimer = setTimeout(() => typedWrap.classList.remove('typing'), 2400);
    };
    typeTimer = setTimeout(step, 300);
  }
  function whisperIn(langChanged) { // restore the language's default line
    clearTimeout(revertTimer);
    const text = lang === 'pl' ? typed.dataset.pl : typed.dataset.en || typed.textContent;
    if (langChanged && !started) { typed.textContent = text; return; }
    typeText(text);
  }
  function whisperSay(text) {
    typeText(text);
    clearTimeout(revertTimer);
    revertTimer = setTimeout(() => whisperIn(false), 3500);
  }
  let started = false;

  // ---------- ambient scheduler: flicker, glitch, subliminal skull ----------
  function later(fn, a, b) { setTimeout(fn, rand(a, b)); }
  function ambient() {
    const ok = () => !calm && !reduced() && !document.hidden;
    later(function flicker() { // max 2 dips, 450 ms apart (< 3 Hz)
      if (ok()) {
        const el = $('.fx-flicker'), dip = () => { el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 80); };
        dip(); if (Math.random() < 0.5) setTimeout(dip, 450);
      }
      later(flicker, 9000, 18000);
    }, 6000, 12000);
    later(function glitch() {
      if (ok()) { headline.classList.add('glitching'); setTimeout(() => headline.classList.remove('glitching'), 340); }
      later(glitch, 5000, 11000);
    }, 3000, 6000);
    later(function skull() { // ~2 frames, low opacity
      if (ok()) { const s = $('#skull'); s.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => s.classList.remove('on'), 16))); }
      later(skull, 20000, 40000);
    }, 20000, 40000);
  }

  // ---------- film grain texture (generated once) ----------
  function makeNoise() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    root.style.setProperty('--noise', 'url(' + c.toDataURL() + ')');
  }

  // ---------- CRT: show demo.mp4 if it exists ----------
  function tryVideo() {
    const v = document.createElement('video');
    Object.assign(v, { muted: true, loop: true, playsInline: true, preload: 'metadata' });
    v.setAttribute('aria-hidden', 'true');
    v.addEventListener('loadeddata', () => { $('#crt').appendChild(v); if (!reduced()) v.play().catch(() => {}); }, { once: true });
    v.addEventListener('error', () => {}, { once: true });
    v.src = 'assets/demo.mp4';
  }

  // ---------- misc ----------
  function clock() {
    const el = $('#clock'), tick = () => {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      el.textContent = d.getHours() === 0 ? 'THE WITCHING HOUR' : p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    };
    tick(); setInterval(tick, 1000);
  }
  function reveals() {
    const els = $$('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  }

  // ---------- boot ----------
  function boot() {
    applyLang(lang);
    applyCalm(calm, false);
    $('#souls').textContent = souls;
    fetchVersion();
    makeNoise();
    reveals();
    clock();
    tryVideo();
    ambient();

    $('#langBtn').addEventListener('click', () => { applyLang(lang === 'en' ? 'pl' : 'en'); store.set('lang', lang); });
    const toggleCalm = () => applyCalm(!calm, true);
    $('#calmBtn').addEventListener('click', toggleCalm);
    $('#calmLink').addEventListener('click', toggleCalm);
    $('#soundBtn').addEventListener('click', () => setSound(!Sound.on));
    $('#dareBtn').addEventListener('click', () => setSound(!Sound.on));
    document.addEventListener('pointerover', (e) => { if (e.target.closest && e.target.closest('.w')) Sound.whisper(); });

    // hero
    resize();
    window.addEventListener('resize', resize);
    hero.addEventListener('pointermove', pointer, { passive: true });
    hero.addEventListener('pointerdown', pointer, { passive: true });
    eyesBtn.addEventListener('click', scare);
    new IntersectionObserver((ents) => {
      heroOn = ents[0].isIntersecting;
      Sound.heroVisible = heroOn;
      root.classList.toggle('torch-on', finePointer && !heroOn && !reduced());
      schedule();
    }).observe(hero);
    if (finePointer) {
      const torch = $('.fx-torch');
      window.addEventListener('pointermove', (e) => {
        torch.style.setProperty('--px', e.clientX + 'px');
        torch.style.setProperty('--py', e.clientY + 'px');
      }, { passive: true });
    }

    // tab hidden → it notices
    let backTimer = 0;
    document.addEventListener('visibilitychange', () => {
      clearTimeout(backTimer);
      if (document.hidden) { document.title = t('away'); return; }
      document.title = t('back');
      backTimer = setTimeout(() => { document.title = t('title'); }, 2500);
      last = performance.now(); schedule();
    });

    setTimeout(() => { started = true; whisperIn(false); }, 900);
    last = performance.now();
    schedule();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
