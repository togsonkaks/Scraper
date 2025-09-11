
// node test_llm.js
// Smoke test LLM selector proposal without running Electron.
try { require('dotenv').config(); } catch {}
const { proposeSelectors } = require('./scrapers/llm_agent');

(async () => {
  const html = `
    <html><head>
      <meta name="description" content="Ultra Comfy Hoodie">
      <script type="application/ld+json">
      {"@type":"Product","name":"Ultra Comfy Hoodie","brand":{"@type":"Brand","name":"ACME"},"offers":{"@type":"Offer","priceCurrency":"USD","price":"42.99"}}
      </script>
    </head>
    <body>
      <h1 class="product-title">Ultra Comfy Hoodie</h1>
      <div class="price"><span class="money">$42.99</span> <span class="compare">$69.00</span></div>
      <div class="gallery">
        <img src="https://cdn.example.com/p/hoodie-1.jpg">
        <img src="https://cdn.example.com/p/hoodie-2.jpg">
        <img src="https://cdn.example.com/p/hoodie-3.jpg">
      </div>
    </body></html>
  `;

  const url = "https://shop.example.com/hoodie/123";
  for (const label of ['title','price','brand','description','images']) {
    try {
      const selectors = await proposeSelectors({ html, label, url });
      console.log(label, '→', selectors);
    } catch (e) {
      console.error(label, 'ERROR:', String(e));
    }
  }
})();
