/**
 * Generates SmokeSignal assets from logo.svg:
 *   icon.png   : 512x512, transparent (also copied into the plugin dir)
 *   banner.svg : white 1600x500; logo left, "SmokeSignal" in Bree Serif + the
 *                claim in Lato to the right. Text is converted to SVG paths
 *                (opentype.js) so the SVG needs NO font at render time.
 *   banner.png : rasterized banner.
 *
 * Fonts (OFL) are fetched at runtime to the OS temp dir, NOT committed.
 * Deps (global): @resvg/resvg-js, opentype.js
 *
 * Run: node .github/assets/render-assets.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const gRoot = execSync('npm root -g').toString().trim();
const { Resvg } = require(`${gRoot}/@resvg/resvg-js`);
const opentype = require(`${gRoot}/opentype.js`);
const here = (p) => new URL(p, import.meta.url);

// ---- content + styling ------------------------------------------------------
const NAME = 'SmokeSignal';
const CLAIM = 'Catches the smoke before the reboot catches fire.';
const NAME_FILL = '#242626';
const CLAIM_FILL = '#5a5d5e';
const W = 1600, H = 500;
const LH = 470, LW = 470;          // logo (square) — large
const nameSize = 140, claimSize = 38, gap = 56, lineGap = 20;
// -----------------------------------------------------------------------------

async function getFont(file, url) {
  const p = join(tmpdir(), file);
  if (!existsSync(p)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`font fetch ${res.status} ${url}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return opentype.parse(readFileSync(p));
}

// ---- 1) icon.png from logo.svg ---------------------------------------------
const logoSvg = readFileSync(here('./logo.svg'));
const iconPng = new Resvg(logoSvg, { fitTo: { mode: 'width', value: 512 }, background: 'rgba(0,0,0,0)' }).render().asPng();
writeFileSync(here('./icon.png'), iconPng);
writeFileSync(here('../../src/usr/local/emhttp/plugins/smokesignal/smokesignal.png'), iconPng);
// Unraid's Plugins tab looks for the plugin icon under plugins/<name>/images/ first
// (older releases ONLY there) — ship it in both places.
mkdirSync(new URL('../../src/usr/local/emhttp/plugins/smokesignal/images/', import.meta.url), { recursive: true });
writeFileSync(here('../../src/usr/local/emhttp/plugins/smokesignal/images/smokesignal.png'), iconPng);

// ---- 2) banner --------------------------------------------------------------
const bree = await getFont('SmokeSignal-BreeSerif-Regular.ttf',
  'https://github.com/google/fonts/raw/main/ofl/breeserif/BreeSerif-Regular.ttf');
const claimFont = await getFont('SmokeSignal-Lato-Regular.ttf',
  'https://github.com/google/fonts/raw/main/ofl/lato/Lato-Regular.ttf');

const nameW = bree.getAdvanceWidth(NAME, nameSize);
const claimW = claimFont.getAdvanceWidth(CLAIM, claimSize);
const groupW = LW + gap + Math.max(nameW, claimW);
const startX = (W - groupW) / 2;
const LX = startX, LY = (H - LH) / 2;
const textX = startX + LW + gap;

const nameAsc = bree.ascender * (nameSize / bree.unitsPerEm);
const nameDesc = -bree.descender * (nameSize / bree.unitsPerEm);
const claimAsc = claimFont.ascender * (claimSize / claimFont.unitsPerEm);
const blockH = nameAsc + nameDesc + lineGap + claimAsc;
const nameBaseline = H / 2 - blockH / 2 + nameAsc;
const claimBaseline = nameBaseline + nameDesc + lineGap + claimAsc;

const namePath = bree.getPath(NAME, textX, nameBaseline, nameSize).toPathData(2);
const claimPath = claimFont.getPath(CLAIM, textX, claimBaseline, claimSize).toPathData(2);

let logo = readFileSync(here('./logo.svg'), 'utf8').replace(/<\?xml[^>]*\?>\s*/, '');
logo = logo.replace(/<svg\b[^>]*>/,
  `<svg x="${LX.toFixed(1)}" y="${LY.toFixed(1)}" width="${LW}" height="${LH}" viewBox="0 0 1004.95 1004.95" xmlns="http://www.w3.org/2000/svg">`);

const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${logo}
  <path d="${namePath}" fill="${NAME_FILL}"/>
  <path d="${claimPath}" fill="${CLAIM_FILL}"/>
</svg>
`;
writeFileSync(here('./banner.svg'), banner);
const bannerPng = new Resvg(Buffer.from(banner), { fitTo: { mode: 'width', value: W } }).render().asPng();
writeFileSync(here('./banner.png'), bannerPng);

console.log('icon.png', iconPng.length, '| banner.png', bannerPng.length);
