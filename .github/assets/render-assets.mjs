import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const { Resvg } = require('@resvg/resvg-js');

const here = (p) => new URL(p, import.meta.url);

// ---- 1) icon.png ------------------------------------------------------------
const iconSvg = readFileSync(here('./logo.svg'));
const iconPng = new Resvg(iconSvg, {
  fitTo: { mode: 'width', value: 512 },
  background: 'rgba(0,0,0,0)',
}).render().asPng();
writeFileSync(here('./icon.png'), iconPng);

// copy the icon into the plugin dir (used as the Main-tab menu icon)
writeFileSync(here('../../src/usr/local/emhttp/plugins/smokesignal/smokesignal.png'), iconPng);

// ---- 2) banner.png (white 1600x500, wordmark + claim) -----------------------
const iconB64 = Buffer.from(iconPng).toString('base64');
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500">
  <rect width="1600" height="500" fill="#ffffff"/>
  <image x="120" y="100" width="300" height="300" href="data:image/png;base64,${iconB64}"/>
  <text x="470" y="258" font-family="Arial Black" font-weight="900" font-size="138" fill="#161616">SmokeSignal</text>
  <text x="476" y="322" font-family="Arial" font-size="38" fill="#5a5a5a">Catches the smoke before the reboot catches fire.</text>
</svg>`;
const bannerPng = new Resvg(Buffer.from(banner), {
  fitTo: { mode: 'width', value: 1600 },
  font: {
    fontFiles: ['C:/Windows/Fonts/ariblk.ttf', 'C:/Windows/Fonts/arial.ttf'],
    loadSystemFonts: true,
    defaultFontFamily: 'Arial',
  },
}).render().asPng();
writeFileSync(here('./banner.png'), bannerPng);

console.log('icon.png', iconPng.length, '| banner.png', bannerPng.length);
