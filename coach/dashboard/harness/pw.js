// Playwright for the harness scripts, from this folder's node_modules (or NODE_PATH). Says how to install it when missing.
try { module.exports = require('playwright'); } catch (e) {
  console.error('Playwright is missing. Install it once, from ' + __dirname + ':\n  npm install --no-save d3@7 playwright\n(and, if Chromium is missing too: npx playwright install chromium)');
  process.exit(1);
}
