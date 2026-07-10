/**
 * Generates SmokeSignal assets from the three logo masters in this folder:
 *   smokesignal-dunkel.svg  (dark ring)   -> light surfaces
 *   smokesignal-hell.svg    (white ring)   -> dark surfaces
 *   smokesignal-unraid.svg  (double ring)  -> the Unraid plugin tile (reads on any theme)
 *   logo.svg = a copy of the dunkel master (kept for README/CA references).
 *
 * Outputs:
 *   icon.png             : CA icon — dunkel logo on a WHITE 512 tile (stands out on the dark CA page)
 *   banner.png/.svg      : white 1600x500, dunkel logo + "SmokeSignal" (Bree Serif) + claim (Lato)  [README light]
 *   banner-dark.png/.svg : dark 1600x500, hell logo + wordmark                                       [README <picture> dark]
 *   banner-logo.png/.svg : white 1600x500, dunkel logo only, NO text                                 [support thread]
 *   ../../src/.../smokesignal/{images,icons}/smokesignal.png + smokesignal.png (root):
 *                          the unraid (flip-compatible) variant, transparent 512  [Plugins tile + menu icon + modal]
 *
 * viewBox-agnostic: every embed reads the master's OWN viewBox (the masters differ:
 * dunkel/hell are 955.7x953.78, unraid is 1000x1000). Fonts (OFL) are fetched to the OS
 * temp dir at runtime, NOT committed. Deps (global): @resvg/resvg-js, opentype.js.
 *
 * Run: node .github/assets/render-assets.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const W = 1600, H = 500;
const LH = 470, LW = 470;          // logo (square) — large
const nameSize = 140, claimSize = 38, gap = 56, lineGap = 20;
const PLUGIN = '../../src/usr/local/emhttp/plugins/smokesignal/';
// Each theme embeds the logo variant that reads on its background (no recolour).
const THEMES = [
  { suffix: '', bg: '#ffffff', name: '#242626', claim: '#5a5d5e', logo: 'smokesignal-dunkel.svg' },
  { suffix: '-dark', bg: '#0d1117', name: '#e6edf3', claim: '#9aa4ad', logo: 'smokesignal-hell.svg' },
];
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

// Embed a master verbatim at (x,y,w,h): drop the XML decl, reposition its <svg>,
// preserving the master's OWN viewBox (never hardcode it).
function embedLogo(file, x, y, w, h) {
  const raw = readFileSync(here('./' + file), 'utf8').replace(/<\?xml[^>]*\?>\s*/, '');
  const vb = (raw.match(/viewBox="([^"]+)"/) || [, '0 0 1000 1000'])[1];
  return raw.replace(/<svg\b[^>]*>/,
    `<svg x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w}" height="${h}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">`);
}
const png = (svg, size, bg) =>
  new Resvg(Buffer.from(svg), { fitTo: { mode: 'width', value: size }, background: bg || 'rgba(0,0,0,0)' }).render().asPng();

// ---- 1) CA icon: dunkel logo on a WHITE tile -------------------------------
const dunkelRaw = readFileSync(here('./smokesignal-dunkel.svg'), 'utf8').replace(/<\?xml[^>]*\?>\s*/, '');
const dvb = (dunkelRaw.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || [, '1000', '1000']);
const iconSvg = dunkelRaw.replace(/(<svg\b[^>]*>)/, `$1<rect width="${dvb[1]}" height="${dvb[2]}" fill="#ffffff"/>`);
writeFileSync(here('./icon.png'), png(iconSvg, 512, '#ffffff'));

// ---- 2) plugin tile PNGs: the flip-compatible unraid variant, transparent --
// Backs .plg <ICON> (images/), the .page Icon= menu icon (icons/), and the
// check-result modal <img> (root). Reads on every Unraid theme from one PNG.
const tile = png(readFileSync(here('./smokesignal-unraid.svg'), 'utf8'), 512);
for (const rel of ['smokesignal.png', 'images/smokesignal.png', 'icons/smokesignal.png']) {
  writeFileSync(here(PLUGIN + rel), tile);
}

// ---- 3) banners (Bree Serif name + Lato claim, text rendered to paths) -----
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

for (const t of THEMES) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  ${embedLogo(t.logo, LX, LY, LW, LH)}
  <path d="${namePath}" fill="${t.name}"/>
  <path d="${claimPath}" fill="${t.claim}"/>
</svg>
`;
  writeFileSync(here(`./banner${t.suffix}.svg`), svg);
  writeFileSync(here(`./banner${t.suffix}.png`), png(svg, W, t.bg));
}

// ---- 4) text-free support-thread banner: dunkel logo centred, NO text ------
const logoLX = (W - LW) / 2, logoLY = (H - LH) / 2;
const logoOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${embedLogo('smokesignal-dunkel.svg', logoLX, logoLY, LW, LH)}
</svg>
`;
writeFileSync(here('./banner-logo.svg'), logoOnly);
writeFileSync(here('./banner-logo.png'), png(logoOnly, W, '#ffffff'));

console.log('wrote icon.png, banner{,-dark,-logo}.{svg,png}, 3 plugin tile PNGs');
