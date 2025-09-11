const _maybeFetch = global.fetch || require('node-fetch');
const fetch = (...args) => _maybeFetch(...args);

function env(n, d){ return process.env[n] ?? d; }

const SYSTEM = `You extract resilient CSS selectors for product pages.
Rules:
- Output ONLY a compact JSON array of CSS selectors (strings). No prose.
- 1 to 4 selectors. Most specific first.
- Prefer attributes with stable semantics: [itemprop], [data-*], meta tags, and JSON-LD.
- For images: target IMG or <picture> sources of the main gallery, not logos or sprites.
- For price: prefer elements with numeric attributes (content, data-price, aria-label); avoid blocks that include percentages.
- For title: <h1>, [itemprop="name"].
- For brand: [itemprop="brand"], or schema.org JSON-LD.
- For description: [itemprop="description"], meta description fallback.
- Keep selectors general for the domain, avoid IDs with random hashes.`;

function buildUser(html, label, url) {
  const trimmed = String(html || '').slice(0, 120000);
  return `URL: ${url}\nField: ${label}\nHTML:\n${trimmed}`;
}

function safeParseArray(s) {
  try { const x = JSON.parse(s); if (Array.isArray(x)) return x.filter(v => typeof v === 'string').slice(0,4); } catch {}
  const m = String(s).match(/\[[\s\S]*\]/);
  if (m) { try { const x = JSON.parse(m[0]); if (Array.isArray(x)) return x.filter(v => typeof v === 'string').slice(0,4); } catch {} }
  return [];
}

async function openaiPropose({ html, label, url, model, apiKey }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUser(html, label, url) }
    ],
    temperature: 0.1, max_tokens: 300
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST', headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content?.trim() || '[]';
  return safeParseArray(txt);
}

async function anthropicPropose({ html, label, url, model, apiKey }) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const body = { model, max_tokens:300, temperature:0.1, system:SYSTEM, messages:[{ role:'user', content: buildUser(html,label,url) }] };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{ 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json' }, body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const txt = (data.content?.[0]?.text || '[]').trim();
  return safeParseArray(txt);
}

async function proposeSelectors({ html, label, url, provider = {} }) {
  const name = (provider.name || env('LLM_PROVIDER', 'openai')).toLowerCase();
  if (name === 'anthropic') {
    return anthropicPropose({ html, label, url, model: provider.model || env('ANTHROPIC_MODEL','claude-3-haiku-20240307'), apiKey: provider.apiKey || env('ANTHROPIC_API_KEY') });
  }
  return openaiPropose({ html, label, url, model: provider.model || env('OPENAI_MODEL','gpt-4o-mini'), apiKey: provider.apiKey || env('OPENAI_API_KEY') });
}
module.exports = { proposeSelectors };
