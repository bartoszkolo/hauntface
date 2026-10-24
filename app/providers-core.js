// Dostawcy AI: mózg (LLM), uszy (STT) i głos (TTS).
// Ten sam plik działa w przeglądarce (window.HauntProviders) i w procesie głównym Electrona (require).
// ctx: { key(name) -> string, nvidiaBase?, browser?, signal? }
(function (root) {
  const NVIDIA = 'https://integrate.api.nvidia.com';
  const OPENAI_HOST = 'api.openai.com';

  const clean = s => (s || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .trim();

  async function failWith(r, label) {
    let body = '';
    try { body = (await r.text()).slice(0, 200); } catch {}
    const err = new Error(`${label} ${r.status}: ${body}`);
    err.status = r.status;
    throw err;
  }

  const post = (url, key, body, signal) => fetch(url, {
    method: 'POST', signal, headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body),
  });
  // Szybkie modele czatu OpenAI w kolejności preferencji (nazwy modeli się zmieniają — wybieramy z tego, co konto ma)
  const OPENAI_PREFERRED = ['gpt-4.1-mini', 'gpt-4o-mini', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1-nano'];
  async function pickOpenAIModel(key, signal) {
    const r = await fetch('https://api.openai.com/v1/models', { signal, headers: { Authorization: 'Bearer ' + key } });
    if (!r.ok) await failWith(r, 'OpenAI');
    const ids = ((await r.json()).data || []).map(m => m.id);
    return OPENAI_PREFERRED.find(id => ids.includes(id))
      || ids.find(id => /^gpt-/.test(id) && !/audio|realtime|search|transcribe|tts|image|codex/.test(id))
      || 'gpt-4o-mini';
  }
  async function chatOpenAI(o, ctx) {
    const key = ctx.key('openai');
    if (!key) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
    const body = model => ({
      model, messages: [{ role: 'system', content: o.system }, ...o.messages], max_completion_tokens: 400,
      ...(/^(gpt-5|o\d)/.test(model) ? { reasoning_effort: 'minimal' } : {}), // modele rozumujące: bez długiego myślenia
    });
    let model = o.model || OPENAI_PREFERRED[0];
    let r = await post('https://api.openai.com/v1/chat/completions', key, body(model), ctx.signal);
    if (r.status === 404 || r.status === 400) { // model niedostępny na tym koncie — dobierz inny i spróbuj raz jeszcze
      const err = await r.clone().text();
      if (/model/i.test(err)) { model = await pickOpenAIModel(key, ctx.signal); r = await post('https://api.openai.com/v1/chat/completions', key, body(model), ctx.signal); }
    }
    if (!r.ok) await failWith(r, 'OpenAI');
    const msg = (await r.json()).choices?.[0]?.message || {};
    return { text: clean(msg.content), model, refusal: !!msg.refusal && !msg.content };
  }

  // o: { provider: 'openai'|'nvidia'|'anthropic', model, system, messages }
  async function chat(o, ctx) {
    if (o.provider === 'openai') return chatOpenAI(o, ctx);
    if (o.provider === 'nvidia') {
      const key = ctx.key('nvidia');
      if (!key && !ctx.browser) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
      const r = await fetch((ctx.nvidiaBase || NVIDIA) + '/v1/chat/completions', {
        method: 'POST', signal: ctx.signal,
        headers: { 'content-type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
        body: JSON.stringify({
          model: o.model, messages: [{ role: 'system', content: o.system }, ...o.messages],
          temperature: 0.8, top_p: 1, max_tokens: 1024, stream: false,
          chat_template_kwargs: { enable_thinking: false }, // bez "myślenia" — odpowiedź w 1–2 s
        }),
      });
      if (r.status === 404 && ctx.browser && !key) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
      if (!r.ok) await failWith(r, 'NVIDIA');
      const msg = (await r.json()).choices?.[0]?.message || {};
      return { text: clean(msg.content) };
    }

    const key = ctx.key('anthropic');
    if (!key) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
    const body = {
      model: o.model, max_tokens: 400, system: o.system, messages: o.messages,
      output_config: { effort: 'low' }, // krótka pogawędka: szybkość ważniejsza niż głębokie myślenie
    };
    const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
    if (ctx.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    if (o.model !== 'claude-haiku-5-5') { // model zapasowy, gdy filtr bezpieczeństwa odmówi
      body.fallbacks = 'default';
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctx.signal, headers, body: JSON.stringify(body) });
    if (!r.ok) await failWith(r, 'Claude');
    const data = await r.json();
    if (data.stop_reason === 'refusal') return { text: '', refusal: true };
    return { text: clean((data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ')) };
  }

  const isOpenAI = url => { try { return new URL(url).hostname === OPENAI_HOST; } catch { return false; } };

  // o: { blob, url, model, lang }  — klucz OpenAI idzie wyłącznie do api.openai.com
  async function transcribe(o, ctx) {
    const fd = new FormData();
    fd.append('file', o.blob, 'speech.webm');
    fd.append('model', o.model);
    fd.append('language', o.lang);
    const headers = {};
    if (isOpenAI(o.url)) {
      const key = ctx.key('openai');
      if (!key) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
      headers.Authorization = 'Bearer ' + key;
    }
    const r = await fetch(o.url, { method: 'POST', signal: ctx.signal, headers, body: fd });
    if (!r.ok) await failWith(r, 'Whisper');
    return ((await r.json()).text || '').trim();
  }

  // ---- ElevenLabs: najbardziej przekonujące straszne głosy (biblioteka społeczności)
  const EL = 'https://api.elevenlabs.io/v1';
  const elKey = ctx => { const k = ctx.key('elevenlabs'); if (!k) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' }); return k; };
  async function elevenSpeak(o, ctx) {
    const r = await fetch(`${EL}/text-to-speech/${encodeURIComponent(o.voice)}?output_format=mp3_44100_128`, {
      method: 'POST', signal: ctx.signal,
      headers: { 'content-type': 'application/json', 'xi-api-key': elKey(ctx) },
      body: JSON.stringify({
        text: o.text, model_id: o.model || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
      }),
    });
    if (!r.ok) await failWith(r, 'ElevenLabs');
    return await r.arrayBuffer();
  }
  const pickVoice = v => ({ id: v.voice_id, owner: v.public_owner_id || '', name: v.name, preview: v.preview_url || '',
    info: [v.gender || v.labels?.gender, v.age || v.labels?.age, v.descriptive || v.labels?.descriptive, v.language].filter(Boolean).join(' · ') });
  // o: { op: 'mine' } | { op: 'search', query } | { op: 'add', owner, id, name }
  async function eleven(o, ctx) {
    const headers = { 'xi-api-key': elKey(ctx) };
    if (o.op === 'mine') {
      const r = await fetch(`${EL}/voices`, { signal: ctx.signal, headers });
      if (!r.ok) await failWith(r, 'ElevenLabs');
      return ((await r.json()).voices || []).map(pickVoice);
    }
    if (o.op === 'search') {
      const q = new URLSearchParams({ search: String(o.query || ''), page_size: '24', sort: 'cloned_by_count' });
      const r = await fetch(`${EL}/shared-voices?${q}`, { signal: ctx.signal, headers });
      if (!r.ok) await failWith(r, 'ElevenLabs');
      return ((await r.json()).voices || []).map(pickVoice);
    }
    if (o.op === 'add') { // głos z biblioteki trzeba najpierw dodać do swojego konta
      const r = await fetch(`${EL}/voices/add/${encodeURIComponent(o.owner)}/${encodeURIComponent(o.id)}`, {
        method: 'POST', signal: ctx.signal, headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: String(o.name || 'Hauntface voice').slice(0, 60) }),
      });
      if (!r.ok) await failWith(r, 'ElevenLabs');
      return (await r.json()).voice_id || o.id;
    }
    throw new Error('bad op');
  }

  // o: { engine: 'openai'|'elevenlabs', text, voice, instructions, model } -> ArrayBuffer (mp3)
  async function speak(o, ctx) {
    if (o.engine === 'elevenlabs') return elevenSpeak(o, ctx);
    const key = ctx.key('openai');
    if (!key) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' });
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', signal: ctx.signal,
      headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: o.voice, input: o.text, response_format: 'mp3', instructions: o.instructions }),
    });
    if (!r.ok) await failWith(r, 'TTS');
    return await r.arrayBuffer();
  }

  const api = { chat, transcribe, speak, eleven, isOpenAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HauntProviders = api;
})(typeof window !== 'undefined' ? window : globalThis);
