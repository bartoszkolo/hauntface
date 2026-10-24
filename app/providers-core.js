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

  // o: { provider: 'nvidia'|'anthropic', model, system, messages }
  async function chat(o, ctx) {
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

  // o: { text, voice, instructions } -> ArrayBuffer (mp3)
  async function speak(o, ctx) {
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

  const api = { chat, transcribe, speak, isOpenAI };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HauntProviders = api;
})(typeof window !== 'undefined' ? window : globalThis);
