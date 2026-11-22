import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Zenlot brand tokens for rendered social images.
// Colours come from the app: splash navy (#001c34), the teal→blue gradient of
// the "Z" mark, and the tertiary orange (#E78128) used for highlights.
// ---------------------------------------------------------------------------

export const COLORS = {
  bgTop: '#0B1E33',
  bgBottom: '#050C15',
  surface: 'rgba(255,255,255,0.05)',
  surfaceBorder: 'rgba(255,255,255,0.10)',
  teal: '#2DD4BF',
  blue: '#1F6FB8',
  orange: '#F0913A',
  text: '#F4F7FA',
  muted: '#93A6BA',
  loss: '#F26B6B',
  gain: '#34D399',
} as const;

export const CANVAS = { width: 1080, height: 1350 } as const; // 4:5 portrait — max feed real estate

export const HANDLE = process.env.IG_HANDLE || '@zenlot_app';

// The gradient "Z" mark, drawn as vector so it sits cleanly on dark backgrounds
// (the PNG app icon in the app repo has a baked-in white background).
const Z_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${COLORS.teal}"/><stop offset="1" stop-color="${COLORS.blue}"/></linearGradient></defs>
<path fill="url(#g)" d="M27 14 H80 Q89 14 83 22 L44 70 H70 Q76 70 79 64 L82 58 Q88 54 88 62 Q88 86 66 86 H21 Q12 86 18 78 L57 30 H24 Q14 30 18 21 Q21 14 27 14 Z"/>
</svg>`;

export const Z_MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(Z_MARK_SVG).toString('base64')}`;

// ---------------------------------------------------------------------------
// Fonts — loaded from @fontsource packages (satori needs TTF/OTF/WOFF, not WOFF2)
// ---------------------------------------------------------------------------

type FontWeight = 400 | 500 | 600 | 700 | 800;
export interface FontDef {
  name: string;
  data: Buffer;
  weight: FontWeight;
  style: 'normal';
}

function fontFile(pkg: string, file: string): Buffer {
  const resolved = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'files', file);
  return fs.readFileSync(resolved);
}

let fontCache: FontDef[] | null = null;

export function loadFonts(): FontDef[] {
  if (fontCache) return fontCache;
  const jakarta = '@fontsource/plus-jakarta-sans';
  fontCache = [
    { name: 'Jakarta', data: fontFile(jakarta, 'plus-jakarta-sans-latin-500-normal.woff'), weight: 500, style: 'normal' },
    { name: 'Jakarta', data: fontFile(jakarta, 'plus-jakarta-sans-latin-700-normal.woff'), weight: 700, style: 'normal' },
    { name: 'Jakarta', data: fontFile(jakarta, 'plus-jakarta-sans-latin-800-normal.woff'), weight: 800, style: 'normal' },
    {
      name: 'Mono',
      data: fontFile('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff'),
      weight: 700,
      style: 'normal',
    },
  ];
  return fontCache;
}
