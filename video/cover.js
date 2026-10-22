const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const h of [1920, 1350]) {
    const p = await b.newPage({ viewport: { width: 1080, height: h } });
    p.on('pageerror', e => console.error('ERR', e.message));
    await p.goto('file://' + path.resolve(__dirname, 'cover.html') + '?h=' + h);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, `portada_linkedin_${h === 1920 ? '9x16' : '4x5'}.png`) });
    await p.close();
  }
  await b.close(); console.log('ok');
})();
