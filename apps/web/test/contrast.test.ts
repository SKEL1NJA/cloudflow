// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

interface Color {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

function readBlock(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`Missing ${selector} block in index.css`);
  const end = css.indexOf('}', start);

  const tokens = new Map<string, string>();
  for (const match of css.slice(start, end).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (match[1] && match[2]) tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

const toGamma = (value: number) => {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
};

const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%)?\s*\)$/;

function parseColor(value: string): Color {
  const match = OKLCH.exec(value);
  if (!match) throw new Error(`Unsupported color: ${value}`);

  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const alpha = match[4] === undefined ? 1 : Number(match[4]) / 100;

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha,
  };
}

function over(top: Color, base: Color): Color {
  const mix = (a: number, b: number) => a * top.alpha + b * (1 - top.alpha);
  return {
    r: mix(top.r, base.r),
    g: mix(top.g, base.g),
    b: mix(top.b, base.b),
    alpha: 1,
  };
}

function luminance(color: Color): number {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
}

function ratio(foreground: Color, background: Color): number {
  const text = foreground.alpha < 1 ? over(foreground, background) : foreground;
  const [lighter, darker] = [luminance(text), luminance(background)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

type Lookup = (name: string) => Color;

interface Pair {
  label: string;
  min: number;
  foreground: (token: Lookup) => Color;
  background: (token: Lookup) => Color;
}

const SURFACES = ['background', 'card', 'popover'] as const;
const STATUSES = ['success', 'running', 'warning', 'danger'] as const;

function pair(foreground: string, background: string, min: number): Pair {
  return {
    label: `${foreground} on ${background}`,
    min,
    foreground: (token) => token(foreground),
    background: (token) => token(background),
  };
}

const PAIRS: Pair[] = [
  ...SURFACES.map((surface) => pair('foreground', surface, 4.5)),
  pair('card-foreground', 'card', 4.5),
  pair('popover-foreground', 'popover', 4.5),
  pair('foreground', 'sidebar', 4.5),
  ...['background', 'card', 'popover', 'muted', 'accent', 'sidebar'].map((surface) =>
    pair('muted-foreground', surface, 4.5),
  ),
  pair('primary-foreground', 'primary', 4.5),
  pair('secondary-foreground', 'secondary', 4.5),
  pair('accent-foreground', 'accent', 4.5),
  pair('danger-foreground', 'danger', 4.5),
  ...STATUSES.flatMap((status) =>
    SURFACES.flatMap((surface): Pair[] => [
      pair(status, surface, 4.5),
      {
        label: `${status} text on a ${status} tint over ${surface}`,
        min: 4.5,
        foreground: (token) => token(status),
        background: (token) => over({ ...token(status), alpha: 0.1 }, token(surface)),
      },
      {
        ...pair(status, surface, 3),
        label: `${status} as a graphic on ${surface}`,
      },
    ]),
  ),
  pair('input', 'background', 3),
  pair('input', 'card', 3),
  pair('ring', 'background', 3),
  pair('ring', 'card', 3),
];

const light = readBlock(':root');
const themes = { light, dark: new Map([...light, ...readBlock('.dark')]) };

for (const [name, tokens] of Object.entries(themes)) {
  const lookup: Lookup = (token) => {
    const value = tokens.get(token);
    if (!value) throw new Error(`Missing --${token} in the ${name} theme`);
    return parseColor(value);
  };

  describe(`${name} theme contrast`, () => {
    it.each(PAIRS)('$label is at least $min:1', ({ label, min, foreground, background }) => {
      const value = ratio(foreground(lookup), background(lookup));
      expect(value, `${label} is ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    });
  });
}
