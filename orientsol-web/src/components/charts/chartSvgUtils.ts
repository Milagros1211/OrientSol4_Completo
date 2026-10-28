/**
 * chartSvgUtils.ts - Shared SVG rendering and text-wrapping helpers for OrientSol charts.
 * Ensures clean multi-line wrapping (<tspan>) for titles and legends without clipping.
 */

/**
 * Splits text into lines such that each line does not exceed maxCharsPerLine (at word boundaries).
 */
export function wrapSvgTextLines(text: string, maxCharsPerLine = 44): string[] {
  if (!text) return [''];
  const trimmed = text.trim();
  if (trimmed.length <= maxCharsPerLine) {
    return [trimmed];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [trimmed];
}

export interface SvgTitleLayoutOptions {
  basePadTop?: number;
  basePlotH?: number;
  maxCharsPerLine?: number;
  fontSize?: number;
  lineHeight?: number;
  topMargin?: number;
  gapBelowTitle?: number;
}

export interface SvgTitleLayout {
  lines: string[];
  padTop: number;
  plotH: number;
  firstY: number;
  lineHeight: number;
  fontSize: number;
  extraH: number;
}

/**
 * Computes a dynamic layout for SVG titles that prevents clipping.
 * Dynamically expands plotH and padTop so multi-line wrapped titles have plenty of vertical room
 * and never overlap the chart plot box or clip above the SVG top boundary.
 */
export function computeSvgTitleLayout(
  text: string,
  options: SvgTitleLayoutOptions = {}
): SvgTitleLayout {
  const {
    basePadTop = 34,
    basePlotH = 205,
    maxCharsPerLine = 42,
    fontSize = 11.5,
    lineHeight = 14.5,
    topMargin = 16,
    gapBelowTitle = 10,
  } = options;

  const lines = wrapSvgTextLines(text, maxCharsPerLine);
  const numLines = Math.max(1, lines.length);

  let firstY: number;
  let neededPadTop: number;

  if (numLines === 1) {
    firstY = Math.max(topMargin, Math.round((basePadTop + fontSize * 0.7) / 2));
    neededPadTop = basePadTop;
  } else {
    firstY = topMargin;
    const lastLineBaseline = firstY + (numLines - 1) * lineHeight;
    neededPadTop = Math.max(basePadTop, Math.ceil(lastLineBaseline + gapBelowTitle));
  }

  const extraH = neededPadTop - basePadTop;
  const plotH = basePlotH + extraH;

  return {
    lines,
    padTop: neededPadTop,
    plotH,
    firstY,
    lineHeight,
    fontSize,
    extraH,
  };
}

export interface SvgTitleOptions {
  text?: string;
  lines?: string[];
  centerX: number;
  startY?: number;
  firstY?: number;
  fill: string;
  fontSize?: number;
  fontWeight?: string | number;
  lineHeight?: number;
  maxCharsPerLine?: number;
  id?: string;
}

/**
 * Renders an SVG <text> element with multi-line <tspan> wrapping if text exceeds maxCharsPerLine.
 * Protects against top clipping by enforcing a safe minimum baseline above y = 0.
 */
export function renderWrappedSvgTitle({
  text = '',
  lines: passedLines,
  centerX,
  startY,
  firstY: passedFirstY,
  fill,
  fontSize = 11.5,
  fontWeight = 700,
  lineHeight = 14.5,
  maxCharsPerLine = 42,
  id,
}: SvgTitleOptions): string {
  const lines = passedLines && passedLines.length > 0 ? passedLines : wrapSvgTextLines(text, maxCharsPerLine);
  const idAttr = id ? ` id="${id}"` : '';

  // Safe minimum baseline so capital letters (height ~ 0.85 * fontSize) never clip above y = 0
  const safeMinBaseline = Math.ceil(fontSize * 0.85) + 5; // e.g. 11.5 * 0.85 + 5 = ~15px

  let firstY: number;
  if (typeof passedFirstY === 'number') {
    firstY = Math.max(passedFirstY, safeMinBaseline);
  } else if (typeof startY === 'number') {
    if (lines.length <= 1) {
      firstY = Math.max(startY, safeMinBaseline);
    } else {
      const centered = startY - ((lines.length - 1) * lineHeight) / 2;
      firstY = Math.max(centered, safeMinBaseline);
    }
  } else {
    firstY = safeMinBaseline;
  }

  if (lines.length <= 1) {
    return `<text${idAttr} x="${centerX.toFixed(1)}" y="${firstY.toFixed(1)}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" text-anchor="middle">${lines[0] || ''}</text>`;
  }

  return `
    <text${idAttr} x="${centerX.toFixed(1)}" y="${firstY.toFixed(1)}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" text-anchor="middle">
      ${lines
        .map(
          (line, idx) =>
            `<tspan x="${centerX.toFixed(1)}" ${idx === 0 ? '' : `dy="${lineHeight}"`}>${line}</tspan>`
        )
        .join('')}
    </text>
  `.trim();
}
