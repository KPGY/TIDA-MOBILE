export function normalizeHex(hex: string): string {
  if (!hex || typeof hex !== 'string') return '#FFFFFF';
  let c = hex.trim().replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  if (c.length !== 6) return '#FFFFFF';
  return `#${c.toUpperCase()}`;
}

export function hexToRgba(hex: string, alpha: number = 0.8): string {
  if (!hex || typeof hex !== 'string') return `rgba(245, 245, 245, ${alpha})`;
  let c = hex.trim().replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num) || c.length !== 6) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Converts a hex color (#RRGGBB) to linearized relative luminance (0.0 ~ 1.0)
 * Follows the W3C WCAG 2.1 relative luminance specification.
 */
export function getLuminance(hex: string): number {
  const norm = normalizeHex(hex);
  const r = parseInt(norm.substring(1, 3), 16) / 255;
  const g = parseInt(norm.substring(3, 5), 16) / 255;
  const b = parseInt(norm.substring(5, 7), 16) / 255;

  const rLin = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gLin = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bLin = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Alpha blends a foreground color with transparency over a background color.
 * Returns the resulting perceived hex color (#RRGGBB).
 */
export function blendColors(fgHex: string, alpha: number, bgHex: string): string {
  const fgNorm = normalizeHex(fgHex);
  const bgNorm = normalizeHex(bgHex);

  const r1 = parseInt(fgNorm.substring(1, 3), 16);
  const g1 = parseInt(fgNorm.substring(3, 5), 16);
  const b1 = parseInt(fgNorm.substring(5, 7), 16);

  const r2 = parseInt(bgNorm.substring(1, 3), 16);
  const g2 = parseInt(bgNorm.substring(3, 5), 16);
  const b2 = parseInt(bgNorm.substring(5, 7), 16);

  const a = Math.max(0, Math.min(1, alpha));

  const r = Math.round(r1 * a + r2 * (1 - a));
  const g = Math.round(g1 * a + g2 * (1 - a));
  const b = Math.round(b1 * a + b2 * (1 - a));

  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Determines whether text contrast mode should be 'light' (white text) or 'dark' (black text).
 * Uses WCAG 2.1 contrast ratio against #FFFFFF (lum 1.0) vs #000000 (lum 0.0).
 * Midpoint luminance is approx 0.179.
 * Note: 'light' mode means the background is dark so text must be LIGHT/WHITE.
 *       'dark' mode means the background is light so text must be DARK/BLACK.
 */
export const getContrastMode = (hexColor: string): 'light' | 'dark' => {
  const L = getLuminance(hexColor);
  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithBlack = (L + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? 'light' : 'dark';
};

/**
 * Calculates adaptive text contrast mode for message bubbles.
 * When glassmorphism / transparency is active, it blends the bubble color
 * with the underlying app background color to evaluate true perceived luminance.
 */
export function getAdaptiveBubbleTextMode(
  bubbleTheme: string,
  bgTheme: string,
  isGlassmorphism: boolean,
): 'light' | 'dark' {
  if (isGlassmorphism) {
    // With glassmorphism, bubbles have approx 0.88 opacity over bgTheme
    const perceivedColor = blendColors(bubbleTheme, 0.88, bgTheme);
    return getContrastMode(perceivedColor);
  }
  return getContrastMode(bubbleTheme);
}

/**
 * Calculates adaptive text contrast mode for cards / panels.
 * When glassmorphism / transparency is active, it blends the panel color
 * with the underlying app background color to evaluate true perceived luminance.
 */
export function getAdaptivePanelTextMode(
  panelTheme: string,
  bgTheme: string,
  isGlassmorphism: boolean,
): 'light' | 'dark' {
  if (isGlassmorphism) {
    // With glassmorphism, panels have approx 0.85 opacity over bgTheme
    const perceivedColor = blendColors(panelTheme, 0.85, bgTheme);
    return getContrastMode(perceivedColor);
  }
  return getContrastMode(panelTheme);
}
