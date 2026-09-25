/**
 * autoColorMatcher.ts
 * 
 * 배경 이미지를 분석하여 패널색, 메인(포인트)색, 버블색, 배경색을
 * 보색 및 톤온톤(Tone-on-tone) 색상 조화 이론에 따라 자동으로 산출하는 유틸리티입니다.
 * 
 * [색상 결정 흐름]
 * 1. 이미지 색상 분석 ➔ 패널색 (Panel) 결정 (글래스/그라데이션 모드 반영)
 * 2. 패널색 ➔ 메인색 (Main/Accent) 결정 (보색 및 고대비 강조 톤)
 * 3. 이미지 색상 ➔ 버블색 (Bubble) 결정 (이미지 톤온톤 소프트 컬러)
 * 4. 패널색 ➔ 배경색 (Background) 결정 (패널과 조화를 이루는 톤온톤 베이스)
 */

import { File } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import UPNG from 'upng-js';
import base64js from 'base64-js';

export type HarmonyType = 'analogous' | 'complementary';

export interface MatchedThemeColors {
  mainTheme: string;
  mainThemeEnd: string;
  panelTheme: string;
  panelThemeEnd: string;
  bubbleTheme: string;
  bubbleThemeEnd: string;
  bgTheme: string;
  bgThemeEnd: string;
  harmonyType: HarmonyType;
}

export interface MatchOptions {
  gradientMode?: boolean;
  glassmorphismMode?: boolean;
  harmonyType?: HarmonyType;
}

export interface HSL {
  h: number; // 0 ~ 360
  s: number; // 0 ~ 100 (%)
  l: number; // 0 ~ 100 (%)
}

export interface RGB {
  r: number; // 0 ~ 255
  g: number; // 0 ~ 255
  b: number; // 0 ~ 255
}

export interface ExtractedPalette {
  dominant: HSL;      // 가장 지배적인 대표 색상
  vibrant: HSL;       // 채도가 높고 생동감 있는 색상 (포인트 후보)
  muted: HSL;         // 차분하고 부드러운 중간 톤
  light: HSL;         // 밝은 영역 대표 톤
  dark: HSL;          // 어두운 영역 대표 톤
  isDarkOverall: boolean; // 이미지 전체의 밝기 (어두운 배경인지 여부)
}

// ----------------------------------------------------
// 1. 색상 변환 유틸리티 (RGB <-> HSL <-> HEX)
// ----------------------------------------------------

export function rgbToHsl(r: number, g: number, b: number): HSL {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) * 60;
        break;
      case gNorm:
        h = ((bNorm - rNorm) / delta + 2) * 60;
        break;
      case bNorm:
        h = ((rNorm - gNorm) / delta + 4) * 60;
        break;
    }
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hNorm = ((h % 360) + 360) % 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  if (sNorm === 0) {
    const gray = Math.round(lNorm * 255);
    return { r: gray, g: gray, b: gray };
  }

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let rTemp = 0;
  let gTemp = 0;
  let bTemp = 0;

  if (hNorm >= 0 && hNorm < 60) {
    rTemp = c;
    gTemp = x;
    bTemp = 0;
  } else if (hNorm >= 60 && hNorm < 120) {
    rTemp = x;
    gTemp = c;
    bTemp = 0;
  } else if (hNorm >= 120 && hNorm < 180) {
    rTemp = 0;
    gTemp = c;
    bTemp = x;
  } else if (hNorm >= 180 && hNorm < 240) {
    rTemp = 0;
    gTemp = x;
    bTemp = c;
  } else if (hNorm >= 240 && hNorm < 300) {
    rTemp = x;
    gTemp = 0;
    bTemp = c;
  } else {
    rTemp = c;
    gTemp = 0;
    bTemp = x;
  }

  return {
    r: Math.round((rTemp + m) * 255),
    g: Math.round((gTemp + m) * 255),
    b: Math.round((bTemp + m) * 255),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

export function hexToHsl(hex: string): HSL {
  if (!hex || typeof hex !== 'string') return { h: 0, s: 0, l: 50 };
  let c = hex.trim().replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num) || c.length !== 6) return { h: 0, s: 0, l: 50 };
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return rgbToHsl(r, g, b);
}

export function getDefaultPalette(): ExtractedPalette {
  return {
    dominant: { h: 215, s: 60, l: 50 },
    vibrant: { h: 215, s: 80, l: 55 },
    muted: { h: 215, s: 20, l: 60 },
    light: { h: 215, s: 15, l: 92 },
    dark: { h: 215, s: 25, l: 15 },
    isDarkOverall: false,
  };
}

// ----------------------------------------------------
// 2. 픽셀 데이터 분석 및 이미지 팔레트 추출
// ----------------------------------------------------

export function analyzeRgbaPixels(
  data: ArrayLike<number>,
  _width?: number,
  _height?: number,
): ExtractedPalette {
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let validPixels = 0;

  // 12구간 Hue 버킷 양자화
  const buckets: {
    count: number;
    rSum: number;
    gSum: number;
    bSum: number;
    maxSaturation: number;
    vibrantRgb: RGB;
  }[] = Array.from({ length: 12 }, () => ({
    count: 0,
    rSum: 0,
    gSum: 0,
    bSum: 0,
    maxSaturation: 0,
    vibrantRgb: { r: 128, g: 128, b: 128 },
  }));

  let minLightness = 100;
  let maxLightness = 0;
  let darkRgb: RGB = { r: 20, g: 20, b: 20 };
  let lightRgb: RGB = { r: 240, g: 240, b: 240 };

  const totalPixels = Math.floor(data.length / 4);
  // 성능 최적화: 대용량 이미지에서도 최대 약 3,000개 픽셀만 고르게 샘플링
  const step = Math.max(1, Math.floor(totalPixels / 3000));

  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    const a = data[idx + 3];
    if (a < 128) continue; // 투명 픽셀 제외

    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    totalR += r;
    totalG += g;
    totalB += b;
    validPixels++;

    const hsl = rgbToHsl(r, g, b);

    if (hsl.l < minLightness && hsl.s > 5) {
      minLightness = hsl.l;
      darkRgb = { r, g, b };
    }
    if (hsl.l > maxLightness && hsl.s > 5) {
      maxLightness = hsl.l;
      lightRgb = { r, g, b };
    }

    const bucketIndex = Math.min(11, Math.floor(hsl.h / 30));
    const bucket = buckets[bucketIndex];
    bucket.count++;
    bucket.rSum += r;
    bucket.gSum += g;
    bucket.bSum += b;

    if (hsl.s > bucket.maxSaturation && hsl.l >= 25 && hsl.l <= 80) {
      bucket.maxSaturation = hsl.s;
      bucket.vibrantRgb = { r, g, b };
    }
  }

  if (validPixels === 0) {
    return getDefaultPalette();
  }

  const avgR = Math.round(totalR / validPixels);
  const avgG = Math.round(totalG / validPixels);
  const avgB = Math.round(totalB / validPixels);
  const avgHsl = rgbToHsl(avgR, avgG, avgB);

  const sortedBuckets = [...buckets].sort((a, b) => b.count - a.count);
  const topBucket = sortedBuckets[0];
  const dominantRgb: RGB =
    topBucket && topBucket.count > 0
      ? {
          r: Math.round(topBucket.rSum / topBucket.count),
          g: Math.round(topBucket.gSum / topBucket.count),
          b: Math.round(topBucket.bSum / topBucket.count),
        }
      : { r: avgR, g: avgG, b: avgB };

  const dominantHsl = rgbToHsl(dominantRgb.r, dominantRgb.g, dominantRgb.b);

  const vibrantCandidate = sortedBuckets.reduce(
    (best, current) => (current.maxSaturation > best.maxSaturation ? current : best),
    sortedBuckets[0],
  );
  const vibrantHsl = vibrantCandidate && vibrantCandidate.maxSaturation > 0
    ? rgbToHsl(
        vibrantCandidate.vibrantRgb.r,
        vibrantCandidate.vibrantRgb.g,
        vibrantCandidate.vibrantRgb.b,
      )
    : dominantHsl;

  const mutedHsl: HSL = {
    h: dominantHsl.h,
    s: Math.max(10, Math.min(40, dominantHsl.s * 0.5)),
    l: avgHsl.l > 50 ? 70 : 35,
  };

  const isDarkOverall = avgHsl.l < 48;

  return {
    dominant: dominantHsl,
    vibrant: vibrantHsl.s > 25 ? vibrantHsl : { ...dominantHsl, s: 75, l: 55 },
    muted: mutedHsl,
    light: rgbToHsl(lightRgb.r, lightRgb.g, lightRgb.b),
    dark: rgbToHsl(darkRgb.r, darkRgb.g, darkRgb.b),
    isDarkOverall,
  };
}

/**
 * 이미지 URI로부터 대표 팔레트를 비동기 추출합니다.
 * Web 환경에서는 HTML5 Canvas를, Native(Android/iOS) 환경에서는 expo-file-system + pure-JS 디코더를 사용합니다.
 */
export async function extractPaletteFromImage(imageUri: string): Promise<ExtractedPalette> {
  if (!imageUri) {
    return getDefaultPalette();
  }

  try {
    if (typeof document !== 'undefined') {
      return new Promise((resolve) => {
        const img = new (window as any).Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(getDefaultPalette());
            const sampleSize = 100;
            canvas.width = sampleSize;
            canvas.height = sampleSize;
            ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
            const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
            resolve(analyzeRgbaPixels(imageData.data, sampleSize, sampleSize));
          } catch {
            resolve(getDefaultPalette());
          }
        };
        img.onerror = () => resolve(getDefaultPalette());
        img.src = imageUri;
      });
    }

    // Native (Android / iOS) 환경
    // 1단계 초고속 경로: 카메라 원본 사진(수천만 화소)을 JS에서 직접 디코딩하면 수 초 이상 지연되므로,
    // 네이티브 하드웨어 가속으로 80px 썸네일로 즉시 리사이징 후 분석합니다 (0.03초 이내 완료).
    try {
      const manipResult = await manipulateAsync(
        imageUri,
        [{ resize: { width: 80 } }],
        { format: SaveFormat.JPEG, base64: true, compress: 0.7 }
      );
      if (manipResult.base64) {
        const thumbBytes = base64js.toByteArray(manipResult.base64);
        const decoded = jpeg.decode(thumbBytes, { useTArray: true, formatAsRGBA: true });
        if (decoded && decoded.data) {
          return analyzeRgbaPixels(decoded.data, decoded.width, decoded.height);
        }
      }
    } catch (fastErr) {
      console.warn('[extractPaletteFromImage] Fast native resize failed, falling back to direct read:', fastErr);
    }

    // 2단계 백업 경로 (직접 파일 바이트 읽기)
    let uint8Array: Uint8Array;
    try {
      const file = new File(imageUri);
      uint8Array = await file.bytes();
    } catch {
      const base64Data = await FileSystemLegacy.readAsStringAsync(imageUri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
      uint8Array = base64js.toByteArray(base64Data);
    }

    // PNG 시그니처 체크: 89 50 4E 47
    if (
      uint8Array.length > 8 &&
      uint8Array[0] === 0x89 &&
      uint8Array[1] === 0x50 &&
      uint8Array[2] === 0x4e &&
      uint8Array[3] === 0x47
    ) {
      const arrayBuffer = uint8Array.buffer.slice(
        uint8Array.byteOffset,
        uint8Array.byteOffset + uint8Array.byteLength
      ) as ArrayBuffer;
      const decoded = UPNG.decode(arrayBuffer);
      const rgbaBuffer = UPNG.toRGBA8(decoded)[0];
      return analyzeRgbaPixels(new Uint8Array(rgbaBuffer), decoded.width, decoded.height);
    }

    // JPEG 디코딩 시도
    const decoded = jpeg.decode(uint8Array, { useTArray: true, formatAsRGBA: true });
    if (decoded && decoded.data) {
      return analyzeRgbaPixels(decoded.data, decoded.width, decoded.height);
    }

    return getDefaultPalette();
  } catch (err) {
    console.warn('[extractPaletteFromImage] Failed to extract palette, using fallback:', err);
    return getDefaultPalette();
  }
}

// ----------------------------------------------------
// 3. 조화로운 테마 배색 알고리즘
// ----------------------------------------------------

export function generateHarmoniousTheme(
  palette: ExtractedPalette,
  options: MatchOptions = {}
): MatchedThemeColors {
  const { dominant, vibrant, isDarkOverall } = palette;
  const harmonyType: HarmonyType = options.harmonyType || 'analogous';
  const glassmorphismMode = Boolean(options.glassmorphismMode);
  const isMonochrome = dominant.s < 8;

  let panelTheme: string;
  let panelThemeEnd: string;
  let mainTheme: string;
  let mainThemeEnd: string;
  let bubbleTheme: string;
  let bubbleThemeEnd: string;
  let bgTheme: string;
  let bgThemeEnd: string;

  if (harmonyType === 'analogous') {
    // 1. 패널
    const panelH = isMonochrome ? 215 : dominant.h;
    const panelS = isMonochrome
      ? (glassmorphismMode ? 6 : 4)
      : glassmorphismMode
        ? Math.min(38, Math.max(18, dominant.s * 0.55 + 8))
        : Math.min(26, Math.max(12, dominant.s * 0.4 + 2));
    const panelL = isDarkOverall
      ? (glassmorphismMode ? 14 : 18)
      : (glassmorphismMode ? 92 : 94);

    panelTheme = hslToHex(panelH, panelS, panelL);
    const endPanelH = (panelH + (isDarkOverall ? 14 : -12) + 360) % 360;
    const endPanelL = isDarkOverall ? Math.min(28, panelL + 6) : Math.max(86, panelL - 5);
    panelThemeEnd = hslToHex(endPanelH, panelS, endPanelL);

    // 2. 메인
    let mainH: number;
    let mainS: number;
    let mainL: number;
    if (isMonochrome) {
      mainH = 220;
      mainS = 75;
      mainL = isDarkOverall ? 64 : 45;
    } else {
      mainH = (panelH + (isDarkOverall ? 6 : -6) + 360) % 360;
      mainS = Math.max(68, Math.min(92, dominant.s < 20 ? 72 : dominant.s * 1.35 + 20));
      mainL = isDarkOverall ? 64 : 40;
    }
    mainTheme = hslToHex(mainH, mainS, mainL);
    const endMainH = (mainH + (isDarkOverall ? 28 : 24)) % 360;
    const endMainL = isDarkOverall ? Math.min(74, mainL + 8) : Math.max(32, mainL - 6);
    mainThemeEnd = hslToHex(endMainH, mainS, endMainL);

    // 3. 버블
    const bubbleH = isMonochrome ? 215 : dominant.h;
    const bubbleS = isMonochrome
      ? (glassmorphismMode ? 8 : 6)
      : glassmorphismMode
        ? Math.min(38, Math.max(18, dominant.s * 0.52 + 6))
        : Math.min(30, Math.max(12, dominant.s * 0.42));
    const bubbleL = isDarkOverall
      ? (glassmorphismMode ? 28 : 30)
      : (glassmorphismMode ? 83 : 86);
    bubbleTheme = hslToHex(bubbleH, bubbleS, bubbleL);
    const endBubbleH = (bubbleH + 16) % 360;
    const endBubbleL = isDarkOverall ? Math.min(36, bubbleL + 5) : Math.max(76, bubbleL - 5);
    bubbleThemeEnd = hslToHex(endBubbleH, bubbleS, endBubbleL);

    // 4. 배경
    const bgH = mainH;
    const bgS = isMonochrome ? 12 : Math.max(52, Math.min(85, dominant.s * 1.1 + 28));
    const bgL = isDarkOverall ? 14 : 91;
    bgTheme = hslToHex(bgH, bgS, bgL);
    const endBgH = (bgH + (isDarkOverall ? -14 : 16) + 360) % 360;
    const endBgL = isDarkOverall ? 20 : 82;
    bgThemeEnd = hslToHex(endBgH, bgS, endBgL);

  } else {
    // Complementary (보색 대비 테마)
    const compH = (dominant.h + 180) % 360;
    let targetAccentH: number;

    let vibrantDiff = Math.abs(vibrant.h - dominant.h);
    if (vibrantDiff > 180) vibrantDiff = 360 - vibrantDiff;

    if (isMonochrome) {
      targetAccentH = 210;
    } else if (vibrant.s >= 40 && vibrantDiff >= 90) {
      targetAccentH = vibrant.h;
    } else {
      targetAccentH = compH;
    }

    const panelH = isMonochrome ? 210 : (targetAccentH + (isDarkOverall ? 8 : -8) + 360) % 360;
    const panelS = isMonochrome
      ? (glassmorphismMode ? 8 : 6)
      : glassmorphismMode
        ? Math.min(46, Math.max(26, dominant.s * 0.72 + 12))
        : Math.min(34, Math.max(18, dominant.s * 0.55 + 6));
    const panelL = isDarkOverall
      ? (glassmorphismMode ? 14 : 17)
      : (glassmorphismMode ? 89 : 91);

    panelTheme = hslToHex(panelH, panelS, panelL);
    const endPanelH = (panelH + (isDarkOverall ? 16 : -14) + 360) % 360;
    const endPanelL = isDarkOverall ? Math.min(28, panelL + 6) : Math.max(82, panelL - 6);
    panelThemeEnd = hslToHex(endPanelH, panelS, endPanelL);

    let mainH: number = targetAccentH;
    let mainS: number;
    let mainL: number;
    if (isMonochrome) {
      mainS = 90;
      mainL = isDarkOverall ? 62 : 48;
    } else {
      mainS = Math.max(82, Math.min(98, dominant.s < 20 ? 86 : dominant.s * 1.4 + 25));
      mainL = isDarkOverall ? 60 : 47;
    }
    mainTheme = hslToHex(mainH, mainS, mainL);
    const endMainH = (mainH + 32) % 360;
    const endMainL = isDarkOverall ? Math.min(74, mainL + 8) : Math.max(38, mainL - 7);
    mainThemeEnd = hslToHex(endMainH, mainS, endMainL);

    const bubbleH = targetAccentH;
    const bubbleS = isMonochrome
      ? (glassmorphismMode ? 22 : 20)
      : glassmorphismMode
        ? Math.max(58, Math.min(84, dominant.s * 0.82 + 32))
        : Math.max(50, Math.min(78, dominant.s * 0.75 + 28));
    const bubbleL = isDarkOverall
      ? (glassmorphismMode ? 36 : 38)
      : (glassmorphismMode ? 76 : 79);
    bubbleTheme = hslToHex(bubbleH, bubbleS, bubbleL);
    const endBubbleH = (bubbleH + 20) % 360;
    const endBubbleL = isDarkOverall ? Math.min(44, bubbleL + 6) : Math.max(70, bubbleL - 6);
    bubbleThemeEnd = hslToHex(endBubbleH, bubbleS, endBubbleL);

    const bgH = mainH;
    const bgS = isMonochrome ? 16 : Math.max(68, Math.min(95, dominant.s * 1.2 + 35));
    const bgL = isDarkOverall ? 15 : 89;
    bgTheme = hslToHex(bgH, bgS, bgL);
    const endBgH = (bgH + (isDarkOverall ? -14 : 18) + 360) % 360;
    const endBgL = isDarkOverall ? 22 : 78;
    bgThemeEnd = hslToHex(endBgH, bgS, endBgL);
  }

  return {
    mainTheme,
    mainThemeEnd,
    panelTheme,
    panelThemeEnd,
    bubbleTheme,
    bubbleThemeEnd,
    bgTheme,
    bgThemeEnd,
    harmonyType,
  };
}

/**
 * 배경 이미지 경로와 모드 설정을 받아 자동 매칭된 전체 테마 색상을 반환합니다.
 */
export async function autoMatchColorsFromImage(
  imageUri: string,
  options: MatchOptions = {},
): Promise<MatchedThemeColors> {
  const palette = await extractPaletteFromImage(imageUri);
  return generateHarmoniousTheme(palette, options);
}

/**
 * 단일 색상(배경색 HEX)을 기반으로 가상 팔레트를 구성하여
 * 조화로운 테마 색상을 산출합니다. (배경 이미지가 없을 때 사용)
 */
export function generateThemeFromSingleColor(
  hexColor: string,
  options: MatchOptions = {}
): MatchedThemeColors {
  const baseHsl = hexToHsl(hexColor);
  const isDarkOverall = baseHsl.l < 48;
  const palette: ExtractedPalette = {
    dominant: baseHsl,
    vibrant: { ...baseHsl, s: Math.max(65, Math.min(95, baseHsl.s * 1.3 + 20)) },
    muted: { ...baseHsl, s: Math.max(15, baseHsl.s * 0.5), l: isDarkOverall ? 35 : 70 },
    light: { ...baseHsl, l: 94, s: Math.min(25, baseHsl.s * 0.4) },
    dark: { ...baseHsl, l: 15, s: Math.min(30, baseHsl.s * 0.5) },
    isDarkOverall,
  };
  return generateHarmoniousTheme(palette, options);
}
