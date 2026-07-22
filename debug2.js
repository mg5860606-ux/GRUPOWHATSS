const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
  await page.goto('http://localhost:8081/send-group.html', { waitUntil: 'networkidle0' });
  await page.type('#groupLinkInput', 'https://chat.whatsapp.com/test');
  await page.click('#btnValidateLink');
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
