const fs = require('fs');

const htmlPath = 'src/renderer/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// Insert branding before <div class="app-container">
if (!html.includes('app-branding')) {
  html = html.replace('<div class="app-container">', `
  <div class="app-branding">
    <img src="../../logo/nuvio_wordmark.png" alt="Nuvio" class="brand-wordmark" />
    <span class="brand-subtitle">Installer</span>
  </div>

  <div class="app-container">`);
  fs.writeFileSync(htmlPath, html);
}
