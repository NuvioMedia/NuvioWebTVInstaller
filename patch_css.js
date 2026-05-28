const fs = require('fs');

const cssPath = 'src/renderer/styles.css';
let css = fs.readFileSync(cssPath, 'utf8');

// Replace nav-back
css = css.replace(/\.nav-back \{[\s\S]*?\.nav-back svg \{[\s\S]*?\}/, `.nav-back {
  position: absolute;
  top: 28px;
  left: 32px;
  background: var(--surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  padding: 10px 20px 10px 16px;
  border-radius: 100px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  z-index: 10;
  transition: all 0.3s var(--ease-spring);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
.nav-back:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
  border-color: var(--border-active);
  transform: translateX(-4px) scale(1.02);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.nav-back:active {
  transform: translateX(-2px) scale(0.98);
}
.nav-back svg {
  width: 18px; height: 18px;
  transition: transform 0.3s var(--ease-spring);
}
.nav-back:hover svg {
  transform: translateX(-3px);
}

/* Global Branding Header */
.app-branding {
  position: absolute;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.9;
}
.app-branding img.brand-wordmark {
  height: 28px;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
}
.app-branding span.brand-subtitle {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 2px;
  text-transform: uppercase;
  border-left: 1px solid var(--border);
  padding-left: 12px;
  margin-top: 2px;
}`);

fs.writeFileSync(cssPath, css);
