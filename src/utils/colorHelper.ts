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

export const getContrastMode = (hexColor: string): 'light' | 'dark' => {
  if (!hexColor || hexColor.length !== 7 || hexColor[0] !== '#') {
    return 'dark';
  }
  const r = parseInt(hexColor.substring(1, 3), 16);
  const g = parseInt(hexColor.substring(3, 5), 16);
  const b = parseInt(hexColor.substring(5, 7), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? 'dark' : 'light';
};
