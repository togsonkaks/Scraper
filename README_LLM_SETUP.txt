
LLM SETUP (OpenAI or Anthropic) — Drop-in

This kit wires an LLM that ONLY proposes CSS selectors. Your app still validates results in the DOM.

FILES IN THIS KIT
- scrapers/llm_agent.js   → Node-side helper used by main.js (IPC 'llm-propose')
- .env.example            → Copy to .env and fill keys
- test_llm.js             → Smoke-test runner to confirm keys/models work before integrating

STEP 1) Install dependency
  npm i node-fetch

STEP 2) Add your keys
  Copy .env.example → .env and set ONE provider:

  # OpenAI
  LLM_PROVIDER=openai
  OPENAI_API_KEY=sk-...        # required
  OPENAI_MODEL=gpt-4o-mini     # suggested

  # Anthropic
  # LLM_PROVIDER=anthropic
  # ANTHROPIC_API_KEY=sk-ant-...
  # ANTHROPIC_MODEL=claude-3-haiku-20240307

If you don’t want .env, export vars in your shell instead.

STEP 3) (Optional) Load .env automatically
If your Electron start script doesn’t already load env vars, either export them in your shell,
or add dotenv at the entry point:
  npm i dotenv
and at the very top of main.js:
  require('dotenv').config();

STEP 4) Smoke test BEFORE touching the app
  node test_llm.js

Expected output: a small JSON array of CSS selectors (1–4 items).

STEP 5) Hook into your app
Your main.js should have an IPC like:
  ipcMain.handle('llm-propose', async (_e, { html, label, url, provider }) => {
    try {
      const { proposeSelectors } = require('./scrapers/llm_agent');
      const selectors = await proposeSelectors({ html, label, url, provider });
      return { ok: true, selectors };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

Your renderer/orchestrator then calls window.api.llmPropose({ html, label, url }).
If env isn’t configured, llm_agent throws a clear error and your UI can catch it.

TROUBLESHOOTING
- HTTP 401/403 → bad API key or account permissions.
- Empty selector list → try a simpler model (gpt-4o-mini/haiku) and ensure HTML snippet <= ~100k chars.
- Very slow → turn off LLM for successful domains; LLM is a one-time bootstrap per host.
