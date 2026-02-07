const puppeteer = require('puppeteer');
const path = require('path');

const sizes = [16, 32, 48, 64, 128, 256, 512];

const html = `
<!DOCTYPE html>
<html>
<head>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@700&display=swap" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; background: transparent; }
    svg {
      width: 512px;
      height: 512px;
    }
    .txt {
      font-family: "Noto Nastaliq Urdu", serif;
      font-weight: 700;
      font-size: 300px;
      fill: #ffffff;
    }
  </style>
</head>
<body>
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect x="0" y="0" width="512" height="512" rx="96" ry="96" fill="#31b9c9"/>
    <text x="256" y="380" text-anchor="middle" class="txt">سند</text>
  </svg>
</body>
</html>
`;

async function generateFavicons() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set a large viewport and render at 512px
  await page.setViewport({ width: 512, height: 512, deviceScaleFactor: 1 });
  await page.setContent(html);

  // Wait for font to load
  await page.evaluateHandle('document.fonts.ready');
  await new Promise(r => setTimeout(r, 2000)); // Extra wait for font

  const svg = await page.$('svg');

  for (const size of sizes) {
    const filename = size === 512 ? 'icon.png' : `favicon-${size}.png`;
    const filepath = path.join(__dirname, '../public', filename);

    // Take screenshot at native size and let puppeteer handle clipping
    await page.setViewport({
      width: 512,
      height: 512,
      deviceScaleFactor: size / 512
    });

    await svg.screenshot({
      path: filepath,
      omitBackground: true
    });

    console.log(`Generated ${filename} (${size}x${size})`);
  }

  await browser.close();
  console.log('Done!');
}

generateFavicons().catch(console.error);
