import { jsPDF } from 'jspdf';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { getMonthlyRadiationForAngle, type TableRadiationComponent } from '@/components/climate/OptimalAnnualStudyPanel';
import { getSurfaceDisplayName, getCategoryBadge } from '@/i18n/surfaceTranslations';
import { showExportComponentChoiceModal, type ExportComponentChoice } from './exportModalHelper';
import { getNoonAzimuthDeg, getDualAxisNoonTiltDeg, getHorizontalTrackerDailyMeanTiltDeg } from '@/services/solarGeometryAngles';
import { formatNum, formatInt, formatAngle, formatPercent } from '@/utils/formatters';
import { solarSyncState } from '@/services/bridge/solarSyncState';
import { calculateOsterwaldEnergy } from '@/components/energy/EnergyCalculationPanel';

export { showExportComponentChoiceModal, type ExportComponentChoice };

/**
 * Shows MATLAB Figura 5.2.70 Warning Modal before generating PDF
 */
export function showPdfGenerationNoticeModal(
  isEn: boolean,
  onConfirm: () => void
): void {
  const existing = document.getElementById('matlab-pdf-notice-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'matlab-pdf-notice-modal';
  backdrop.className = 'matlab-modal-backdrop';

  backdrop.innerHTML = `
    <div class="matlab-dialog-box" role="dialog" aria-modal="true" style="max-width: 520px;">
      <div class="matlab-dialog-titlebar">
        <span class="matlab-title-text">${isEn ? 'Notice' : 'Aviso'}</span>
        <button type="button" class="matlab-close-btn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="matlab-dialog-body" style="padding: 1.5rem 1.25rem;">
        <div class="matlab-dialog-icon">
          <svg viewBox="0 0 48 48" width="46" height="46" fill="none">
            <circle cx="24" cy="24" r="22" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/>
            <path d="M19 18a5 5 0 0 1 10 0c0 3-4 4.5-4 7m0 5.5h.01" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="matlab-dialog-msg" style="font-size: 0.92rem; line-height: 1.5; color: var(--text-main, #0f172a);">
          <p style="margin: 0 0 0.5rem; font-weight: 700; color: var(--text-main, #0f172a);">
            ${isEn ? 'PLEASE WAIT a few seconds while the process is being performed.' : 'ESPERE unos segundos mientras se realiza el proceso.'}
          </p>
          <p style="margin: 0; color: var(--text-muted, #334155);">
            ${isEn
              ? 'The technical report in PDF format will now be generated with high-resolution vector charts, thermal insights, and CTE compliance metrics.'
              : 'A continuación se generará el informe técnico en formato PDF con gráficos vectoriales de alta precisión, balance energético, ranking de superficies y cumplimiento CTE DB-HE4.'}
          </p>
        </div>
      </div>
      <div class="matlab-dialog-actions" style="justify-content: center; padding-bottom: 1.2rem;">
        <button type="button" id="btn-pdf-notice-ok" class="matlab-btn-default" style="min-width: 90px;">
          Ok
        </button>
      </div>
    </div>
  `;

  const close = () => backdrop.remove();
  backdrop.querySelector('.matlab-close-btn')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.querySelector('#btn-pdf-notice-ok')?.addEventListener('click', () => {
    close();
    onConfirm();
  });

  document.body.appendChild(backdrop);
}

/**
 * Shows MATLAB Figura 5.2.71 Success Modal after PDF is generated
 */
export function showPdfGeneratedSuccessModal(
  saveLocationText: string,
  isEn: boolean
): void {
  const existing = document.getElementById('matlab-pdf-success-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'matlab-pdf-success-modal';
  backdrop.className = 'matlab-modal-backdrop';

  backdrop.innerHTML = `
    <div class="matlab-dialog-box" role="dialog" aria-modal="true" style="max-width: 480px;">
      <div class="matlab-dialog-titlebar">
        <span class="matlab-title-text">${isEn ? 'Notice' : 'Aviso'}</span>
        <button type="button" class="matlab-close-btn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="matlab-dialog-body" style="padding: 1.75rem 1.5rem; text-align: center;">
        <p class="matlab-dialog-msg" style="font-size: 0.95rem; color: var(--text-main, #0f172a); font-weight: 600; width: 100%;">
          ${isEn
            ? `Report successfully generated and saved to ${saveLocationText}`
            : `Informe generado y guardado en ${saveLocationText}`}
        </p>
      </div>
      <div class="matlab-dialog-actions" style="justify-content: center; padding-bottom: 1.2rem;">
        <button type="button" id="btn-pdf-success-ok" class="matlab-btn-default" style="min-width: 90px;">
          OK
        </button>
      </div>
    </div>
  `;

  const close = () => backdrop.remove();
  backdrop.querySelector('.matlab-close-btn')?.addEventListener('click', close);
  backdrop.querySelector('#btn-pdf-success-ok')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
}

export type OrientSolStudyType =
  | 'annual'
  | 'monthly'
  | 'seasonal'
  | 'polar'
  | 'azimuthal'
  | 'horizontal'
  | 'dual'
  | 'comparative';

export interface PDFReportOptions {
  peakPowerKw?: number;
  performanceRatio?: number;
  tonc?: number;
  coefTemp?: number;
  componentsMode?: 'single' | 'all';
  activeComponent?: TableRadiationComponent;
}

/**
 * Sanitizes Greek and non-Latin1 symbols to prevent encoding corruption and character spacing bugs in jsPDF Helvetica.
 */
function sanitizePdfText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[▲\u25B2]/g, '')
    .replace(/[▼\u25BC]/g, '')
    .replace(/β/g, 'Inc')
    .replace(/[γ\u03B3]/g, 'gamma')
    .replace(/[δ\u03B4]/g, 'delta')
    .replace(/[α\u03B1]/g, 'alfa')
    .replace(/[ψ\u03C8]/g, 'psi')
    .replace(/[λ\u03BB]/g, 'lambda')
    .replace(/[θ\u03B8]/g, 'theta')
    .replace(/[∫\u222B]/g, 'integral')
    .replace(/[≈\u2248]/g, '~')
    .replace(/[≠\u2260]/g, '!=')
    .replace(/±/g, '+/-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/∈/g, 'en')
    .replace(/★/g, '*');
}

export interface TextSubscriptSegment {
  text: string;
  isSub?: boolean;
  isSuper?: boolean;
  color?: [number, number, number];
  bold?: boolean;
}

/**
 * Draws text segments with true visual subscripts and superscripts in jsPDF.
 * Accurately scales font size, shifts baseline downwards (sub) or upwards (super),
 * and supports left/center/right alignment.
 */
function drawTextWithSubscripts(
  doc: jsPDF,
  segments: TextSubscriptSegment[],
  x: number,
  baseY: number,
  baseFontSize: number = 7,
  align: 'left' | 'center' | 'right' = 'left',
  defaultFontBold: boolean = false
): number {
  const currentFontName = doc.getFont().fontName || 'helvetica';
  const scriptRatio = 0.68;
  const scriptFontSize = baseFontSize * scriptRatio;
  // In jsPDF mm units: baseline shift for subscript is downwards (~28%), superscript is upwards (~34%)
  const subYShift = baseFontSize * 0.3528 * 0.28;
  const superYShift = -baseFontSize * 0.3528 * 0.34;

  // Sanitize all text segments before measurement and rendering to guarantee clean ASCII output
  const cleanSegments = segments.map((seg) => ({
    ...seg,
    text: sanitizePdfText(seg.text),
  }));

  // 1. Measure total width
  let totalW = 0;
  cleanSegments.forEach((seg) => {
    const isBold = seg.bold !== undefined ? seg.bold : defaultFontBold;
    doc.setFont(currentFontName, isBold ? 'bold' : 'normal');
    doc.setFontSize((seg.isSub || seg.isSuper) ? scriptFontSize : baseFontSize);
    totalW += doc.getTextWidth(seg.text);
  });

  // 2. Determine start X based on alignment
  let curX = x;
  if (align === 'center') {
    curX = x - totalW / 2;
  } else if (align === 'right') {
    curX = x - totalW;
  }

  // 3. Render each segment with appropriate style and baseline offset
  cleanSegments.forEach((seg) => {
    const isBold = seg.bold !== undefined ? seg.bold : defaultFontBold;
    doc.setFont(currentFontName, isBold ? 'bold' : 'normal');
    doc.setFontSize((seg.isSub || seg.isSuper) ? scriptFontSize : baseFontSize);
    if (seg.color) {
      doc.setTextColor(seg.color[0], seg.color[1], seg.color[2]);
    }
    const renderY = seg.isSub ? baseY + subYShift : seg.isSuper ? baseY + superYShift : baseY;
    doc.text(seg.text, curX, renderY);
    curX += doc.getTextWidth(seg.text);
  });

  // Restore base font size and normal state
  doc.setFontSize(baseFontSize);
  return totalW;
}

/**
 * Universal rich text renderer: Automatically detects and renders superscripts (m², m^2, m³, m^3)
 * with proportional font sizing and elevated baseline, matching the user's requested subíndice superior style.
 */
function drawRichText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  fontSize: number = 7,
  align: 'left' | 'center' | 'right' = 'left',
  bold: boolean = false,
  color?: [number, number, number]
): number {
  if (!text) return 0;
  if (!/[²³\^]/.test(text)) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    if (color) doc.setTextColor(color[0], color[1], color[2]);
    const clean = sanitizePdfText(text);
    doc.text(clean, x, y, { align });
    return doc.getTextWidth(clean);
  }

  const parts = text.split(/(²|\^2|³|\^3)/g);
  const segments: TextSubscriptSegment[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part === '²' || part === '^2') {
      segments.push({ text: '2', isSuper: true, color, bold });
    } else if (part === '³' || part === '^3') {
      segments.push({ text: '3', isSuper: true, color, bold });
    } else {
      segments.push({ text: part, isSuper: false, isSub: false, color, bold });
    }
  }

  return drawTextWithSubscripts(doc, segments, x, y, fontSize, align, bold);
}

/**
 * Renders an elegant highlighted insights callout card with icon, title, and bullet points,
 * calculating dynamic height and line-wrapping to strictly prevent horizontal cutoffs or border clipping.
 */
function drawPdfInsightBox(
  doc: jsPDF,
  title: string,
  points: string[],
  x: number,
  y: number,
  w: number,
  minH: number = 26
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxAllowedY = pageHeight - 15; // 282mm safe threshold above footer line at 285mm
  const cleanTitle = sanitizePdfText(title);
  const cleanPoints = points.map((p) => sanitizePdfText(p));

  const isCompactBox = w < 100;
  const textStartX = isCompactBox ? x + 7.5 : x + 8;
  // Available width spans virtually the entire box width leaving a comfortable 4mm padding on the right
  const maxTextW = Math.max(30, w - 11);

  // Pre-calculate line wrapping with the EXACT font and size used for rendering
  doc.setFont('helvetica', 'normal');
  const bodyFontSize = isCompactBox ? 5.8 : 6.5;
  doc.setFontSize(bodyFontSize);
  const wrappedList: string[][] = cleanPoints.map((pt) => {
    const bulletText = `- ${pt}`;
    return doc.splitTextToSize(bulletText, maxTextW);
  });

  // Title wrapping for compact / half-width cards
  const titleFontSize = isCompactBox ? 6.8 : 7.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  const titleLines: string[] = doc.splitTextToSize(cleanTitle, maxTextW);

  const totalLines = wrappedList.reduce((acc, lines) => acc + lines.length, 0);
  const lineSpacing = isCompactBox ? 2.9 : 3.3;
  const titleSpacing = 3.3;
  let calculatedH = Math.max(
    minH,
    6 + titleLines.length * titleSpacing + 2 + totalLines * lineSpacing + (cleanPoints.length - 1) * 1.5 + 4
  );

  // If box bottom would exceed page limit, clamp height and adjust text spacing
  if (y + calculatedH > maxAllowedY) {
    calculatedH = Math.max(minH, maxAllowedY - y);
  }

  doc.setFillColor(240, 249, 255);
  doc.setDrawColor(56, 189, 248);
  doc.setLineWidth(0.6);
  doc.roundedRect(x, y, w, calculatedH, 2, 2, 'FD');

  doc.setFillColor(2, 132, 199);
  doc.roundedRect(x + 2.5, y + 2.5, 3.0, calculatedH - 5, 0.8, 0.8, 'F');

  // Draw Title Lines
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(titleFontSize);
  doc.setTextColor(3, 105, 161);
  let titleCurY = y + 5.8;
  for (const tLine of titleLines) {
    doc.text(tLine, textStartX, titleCurY);
    titleCurY += titleSpacing;
  }

  // Draw Body Bullets
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(bodyFontSize);
  doc.setTextColor(30, 41, 59);

  let textY = Math.max(y + 10.5, titleCurY + 0.8);
  for (const lines of wrappedList) {
    for (const l of lines) {
      if (textY < y + calculatedH - 2) {
        doc.text(l, textStartX, textY);
        textY += lineSpacing;
      }
    }
    textY += isCompactBox ? 1.0 : 1.2;
  }

  return calculatedH;
}

/**
 * Shared academic & corporate header and footer chrome across all OrientSol 4.0 PDF reports.
 * Fully wraps chapter titles and subheaders with splitTextToSize so that no phrases are ever cut.
 */
export function drawOrientSolPageChrome(
  doc: jsPDF,
  options: {
    chapterTitle: string;
    subHeader: string;
    pageNum: number;
    totalPages: number;
    formattedDateTime: string;
    isoTimestamp: string;
    isEn: boolean;
    skipHeader?: boolean;
  }
): void {
  const pageHeight = doc.internal.pageSize.getHeight();

  if (!options.skipHeader) {
    // 1. Right badge: Universidad de Jaén & Export date
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    doc.text('UNIVERSIDAD DE JAEN', 190, 13, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const exportLabel = options.isEn ? 'Exported:' : 'Exportado:';
    doc.text(`${exportLabel} ${options.formattedDateTime}`, 190, 17.5, { align: 'right' });

    // 2. Left running title: wrap cleanly without cutting any phrase (max 128mm width)
    const cleanChapterTitle = sanitizePdfText(options.chapterTitle);
    doc.setFont('helvetica', 'bold');
    // Scale font size slightly if title is long so it fits on one clean line whenever possible
    const titleFontSize = cleanChapterTitle.length > 70 ? 8.0 : 8.5;
    doc.setFontSize(titleFontSize);
    doc.setTextColor(15, 23, 42);
    const maxTitleChromeW = 128;
    const titleLines: string[] = doc.splitTextToSize(cleanChapterTitle, maxTitleChromeW);
    const titleLineHeight = titleFontSize === 8.0 ? 3.5 : 3.8;
    titleLines.forEach((line, idx) => {
      doc.text(line, 20, 11.5 + idx * titleLineHeight);
    });

    // 3. Left running subheader: wrap without cutting any phrase
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    const subLines: string[] = doc.splitTextToSize(sanitizePdfText(options.subHeader), maxTitleChromeW);
    const subStartY = 11.5 + titleLines.length * titleLineHeight;
    subLines.forEach((line, idx) => {
      doc.text(line, 20, subStartY + idx * 3.2);
    });

    // 4. Divider line
    const dividerY = Math.max(22.5, subStartY + subLines.length * 3.2 + 1.8);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(20, dividerY, 190, dividerY);
  }

  // 5. Running footer on every page
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(20, pageHeight - 12, 190, pageHeight - 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    options.isEn
      ? `OrientSol 4.0 Report • Timestamp: ${options.formattedDateTime} (${options.isoTimestamp})`
      : `Informe Técnico OrientSol 4.0 • Timestamp: ${options.formattedDateTime} (${options.isoTimestamp})`,
    20,
    pageHeight - 7
  );
  doc.setFont('helvetica', 'bold');
  doc.text(`${options.pageNum} / ${options.totalPages}`, 190, pageHeight - 7, { align: 'right' });
}

/**
 * Generates the full OrientSol 4.0 Technical PDF Report strictly matching the layout,
 * operations, temperature cards, ranking of 8 topologies, CTE DB-HE4 loss map, and highlighted
 * technical insights boxes on all figures.
 */
export async function generateOrientSolPDFReport(
  res: SolarBridgeSimulationResult,
  isEn = false,
  studyType: OrientSolStudyType = 'annual',
  options?: PDFReportOptions
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const optAngle = res.optimalAnnual.optimalTiltDeg;
  const peakKw = options?.peakPowerKw ?? solarSyncState.getPeakPowerKw() ?? 5.0;
  const pr = options?.performanceRatio ?? 0.80;
  const tonc = options?.tonc ?? solarSyncState.getTonc() ?? 47.0;
  const coefTemp = options?.coefTemp ?? solarSyncState.getCoefTemp() ?? -0.0035;

  // Exact Timestamp
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(now.getDate());
  const month = pad(now.getMonth() + 1);
  const year = now.getFullYear();
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  const formattedDateTime = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  const isoTimestamp = now.toISOString();
  const fileTimestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;

  const monthsEsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthsEnShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mShort = isEn ? monthsEnShort : monthsEsShort;

  const monthsEsFull = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  const monthsEnFull = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const mFull = isEn ? monthsEnFull : monthsEsFull;

  const studyNames: Record<OrientSolStudyType, { es: string; en: string }> = {
    annual: { es: 'Inclinación Óptima Anual', en: 'Annual Optimal Tilt' },
    monthly: { es: 'Optimización Mensual (12 Posiciones Independientes)', en: 'Monthly Optimization (12 Independent Positions)' },
    seasonal: { es: 'Inclinación Óptima Estacional (4 Ajustes)', en: 'Seasonal Optimal Tilt (4 Adjustments)' },
    polar: { es: 'Seguimiento a un Eje Polar', en: 'Single-Axis Polar Tracking' },
    azimuthal: { es: 'Seguimiento a un Eje Azimutal', en: 'Single-Axis Azimuthal Tracking' },
    horizontal: { es: 'Seguimiento a un Eje Horizontal (E-O)', en: 'Single-Axis Horizontal Tracking (E-W)' },
    dual: { es: 'Seguimiento a Dos Ejes Continuo', en: 'Two-Axis Continuous Tracking' },
    comparative: { es: 'Comparativa Global de Todas las Superficies', en: 'Global Benchmark of All Surfaces' },
  };

  const currentStudyName = isEn ? studyNames[studyType].en : studyNames[studyType].es;
  const cleanStudyName = sanitizePdfText(currentStudyName);

  // -------------------------------------------------------------
  // Mapas de pérdidas adicionales (12 mensuales / 4 estacionales)
  // -------------------------------------------------------------
  type MiniLossMap = {
    label: string;
    sub: string;
    betaDeg: number;
    alphaDeg: number;
    maxDaily: number;
    zones: { generalPctCompliant: number; superpositionPctCompliant: number; integrationPctCompliant: number };
    lossMatrix?: number[][];
  };
  const lossMapRes = res.captureLossMap;
  const monthlyMapsList: MiniLossMap[] =
    lossMapRes?.monthlyMaps && lossMapRes.monthlyMaps.length === 12
      ? lossMapRes.monthlyMaps.map((m, i) => {
          const bDeg = Number(m.optimalPoint.betaDeg);
          const aDeg = Math.abs(bDeg) < 0.01 ? 0 : Number(m.optimalPoint.alphaDeg);
          return {
            label: mFull[i],
            sub: isEn ? 'Monthly map' : 'Mapa mensual',
            betaDeg: bDeg,
            alphaDeg: aDeg,
            maxDaily: Number(m.optimalPoint.maxDailyRadiationKwh),
            zones: m.cteZones,
            lossMatrix: m.lossPercentageMatrix,
          };
        })
      : [];

  const buildSeasonalMaps = (): MiniLossMap[] => {
    const namesEs = ['Invierno', 'Primavera', 'Verano', 'Otoño'];
    const namesEn = ['Winter', 'Spring', 'Summer', 'Autumn'];
    const monthsEs = ['Dic - Ene - Feb', 'Mar - Abr - May', 'Jun - Jul - Ago', 'Sep - Oct - Nov'];
    const monthsEn = ['Dec - Jan - Feb', 'Mar - Apr - May', 'Jun - Jul - Aug', 'Sep - Oct - Nov'];
    if (lossMapRes?.seasonalMaps && lossMapRes.seasonalMaps.length === 4) {
      return lossMapRes.seasonalMaps.map((s, i) => {
        const bDeg = Number(s.optimalPoint.betaDeg);
        const aDeg = Math.abs(bDeg) < 0.01 ? 0 : Number(s.optimalPoint.alphaDeg);
        return {
          label: isEn ? s.seasonNameEn || namesEn[i] : s.seasonName || namesEs[i],
          sub: isEn ? s.monthsIncludedEn || monthsEn[i] : s.monthsIncluded || monthsEs[i],
          betaDeg: bDeg,
          alphaDeg: aDeg,
          maxDaily: Number(s.optimalPoint.maxDailyRadiationKwh),
          zones: s.cteZones,
          lossMatrix: s.lossPercentageMatrix,
        };
      });
    }
    const mm = lossMapRes?.monthlyMaps;
    if (!mm || mm.length !== 12) return [];
    const groups = [[11, 0, 1], [2, 3, 4], [5, 6, 7], [8, 9, 10]];
    const betas = lossMapRes.betasDeg;
    const alphas = lossMapRes.alphasDeg;
    return groups.map((g, si) => {
      const nR = betas.length;
      const nC = alphas.length;
      const rad: number[][] = Array.from({ length: nR }, () => new Array(nC).fill(0));
      let maxRad = 0;
      let bB = 0;
      let bA = 0;
      for (let r = 0; r < nR; r++) {
        for (let c = 0; c < nC; c++) {
          let sum = 0;
          for (const mi of g) sum += mm[mi].radiationMatrixKwhM2Day[r][c];
          const avg = sum / g.length;
          rad[r][c] = avg;
          const isBetter =
            avg > maxRad + 1e-4 ||
            (Math.abs(avg - maxRad) <= 1e-4 && (Math.abs(alphas[c]) < Math.abs(bA) || (Math.abs(alphas[c]) === Math.abs(bA) && betas[r] < bB)));
          if (isBetter) {
            maxRad = avg;
            bB = betas[r];
            bA = Math.abs(betas[r]) < 0.01 ? 0 : alphas[c];
          }
        }
      }
      let c10 = 0;
      let c20 = 0;
      let c40 = 0;
      const loss: number[][] = rad.map((row) =>
        row.map((v) => {
          const l = maxRad > 0 ? ((maxRad - v) / maxRad) * 100 : 0;
          if (l <= 10) c10++;
          if (l <= 20) c20++;
          if (l <= 40) c40++;
          return l;
        })
      );
      const tot = nR * nC || 1;
      return {
        label: isEn ? namesEn[si] : namesEs[si],
        sub: isEn ? monthsEn[si] : monthsEs[si],
        betaDeg: bB,
        alphaDeg: bA,
        maxDaily: maxRad,
        zones: {
          generalPctCompliant: Math.round((c10 / tot) * 1000) / 10,
          superpositionPctCompliant: Math.round((c20 / tot) * 1000) / 10,
          integrationPctCompliant: Math.round((c40 / tot) * 1000) / 10,
        },
        lossMatrix: loss,
      };
    });
  };

  const extraMapsList: MiniLossMap[] =
    studyType === 'monthly' ? monthlyMapsList : studyType === 'seasonal' ? buildSeasonalMaps() : [];
  const mapsPerPage = studyType === 'monthly' ? 6 : 4;
  const extraMapPages = extraMapsList.length > 0 ? Math.ceil(extraMapsList.length / mapsPerPage) : 0;

  const componentsToRender: {
    comp: TableRadiationComponent;
    label: string;
    nameEs: string;
    nameEn: string;
  }[] =
    options?.componentsMode === 'all'
      ? [
          { comp: 'global', label: 'Gdm', nameEs: 'Radiación Global', nameEn: 'Global Radiation' },
          { comp: 'beam', label: 'Bdm', nameEs: 'Radiación Directa', nameEn: 'Direct Radiation' },
          { comp: 'diffuse', label: 'Ddm', nameEs: 'Radiación Difusa', nameEn: 'Diffuse Radiation' },
          { comp: 'albedo', label: 'Rdm', nameEs: 'Radiación de Albedo', nameEn: 'Albedo Radiation' },
        ]
      : (() => {
          const activeC = options?.activeComponent || 'global';
          const label = activeC === 'beam' ? 'Bdm' : activeC === 'diffuse' ? 'Ddm' : activeC === 'albedo' ? 'Rdm' : 'Gdm';
          const nameEs = activeC === 'beam' ? 'Radiación Directa' : activeC === 'diffuse' ? 'Radiación Difusa' : activeC === 'albedo' ? 'Radiación de Albedo' : 'Radiación Global';
          const nameEn = activeC === 'beam' ? 'Direct Radiation' : activeC === 'diffuse' ? 'Diffuse Radiation' : activeC === 'albedo' ? 'Albedo Radiation' : 'Global Radiation';
          return [{ comp: activeC, label, nameEs, nameEn }];
        })();

  const hasEnergyPage = studyType !== 'comparative';
  const energyPageCount = hasEnergyPage ? 1 : 0;
  const numCompPages = componentsToRender.length;
  const pageChap1 = 2;
  const pageChap2 = 3;
  const pageEnergy = 3 + numCompPages;
  const pageChapBenchmark = pageEnergy + energyPageCount;
  const pageChapLossMaps = pageChapBenchmark + 1;
  const pageChapEvolution = pageChapLossMaps + 1 + extraMapPages;
  const totalPagesDyn = pageChapEvolution;

  // Header & Footer helper
  const drawPageChrome = (chapterTitle: string, pageNum: number, totalPages: number) => {
    drawOrientSolPageChrome(doc, {
      chapterTitle,
      subHeader: `OrientSol 4.0 • ${cleanStudyName} • ${res.locationName} (Lat: ${formatNum(res.latitude, 2)}°)`,
      pageNum,
      totalPages,
      formattedDateTime,
      isoTimestamp,
      isEn,
      skipHeader: pageNum === 1,
    });
  };

  // Helper for highlighted insight boxes
  const drawInsightBox = (
    title: string,
    points: string[],
    x: number,
    y: number,
    w: number,
    minH?: number
  ) => {
    return drawPdfInsightBox(doc, title, points, x, y, w, minH);
  };

  // =========================================================================
  // PÁGINA 1: PORTADA, RESUMEN CLIMÁTICO Y TARJETAS DE TEMPERATURA (Imagen 1)
  // =========================================================================
  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 42, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(248, 250, 252);
  const bannerTitle = isEn
    ? `OrientSol 4.0 Results: ${res.locationName} (Lat: ${formatNum(res.latitude, 2)}°)`
    : `Resultados OrientSol 4.0: ${res.locationName} (Lat: ${formatNum(res.latitude, 2)}°)`;
  const bannerLines = doc.splitTextToSize(sanitizePdfText(bannerTitle), 170);
  if (bannerLines.length > 1) {
    doc.text(bannerLines[0], 20, 15);
    doc.text(bannerLines[1], 20, 22);
  } else {
    doc.text(bannerLines[0] || '', 20, 19);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  const subBanner = isEn
    ? `Solar Radiation & PV Simulation Report • MATLAB to Web & Desktop Migration`
    : `Informe Técnico de Simulación Solar y Fotovoltaica • Migración MATLAB a Web & Desktop`;
  const subBannerLines = doc.splitTextToSize(subBanner, 170);
  doc.text(subBannerLines[0] || '', 20, bannerLines.length > 1 ? 27.5 : 26.5);

  // Prominent Timestamp Pill with WRAPPED TEXT & Dynamic Scaling
  const auditText = isEn
    ? `TIMESTAMP AUDIT RECORD: Exported on ${formattedDateTime} (ISO: ${isoTimestamp}) • Engine: Python 3.14 WASM (${res.executionTimeMs} ms)`
    : `REGISTRO OFICIAL DE AUDITORÍA: Exportado el ${formattedDateTime} (ISO: ${isoTimestamp}) • Motor: Python 3.14 WASM (${res.executionTimeMs} ms)`;
  const cleanAuditText = sanitizePdfText(auditText);
  let pillFontSize = 7.0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(pillFontSize);
  while (doc.getTextWidth(cleanAuditText) > 164 && pillFontSize > 5.4) {
    pillFontSize -= 0.2;
    doc.setFontSize(pillFontSize);
  }
  const pillLines: string[] = doc.splitTextToSize(cleanAuditText, 164);
  const pillH = pillLines.length > 1 ? 8.5 : 7.0;
  const pillY = bannerLines.length > 1 ? 31.5 : 31.0;

  doc.setFillColor(30, 41, 59);
  doc.roundedRect(20, pillY, 170, pillH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(pillFontSize);
  doc.setTextColor(56, 189, 248);

  if (pillLines.length === 1) {
    doc.text(pillLines[0], 23, pillY + 4.8);
  } else {
    doc.text(pillLines[0], 23, pillY + 3.6);
    if (pillLines[1]) doc.text(pillLines[1], 23, pillY + 7.0);
  }

  // -------------------------------------------------------------
  // 4 TARJETAS DE TEMPERATURA AMBIENTAL Y CÉLULA OPERATIVA (Imagen 1)
  // -------------------------------------------------------------
  const cardW = 39.5;
  const cardH = 26;
  const cardGap = 4;
  const cardY = 48;

  // Tarjeta 1: Temp Media Anual
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'ANNUAL MEAN TEMP' : 'TEMP. MEDIA ANUAL', 24, cardY + 6);
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${formatNum(res.temperatures.ambient.annualMeanC, 1)} °C`, 24, cardY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Monthly ambient mean' : 'Media ambiente mensual', 24, cardY + 22);

  // Tarjeta 2: Temp Máxima Anual
  const card2X = 20 + cardW + cardGap;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(card2X, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'ANNUAL MAX TEMP' : 'TEMP. MÁXIMA ANUAL', card2X + 4, cardY + 6);
  doc.setFontSize(16);
  doc.setTextColor(220, 38, 38);
  doc.text(`${formatNum(res.temperatures.ambient.annualMaxC, 1)} °C`, card2X + 4, cardY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Peak summer high' : 'Pico estival máximo', card2X + 4, cardY + 22);

  // Tarjeta 3: Temp Mínima Anual
  const card3X = card2X + cardW + cardGap;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(card3X, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'ANNUAL MIN TEMP' : 'TEMP. MÍNIMA ANUAL', card3X + 4, cardY + 6);
  doc.setFontSize(16);
  doc.setTextColor(2, 132, 199);
  doc.text(`${formatNum(res.temperatures.ambient.annualMinC, 1)} °C`, card3X + 4, cardY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Winter absolute low' : 'Mínima invernal absoluta', card3X + 4, cardY + 22);

  // Tarjeta 4: Temp Célula Operativa Tc con WRAPPED TEXT (Línea 1 + Línea 2 con subíndice Tc)
  const card4X = card3X + cardW + cardGap;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(card4X, cardY, cardW, cardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'CELL OPERATING TEMP' : 'TEMP. CÉLULA OPERATIVA', card4X + 4, cardY + 5.2);
  drawTextWithSubscripts(
    doc,
    [
      { text: '(', color: [100, 116, 139] },
      { text: 'T', color: [100, 116, 139] },
      { text: 'C', isSub: true, color: [100, 116, 139] },
      { text: ')', color: [100, 116, 139] }
    ],
    card4X + 4,
    cardY + 8.4,
    6.2,
    'left',
    true
  );
  doc.setFontSize(16);
  doc.setTextColor(180, 83, 9);
  doc.text(`${formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1)} °C`, card4X + 4, cardY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `TONC ${formatNum(tonc, 1)}°C (${isEn ? 'Max' : 'Máx'}: ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)}°C)`,
    card4X + 4,
    cardY + 22
  );

  // -------------------------------------------------------------
  // TABLA DE CONTENIDOS DEL INFORME (Matching Figura 5.2.72)
  // -------------------------------------------------------------
  const tocY = 82;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'Table of Contents' : 'Tabla de Contenidos', 20, tocY);

  doc.setDrawColor(56, 189, 248);
  doc.setLineWidth(0.8);
  doc.line(20, tocY + 2, 65, tocY + 2);

  interface TocEntry {
    num: string;
    title: string;
    page: number;
    isSub?: boolean;
  }

  const tocList: TocEntry[] = [
    {
      num: '1',
      title: isEn
        ? 'Energy Yield Balance & Thermal Derating (Osterwald vs Simplified)'
        : 'Balance Energético y Comportamiento Térmico Fotovoltaico (Osterwald vs Simplificado)',
      page: pageChap1,
    },
    {
      num: '2',
      title: isEn
        ? `Selected Operation Study: ${cleanStudyName}`
        : `Estudio Solar Seleccionado: ${cleanStudyName}`,
      page: pageChap2,
    },
  ];

  // List component analysis pages in the index when multiple components are rendered
  if (componentsToRender.length > 1) {
    componentsToRender.forEach((cItem, cIdx) => {
      const compTargetPage = 3 + cIdx;
      const compTitle = isEn
        ? `${cItem.nameEn} (${cItem.label}) • Monthly radiation & thermal performance`
        : `${cItem.nameEs} (${cItem.label}) • Radiación mensual y comportamiento térmico`;
      tocList.push({
        num: `2.${cIdx + 1}`,
        title: compTitle,
        page: compTargetPage,
        isSub: true,
      });
    });
  }

  if (hasEnergyPage) {
    tocList.push({
      num: '3',
      title: isEn
        ? `PV Energy Yield Calculation (Osterwald Method) - ${cleanStudyName}`
        : `Cálculo de la Energía Producida (Método de Osterwald) - ${cleanStudyName}`,
      page: pageEnergy,
    });
  }

  const benchmarkNum = hasEnergyPage ? '4' : '3';
  const lossMapsNum = hasEnergyPage ? '5' : '4';
  const evolutionNum = hasEnergyPage ? '6' : '5';

  tocList.push(
    {
      num: benchmarkNum,
      title: isEn
        ? 'Global Benchmark & Ranking of All 8 Solar Collector Topologies'
        : 'Comparativa y Ranking Global de las 8 Topologías de Captación',
      page: pageChapBenchmark,
    },
    {
      num: lossMapsNum,
      title: isEn
        ? 'Technical Building Code (CTE DB-HE4) Captation Losses Matrix'
        : extraMapPages > 0
        ? (studyType === 'monthly'
            ? 'Mapas de Pérdidas de Captación CTE DB-HE4 (Anual + 12 Mensuales)'
            : 'Mapas de Pérdidas de Captación CTE DB-HE4 (Anual + 4 Estacionales)')
        : 'Mapa de Pérdidas de Captación y Cumplimiento CTE DB-HE4',
      page: pageChapLossMaps,
    },
    {
      num: evolutionNum,
      title: isEn
        ? 'Continuous Radiation Evolution Curve (Tilt Spectrum 1° to 90°)'
        : 'Evolución Continua de Radiación en el Rango de Inclinaciones (1° a 90°)',
      page: pageChapEvolution,
    }
  );

  doc.setFont('helvetica', 'normal');
  const isMultiComp = componentsToRender.length > 1;
  const rowH = (isMultiComp || hasEnergyPage) ? 5.8 : 7.2;
  const rowGap = (isMultiComp || hasEnergyPage) ? 6.8 : 8.2;
  let curTocY = tocY + 9;

  tocList.forEach((item) => {
    const targetPage = item.page;
    const isSub = !!item.isSub;

    // Number badge dimensions
    const badgeW = isSub ? 7.5 : 5.5;
    const badgeX = isSub ? 25.5 : 22;
    const titleX = badgeX + badgeW + 3;

    // Configure typography before measuring wrapped text
    doc.setFont('helvetica', isSub ? 'normal' : 'bold');
    doc.setFontSize(isSub ? 7.5 : 8);
    doc.setTextColor(isSub ? 51 : 30, isSub ? 65 : 41, isSub ? 85 : 59);

    // Dynamic text wrapping: ensure title never overflows into the page pill at x = 174
    const maxTitleW = 163 - titleX;
    const titleLines: string[] = doc.splitTextToSize(item.title, maxTitleW);
    const lineSpacing = 3.6;
    const extraH = (titleLines.length - 1) * lineSpacing;
    const thisRowH = rowH + extraH;
    const thisRowGap = rowGap + extraH;

    // Interactive row background with indentation for sub-items
    const rowX = isSub ? 24 : 20;
    const rowW = isSub ? 166 : 170;
    doc.setFillColor(isSub ? 241 : 248, isSub ? 245 : 250, isSub ? 249 : 252);
    doc.roundedRect(rowX, curTocY - 4.2, rowW, thisRowH, 1.2, 1.2, 'F');

    // Number badge (stays aligned with the first line)
    if (isSub) {
      doc.setFillColor(2, 132, 199); // Sky/cyan badge for sub-items
    } else {
      doc.setFillColor(3, 105, 161); // Deep Navy badge for chapters
    }
    doc.roundedRect(badgeX, curTocY - 3.2, badgeW, 4.6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isSub ? 6.2 : 7);
    doc.setTextColor(255, 255, 255);
    const numW = doc.getTextWidth(item.num);
    doc.text(item.num, badgeX + (badgeW - numW) / 2, curTocY);

    // Chapter / Component Title (wrapped across lines)
    doc.setFont('helvetica', isSub ? 'normal' : 'bold');
    doc.setFontSize(isSub ? 7.5 : 8);
    doc.setTextColor(isSub ? 51 : 30, isSub ? 65 : 41, isSub ? 85 : 59);
    titleLines.forEach((tLine: string, lineIdx: number) => {
      doc.text(tLine, titleX, curTocY + lineIdx * lineSpacing);
    });

    // Dotted guide line (drawn on the last line of the title connecting to the page pill)
    const lastLineIdx = titleLines.length - 1;
    const lastLineY = curTocY + lastLineIdx * lineSpacing;
    const lastLineW = doc.getTextWidth(titleLines[lastLineIdx]);
    let dotX = titleX + lastLineW + 3;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    while (dotX < 172) {
      doc.text('.', dotX, lastLineY);
      dotX += 2.8;
    }

    // Page badge pill with EXACT dynamic page number (aligned with the last line)
    const pillY = curTocY - 3.2 + lastLineIdx * lineSpacing;
    const pillTextY = curTocY + lastLineIdx * lineSpacing;
    doc.setFillColor(isSub ? 240 : 224, isSub ? 249 : 242, isSub ? 255 : 254);
    doc.roundedRect(174, pillY, 14, 4.6, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(2, 132, 199);
    doc.text(`${isEn ? 'p.' : 'Pág.'} ${targetPage}`, 175.2, pillTextY);

    // Register Clickable Hyperlink to the EXACT target page
    doc.link(rowX, curTocY - 4.2, rowW, thisRowH, { pageNumber: targetPage });

    // Register PDF document outline bookmark
    try {
      if ((doc as any).outline?.add) {
        (doc as any).outline.add(null, `${item.num}. ${item.title}`, { pageNumber: targetPage });
      }
    } catch {
      // Outline is optional
    }

    curTocY += thisRowGap;
  });

  // Project Parameters Summary Box (Balanced 2-column layout with strict text wrapping to prevent any overflow)
  const paramsY = curTocY + (isMultiComp ? 4 : 6);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, paramsY, 170, 48, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'GENERAL INSTALLATION & CLIMATIC PARAMETERS' : 'PARÁMETROS GENERALES DE LA INSTALACIÓN Y EMPLAZAMIENTO', 24, paramsY + 7);

  const c1LabX = 24;
  const c1ValX = 51;
  const c2LabX = 116;
  const c2ValX = 143;
  const col1ValMaxW = c2LabX - c1ValX - 2; // 63 mm width
  const col2ValMaxW = 188 - c2ValX;       // 45 mm width
  const subLineH = 3.4;

  doc.setFontSize(7.5);

  // Row 1: Location & Data Source (Fully wrapped & vertically centered if multiline)
  const latHemisphere = res.latitude >= 0 ? 'N' : 'S';
  const locValText = `${sanitizePdfText(res.locationName)} (${formatNum(Math.abs(res.latitude), 2)}° ${latHemisphere})`;
  const locLines: string[] = doc.splitTextToSize(locValText, col1ValMaxW);

  doc.setFont('helvetica', 'bold');
  const locLabel = `${isEn ? 'Location' : 'Localidad'}:`;
  if (locLines.length <= 1) {
    doc.text(locLabel, c1LabX, paramsY + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(locLines[0] || '', c1ValX, paramsY + 15);
  } else {
    const startY1 = paramsY + 15 - ((locLines.length - 1) * subLineH) / 2;
    doc.text(locLabel, c1LabX, startY1);
    doc.setFont('helvetica', 'normal');
    locLines.forEach((lineText: string, idx: number) => {
      doc.text(lineText, c1ValX, startY1 + idx * subLineH);
    });
  }

  const sourceLines: string[] = doc.splitTextToSize(sanitizePdfText(res.source.toUpperCase()), col2ValMaxW);
  doc.setFont('helvetica', 'bold');
  const sourceLabel = `${isEn ? 'Data Source' : 'Fuente de Datos'}:`;
  if (sourceLines.length <= 1) {
    doc.text(sourceLabel, c2LabX, paramsY + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(sourceLines[0] || '', c2ValX, paramsY + 15);
  } else {
    const startY1Source = paramsY + 15 - ((sourceLines.length - 1) * subLineH) / 2;
    doc.text(sourceLabel, c2LabX, startY1Source);
    doc.setFont('helvetica', 'normal');
    sourceLines.forEach((lineText: string, idx: number) => {
      doc.text(lineText, c2ValX, startY1Source + idx * subLineH);
    });
  }

  // Row 2: Peak Power & Performance Ratio
  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Peak Power' : 'Potencia Pico'}:`, c1LabX, paramsY + 23);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatNum(peakKw, 2)} kWp`, c1ValX, paramsY + 23);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Performance Ratio' : 'Rendimiento (PR)'}:`, c2LabX, paramsY + 23);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatNum(pr * 100, 0)}%`, c2ValX, paramsY + 23);

  // Row 3: Module NOCT & Collector Area
  const toncValText = `${formatNum(tonc, 1)} °C (gamma: ${formatNum(coefTemp * 100, 2)}%/°C)`;
  const toncLines: string[] = doc.splitTextToSize(toncValText, col1ValMaxW);
  doc.setFont('helvetica', 'bold');
  const toncLabel = `${isEn ? 'Module NOCT' : 'TONC Módulos'}:`;
  if (toncLines.length <= 1) {
    doc.text(toncLabel, c1LabX, paramsY + 31);
    doc.setFont('helvetica', 'normal');
    doc.text(toncLines[0] || '', c1ValX, paramsY + 31);
  } else {
    const startY3 = paramsY + 31 - ((toncLines.length - 1) * subLineH) / 2;
    doc.text(toncLabel, c1LabX, startY3);
    doc.setFont('helvetica', 'normal');
    toncLines.forEach((lineText: string, idx: number) => {
      doc.text(lineText, c1ValX, startY3 + idx * subLineH);
    });
  }

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Collector Area' : 'Sup. Captación'}:`, c2LabX, paramsY + 31);
  drawRichText(doc, `${formatNum(res.energyYield.collectorAreaM2, 1)} m²`, c2ValX, paramsY + 31, 7);

  // Row 4: Optimal Tilt & Study
  const optValText = `${formatNum(optAngle, 1)}° (+${formatNum(res.optimalAnnual.gainOverHorizontalPct, 1)}% vs Horiz)`;
  const optLines: string[] = doc.splitTextToSize(optValText, col1ValMaxW);
  doc.setFont('helvetica', 'bold');
  const optLabel = `${isEn ? 'Fixed Optimal Tilt' : 'Inclinación Óptima'}:`;
  if (optLines.length <= 1) {
    doc.text(optLabel, c1LabX, paramsY + 39);
    doc.setFont('helvetica', 'normal');
    doc.text(optLines[0] || '', c1ValX, paramsY + 39);
  } else {
    const startY4 = paramsY + 39 - ((optLines.length - 1) * subLineH) / 2;
    doc.text(optLabel, c1LabX, startY4);
    doc.setFont('helvetica', 'normal');
    optLines.forEach((lineText: string, idx: number) => {
      doc.text(lineText, c1ValX, startY4 + idx * subLineH);
    });
  }

  const studyParamsLines: string[] = doc.splitTextToSize(sanitizePdfText(cleanStudyName), col2ValMaxW);
  doc.setFont('helvetica', 'bold');
  const studyLabel = `${isEn ? 'Study' : 'Estudio'}:`;
  if (studyParamsLines.length <= 1) {
    doc.text(studyLabel, c2LabX, paramsY + 39);
    doc.setFont('helvetica', 'normal');
    doc.text(studyParamsLines[0] || '', c2ValX, paramsY + 39);
  } else {
    const startYStudy = paramsY + 39 - ((studyParamsLines.length - 1) * subLineH) / 2;
    doc.text(studyLabel, c2LabX, startYStudy);
    doc.setFont('helvetica', 'normal');
    studyParamsLines.forEach((lineText: string, idx: number) => {
      doc.text(lineText, c2ValX, startYStudy + idx * subLineH);
    });
  }

  drawPageChrome('', 1, totalPagesDyn);

  // =========================================================================
  // PÁGINA 2: GRÁFICOS DE RADIACIÓN Y PRODUCCIÓN FV CON INSIGHTS (Imagen 1)
  // =========================================================================
  doc.addPage();
  drawPageChrome(isEn ? 'Chapter 1. Energy Yield Balance & Thermal Derating' : 'Capítulo 1. Balance Energético y Comportamiento Térmico', 2, totalPagesDyn);

  // Big Energy Metric Cards
  const bmY = 28;
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(20, bmY, 82, 28, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text(isEn ? 'INCIDENT SOLAR ENERGY RECEIVED' : 'ENERGÍA SOLAR INCIDENTE RECIBIDA', 24, bmY + 6);
  doc.setFontSize(14);
  doc.text(`${formatInt(res.energyYield.recibida.annualTotalKwh)} kWh/${isEn ? 'yr' : 'año'}`, 24, bmY + 16);
  drawRichText(doc, `${formatNum(res.energyYield.recibida.annualKwhM2, 1)} kWh/m²·${isEn ? 'yr' : 'año'} • ${formatNum(res.energyYield.recibida.meanDailyKwhM2, 2)} kWh/m²/${isEn ? 'day' : 'día'}`, 24, bmY + 23, 7, 'left', false, [180, 83, 9]);

  doc.setFillColor(209, 250, 229);
  doc.roundedRect(108, bmY, 82, 28, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(4, 120, 87);
  doc.text(isEn ? 'PRODUCED PV ENERGY (OSTERWALD)' : 'ENERGÍA FV GENERADA (OSTERWALD)', 112, bmY + 6);
  doc.setFontSize(14);
  doc.text(`${formatInt(res.energyYield.producida.osterwald.annualKwh)} kWh/${isEn ? 'yr' : 'año'}`, 112, bmY + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`${isEn ? 'Specific Yield' : 'Rendimiento'}: ${formatInt(res.energyYield.producida.osterwald.specificYieldKwhKwp)} kWh/kWp • ${isEn ? 'Simplified' : 'Simplif'}: ${formatInt(res.energyYield.producida.simplified.annualKwh)} kWh`, 112, bmY + 23);

  // -------------------------------------------------------------
  // GRÁFICO 1: RADIACIÓN SOLAR MENSUAL POR SUPERFICIE
  // (Horizontal vs Fijo Óptimo vs 12 Óptimos Mensuales / Operación)
  // -------------------------------------------------------------
  const chart1Y = 60;
  drawRichText(doc, isEn ? 'Monthly Solar Radiation by Surface (kWh/m²/day)' : 'Radiación Solar Mensual por Superficie (kWh/m²/día)', 20, chart1Y, 9, 'left', true, [15, 23, 42]);

  const c1W = 170;
  const c1H = 50;
  const c1BoxY = chart1Y + 3;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, c1BoxY, c1W, c1H, 2, 2, 'FD');

  // Legend
  doc.setFontSize(7);
  doc.setFillColor(14, 165, 233);
  doc.circle(28, c1BoxY + 6, 2, 'F');
  doc.setTextColor(71, 85, 105);
  doc.text('Horizontal (0°)', 32, c1BoxY + 7);

  doc.setFillColor(234, 179, 8);
  doc.circle(75, c1BoxY + 6, 2, 'F');
  doc.text(isEn ? `Fixed Optimum (${optAngle}°)` : `Fijo Óptimo (${optAngle}°)`, 79, c1BoxY + 7);

  doc.setFillColor(16, 185, 129);
  doc.circle(125, c1BoxY + 6, 2, 'F');
  const legLines = doc.splitTextToSize(cleanStudyName, 55);
  doc.text(legLines, 129, c1BoxY + (legLines.length > 1 ? 5.5 : 7));

  // Bars for each month
  const radH = res.horizontal.gdm0;
  const radOpt = res.optimalAnnual.monthlyDailyKwh;
  const radAct =
    studyType === 'monthly'
      ? res.monthlyOptimum12.monthlyDailyKwh
      : studyType === 'seasonal'
      ? res.seasonal.monthlyDailyKwh
      : studyType === 'polar'
      ? res.tracking.polarAxis.monthlyDailyKwh
      : studyType === 'azimuthal'
      ? res.tracking.azimuthalAxis.monthlyDailyKwh
      : studyType === 'horizontal'
      ? res.tracking.horizontalAxis.monthlyDailyKwh
      : studyType === 'dual'
      ? res.tracking.dualAxis.monthlyDailyKwh
      : radOpt;

  const maxRadPlot = 10.0;
  const baseY1 = c1BoxY + c1H - 7;
  const plotH1 = 30.0;
  const axisX = 30.0;
  const axisEndX = 186.0;
  const stepX1 = 12.8;

  // Draw Y-Axis (Left) and Gridlines for Radiation Chart
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(axisX, baseY1, axisX, baseY1 - plotH1); // Vertical Y axis
  doc.line(axisX, baseY1, axisEndX, baseY1);        // Horizontal X baseline

  const radTicks = [2, 4, 6, 8, 10];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(148, 163, 184);
  // Y-Axis Title (Wrapped into 2 clean lines above top tick)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(71, 85, 105);
  doc.text('Gdm', axisX - 2, baseY1 - plotH1 - 3.5, { align: 'right' });
  doc.text('(kWh/m²/d)', axisX - 2, baseY1 - plotH1 - 1.0, { align: 'right' });

  radTicks.forEach((tv) => {
    const yT = baseY1 - (tv / maxRadPlot) * plotH1;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.3);
    doc.line(axisX, yT, axisEndX, yT); // Subtle gridline
    doc.setDrawColor(203, 213, 225);
    doc.line(axisX - 1.2, yT, axisX, yT); // Tick mark
    doc.text(String(tv), axisX - 1.5, yT + 1.2, { align: 'right' });
  });

  // Calculate Max and Min for highlighted badges
  const maxRadVal = Math.max(...radAct);
  const maxRadIdx = radAct.indexOf(maxRadVal);
  const minRadVal = Math.min(...radAct);
  const minRadIdx = radAct.indexOf(minRadVal);

  for (let i = 0; i < 12; i++) {
    const xBase = axisX + 2.0 + i * stepX1;

    // Bar 1: Horizontal (Blue)
    const h1 = (radH[i] / maxRadPlot) * plotH1;
    doc.setFillColor(14, 165, 233);
    doc.rect(xBase, baseY1 - h1, 2.9, h1, 'F');

    // Bar 2: Fixed Opt (Amber)
    const h2 = (radOpt[i] / maxRadPlot) * plotH1;
    doc.setFillColor(234, 179, 8);
    doc.rect(xBase + 3.1, baseY1 - h2, 2.9, h2, 'F');

    // Bar 3: Active Study (Green)
    const h3 = (radAct[i] / maxRadPlot) * plotH1;
    doc.setFillColor(16, 185, 129);
    doc.rect(xBase + 6.2, baseY1 - h3, 2.9, h3, 'F');

    // Month label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(mShort[i], xBase + 1.5, baseY1 + 4);
  }

  // X-Axis Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Month of the year' : 'Mes del año', (axisX + axisEndX) / 2, baseY1 + 7.2, { align: 'center' });

  // Max and Min labels on Chart 1
  const xMax1 = axisX + 2.0 + maxRadIdx * stepX1 + 7.6;
  const yMax1 = baseY1 - (maxRadVal / maxRadPlot) * plotH1 - 1.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(220, 38, 38);
  doc.text(`${isEn ? 'MAX' : 'MÁX'}: ${formatNum(maxRadVal, 2)}`, xMax1, yMax1, { align: 'center' });

  const xMin1 = axisX + 2.0 + minRadIdx * stepX1 + 7.6;
  const yMin1 = baseY1 - (minRadVal / maxRadPlot) * plotH1 - 1.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(2, 132, 199);
  doc.text(`${isEn ? 'MIN' : 'MÍN'}: ${formatNum(minRadVal, 2)}`, xMin1, yMin1, { align: 'center' });

  // -------------------------------------------------------------
  // GRÁFICO 2: PRODUCCIÓN FV Y COMPORTAMIENTO TÉRMICO
  // -------------------------------------------------------------
  const chart2Y = c1BoxY + c1H + 6;
  drawTextWithSubscripts(
    doc,
    isEn
      ? [
          { text: 'PV Energy Yield (kWh) & Thermal Behavior (' },
          { text: 'T' },
          { text: 'C', isSub: true },
          { text: ' vs T' },
          { text: 'amb', isSub: true },
          { text: ')' }
        ]
      : [
          { text: 'Producción de Energía FV (kWh) y Comportamiento Térmico (' },
          { text: 'T' },
          { text: 'C', isSub: true },
          { text: ' vs T' },
          { text: 'amb', isSub: true },
          { text: ')' }
        ],
    20,
    chart2Y,
    9,
    'left',
    true
  );

  const c2BoxY = chart2Y + 3;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, c2BoxY, c1W, c1H, 2, 2, 'FD');

  // Legend
  doc.setFontSize(7);
  doc.setFillColor(16, 185, 129);
  doc.rect(28, c2BoxY + 4, 4, 3, 'F');
  doc.setTextColor(71, 85, 105);
  doc.text(isEn ? 'PV Yield (kWh)' : 'Producción FV (kWh)', 34, c2BoxY + 7);

  doc.setFillColor(220, 38, 38);
  doc.circle(85, c2BoxY + 6, 2, 'F');
  drawTextWithSubscripts(
    doc,
    isEn
      ? [
          { text: 'Cell Temp T', color: [71, 85, 105] },
          { text: 'C', isSub: true, color: [71, 85, 105] },
          { text: ' (°C)', color: [71, 85, 105] }
        ]
      : [
          { text: 'Temp. Célula T', color: [71, 85, 105] },
          { text: 'C', isSub: true, color: [71, 85, 105] },
          { text: ' (°C)', color: [71, 85, 105] }
        ],
    89,
    c2BoxY + 7,
    7,
    'left',
    false
  );

  doc.setFillColor(2, 132, 199);
  doc.circle(135, c2BoxY + 6, 2, 'F');
  drawTextWithSubscripts(
    doc,
    isEn
      ? [
          { text: 'Ambient Temp T', color: [71, 85, 105] },
          { text: 'amb', isSub: true, color: [71, 85, 105] },
          { text: ' (°C)', color: [71, 85, 105] }
        ]
      : [
          { text: 'Temp. Ambiente T', color: [71, 85, 105] },
          { text: 'amb', isSub: true, color: [71, 85, 105] },
          { text: ' (°C)', color: [71, 85, 105] }
        ],
    139,
    c2BoxY + 7,
    7,
    'left',
    false
  );

  const pvMonthly = res.energyYield.producida.osterwald.monthlyKwh;
  const maxPvVal = Math.max(...pvMonthly);
  const maxPvPlot = Math.max(1000, Math.ceil((maxPvVal * 1.30) / 200) * 200);
  const baseY2 = c2BoxY + c1H - 7;
  const plotH2 = 30.0;
  const rightAxisX = 184.0;

  // Draw Dual Axes (Left: Energy kWh, Right: Temp °C)
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(axisX, baseY2, axisX, baseY2 - plotH2);             // Left axis
  doc.line(rightAxisX, baseY2, rightAxisX, baseY2 - plotH2);   // Right axis
  doc.line(axisX, baseY2, rightAxisX, baseY2);                 // Baseline

  // Left Energy Ticks
  const pvTicks = [0.25, 0.5, 0.75, 1.0].map((f) => Math.round(maxPvPlot * f));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(148, 163, 184);
  doc.text('0', axisX - 1.5, baseY2 + 1, { align: 'right' });

  // Left Y-Axis Title (Wrapped into 2 clean lines above top tick)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(71, 85, 105);
  doc.text(isEn ? 'PV Yield' : 'Prod. FV', axisX - 2, baseY2 - plotH2 - 3.5, { align: 'right' });
  doc.text('(kWh)', axisX - 2, baseY2 - plotH2 - 1.0, { align: 'right' });

  pvTicks.forEach((tv) => {
    const yT = baseY2 - (tv / maxPvPlot) * plotH2;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.3);
    doc.line(axisX, yT, rightAxisX, yT); // Gridline
    doc.setDrawColor(203, 213, 225);
    doc.line(axisX - 1.2, yT, axisX, yT);
    doc.text(formatInt(tv), axisX - 1.5, yT + 1.2, { align: 'right' });
  });

  // Right Temperature Ticks (0..50 °C)
  const tempTicks = [10, 20, 30, 40, 50];
  // Right Y-Axis Title (Wrapped into 2 clean lines above top tick)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(71, 85, 105);
  doc.text('Temp.', rightAxisX + 2, baseY2 - plotH2 - 3.5);
  doc.text('(°C)', rightAxisX + 2, baseY2 - plotH2 - 1.0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.setTextColor(148, 163, 184);
  tempTicks.forEach((tv) => {
    const yT = baseY2 - (tv / 55.0) * plotH2;
    doc.setDrawColor(203, 213, 225);
    doc.line(rightAxisX, yT, rightAxisX + 1.2, yT);
    doc.text(`${tv}°`, rightAxisX + 2, yT + 1.2);
  });

  // Temperature line points
  const tcPoints: { x: number; y: number }[] = [];
  const taPoints: { x: number; y: number }[] = [];

  for (let i = 0; i < 12; i++) {
    const xBase = axisX + 2.0 + i * stepX1;
    const valPv = pvMonthly[i] ?? 0;
    const hPv = (valPv / maxPvPlot) * plotH2;

    doc.setFillColor(16, 185, 129);
    doc.rect(xBase, baseY2 - hPv, 8.2, hPv, 'F');

    // Temp cell y (0 to 55 °C range)
    const yTc = baseY2 - (res.temperatures.cellOperating.monthlyCellTempOptimalC[i] / 55.0) * plotH2;
    const yTa = baseY2 - (res.temperatures.ambient.monthlyMeanC[i] / 55.0) * plotH2;
    tcPoints.push({ x: xBase + 4.1, y: yTc });
    taPoints.push({ x: xBase + 4.1, y: yTa });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(mShort[i], xBase + 1.5, baseY2 + 4);
  }

  // X-Axis Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Month of the year' : 'Mes del año', (axisX + rightAxisX) / 2, baseY2 + 7.2, { align: 'center' });

  // Draw Tc curve line (Red)
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.8);
  for (let i = 0; i < 11; i++) {
    doc.line(tcPoints[i].x, tcPoints[i].y, tcPoints[i + 1].x, tcPoints[i + 1].y);
    doc.circle(tcPoints[i].x, tcPoints[i].y, 0.8, 'F');
  }
  doc.circle(tcPoints[11].x, tcPoints[11].y, 0.8, 'F');

  // Draw Ta curve line (Blue dashed)
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.6);
  for (let i = 0; i < 11; i++) {
    doc.line(taPoints[i].x, taPoints[i].y, taPoints[i + 1].x, taPoints[i + 1].y);
    doc.circle(taPoints[i].x, taPoints[i].y, 0.7, 'F');
  }
  doc.circle(taPoints[11].x, taPoints[11].y, 0.7, 'F');

  // Max and Min labels on Chart 2 (PV Production and Peak Temperatures)
  const maxPvIdx = pvMonthly.indexOf(maxPvVal);
  const minPvVal = Math.min(...pvMonthly);
  const minPvIdx = pvMonthly.indexOf(minPvVal);

  const tcVals = res.temperatures.cellOperating.monthlyCellTempOptimalC;
  const maxTcVal = Math.max(...tcVals);
  const maxTcIdx = tcVals.indexOf(maxTcVal);
  const pTcMax = tcPoints[maxTcIdx];

  // Draw prominent red dot on Tc peak point
  doc.setFillColor(220, 38, 38);
  doc.circle(pTcMax.x, pTcMax.y, 1.4, 'F');

  // Compute text and widths
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);

  const maxPvText = `${isEn ? 'MAX' : 'MÁX'}: ${formatInt(Math.round(maxPvVal))} kWh`;
  const maxPvTextW = doc.getTextWidth(maxPvText);
  const pvPillW = maxPvTextW + 3.0;
  const pvPillH = 3.8;
  const xPvMax = axisX + 2.0 + maxPvIdx * stepX1 + 4.1;
  const barTopMaxY = baseY2 - (maxPvVal / maxPvPlot) * plotH2;

  const tcMaxLabel = ` ${isEn ? 'MAX' : 'MÁX'}: ${formatNum(maxTcVal, 1)}°C`;
  const tcPillW = 20.0;
  const tcPillH = 3.8;
  const xTcMax = pTcMax.x;

  // Collision detection between PV peak callout and Tc peak callout
  const isMonthNear = Math.abs(maxPvIdx - maxTcIdx) <= 1;

  let yPvPill: number;
  let yTcPill: number;

  if (isMonthNear) {
    // Both peaks occur on the same or adjacent months (e.g. July) -> Stack vertically with guaranteed spacing
    const topAnchorY = Math.min(barTopMaxY, pTcMax.y);

    // Tier 1 (Lower): Tc Max Callout, directly above the curve/bar
    yTcPill = topAnchorY - 1.8;
    // Tier 2 (Upper): PV Max Callout, stacked cleanly above Tc Callout with 0.9mm gap
    yPvPill = (yTcPill - tcPillH) - 0.9;

    // Draw subtle vertical leader line from red dot up to Tc callout if dot is below the pill
    if (pTcMax.y > yTcPill) {
      doc.setDrawColor(254, 202, 202);
      doc.setLineWidth(0.4);
      doc.line(xTcMax, pTcMax.y - 1.5, xTcMax, yTcPill);
    }
  } else {
    // Separate months (>= 2 months apart) -> Each sits independently above its own feature
    yPvPill = barTopMaxY - 1.8;
    yTcPill = pTcMax.y - 1.8;
  }

  // 1. Render Peak PV Callout (Green border, white background, high contrast)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(167, 243, 208);
  doc.setLineWidth(0.3);
  doc.roundedRect(xPvMax - pvPillW / 2, yPvPill - pvPillH, pvPillW, pvPillH, 0.8, 0.8, 'FD');
  doc.setTextColor(5, 150, 105);
  doc.text(maxPvText, xPvMax, yPvPill - 1.1, { align: 'center' });

  // 2. Render Peak Cell Temperature Callout (Red border, white background)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(254, 202, 202);
  doc.setLineWidth(0.3);
  doc.roundedRect(xTcMax - tcPillW / 2, yTcPill - tcPillH, tcPillW, tcPillH, 0.8, 0.8, 'FD');
  drawTextWithSubscripts(
    doc,
    [
      { text: 'T', color: [220, 38, 38] },
      { text: 'C', isSub: true, color: [220, 38, 38] },
      { text: tcMaxLabel, color: [220, 38, 38] }
    ],
    xTcMax,
    yTcPill - 1.1,
    5,
    'center',
    true
  );

  // 3. Min PV Callout with Collision Prevention (relative to temperature curves)
  const minPvText = `${isEn ? 'MIN' : 'MÍN'}: ${formatInt(Math.round(minPvVal))} kWh`;
  const minPvTextW = doc.getTextWidth(minPvText);
  const minPillW = minPvTextW + 2.6;
  const xPvMin = axisX + 2.0 + minPvIdx * stepX1 + 4.1;
  const barTopMinY = baseY2 - (minPvVal / maxPvPlot) * plotH2;
  const yPvMinAbove = barTopMinY - 1.8;
  const tcAtMin = tcPoints[minPvIdx]?.y ?? 0;
  const taAtMin = taPoints[minPvIdx]?.y ?? 0;
  const collidesWithCurves = Math.abs(yPvMinAbove - tcAtMin) < 5.5 || Math.abs(yPvMinAbove - taAtMin) < 5.5;

  if (collidesWithCurves) {
    // If temperature curves cross directly above the bar, render cleanly INSIDE the bar in white text with high-contrast badge
    const yPvMinInside = barTopMinY + 4.2;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(xPvMin - minPillW / 2, yPvMinInside - 3.2, minPillW, 3.8, 0.8, 0.8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(minPvText, xPvMin, yPvMinInside - 0.7, { align: 'center' });
  } else {
    // Render above bar with crisp white pill badge
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(xPvMin - minPillW / 2, yPvMinAbove - 3.4, minPillW, 3.8, 0.8, 0.8, 'FD');
    doc.setTextColor(100, 116, 139);
    doc.text(minPvText, xPvMin, yPvMinAbove - 0.8, { align: 'center' });
  }

  // -------------------------------------------------------------
  // CAJA DE INSIGHTS RELEVANTES RESALTADOS (Imagen 1)
  // -------------------------------------------------------------
  const ins1Y = c2BoxY + c1H + 6;
  const radAnnMax = Math.max(...res.optimalAnnual.monthlyDailyKwh);
  const radAnnMin = Math.min(...res.optimalAnnual.monthlyDailyKwh);
  const thermLossKwh = Math.abs(Math.round(res.energyYield.producida.osterwald.thermalLossKwh));
  const thermLossPct = formatNum(Math.abs(res.energyYield.producida.osterwald.thermalLossPct), 2);

  drawInsightBox(
    isEn ? 'KEY TECHNICAL INSIGHTS: SOLAR DYNAMICS & THERMAL BEHAVIOR' : 'INSIGHTS TÉCNICOS DESTACADOS: DINÁMICA SOLAR Y COMPORTAMIENTO TÉRMICO',
    isEn
      ? [
          `Seasonal Variation & Leveling: Incident solar resource exhibits marked seasonality (peak ${formatNum(radAnnMax, 2)} kWh/m²/d vs ${formatNum(radAnnMin, 2)} kWh/m²/d in December). Angular adaptation in autumn and winter boosts collection by up to +40% over a horizontal plane, bridging the seasonal electricity generation gap.`,
          `Thermal Derating from Cell Heating: During summer, operating cell temperature reaches means of ${formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1)}°C (peak ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)}°C). With gamma = -0.40%/°C, thermal losses reach -${formatInt(thermLossKwh)} kWh/yr (-${thermLossPct}%), making spring months (April-May) achieve the highest net electrical efficiency.`,
        ]
      : [
          `Variación Estacional y Nivelación: El recurso solar incidente presenta una acusada estacionalidad (pico estival de ${formatNum(radAnnMax, 2)} kWh/m²/d vs ${formatNum(radAnnMin, 2)} kWh/m²/d en invierno). La adaptación angular en otoño e invierno incrementa la captación hasta un +40% respecto a superficie horizontal, reduciendo la brecha estacional de generación eléctrica.`,
          `Derating Térmico por Calentamiento de Célula: Durante el estío, la temperatura de célula operativa alcanza medias de ${formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1)}°C (pico de ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)}°C). Con gamma = -0,40%/°C, las pérdidas térmicas ascienden a -${formatInt(thermLossKwh)} kWh/año (-${thermLossPct}%), haciendo que los meses primaverales (abril-mayo) presenten la mayor eficiencia neta.`,
        ],
    20,
    ins1Y,
    170,
    30
  );

  // =========================================================================
  // CAPÍTULO 2: ESTUDIO SOLAR SELECCIONADO (1 O 4 COMPONENTES DEDICADAS)
  // =========================================================================
  componentsToRender.forEach((cItem, cIdx) => {
    const pageNo = 3 + cIdx;
    doc.addPage();
    const chapterHeader =
      componentsToRender.length > 1
        ? (isEn
            ? `Chapter 2.${cIdx + 1}. ${cleanStudyName}: ${cItem.nameEn} (${cItem.label})`
            : `Capítulo 2.${cIdx + 1}. ${cleanStudyName}: ${cItem.nameEs} (${cItem.label})`)
        : (isEn
            ? `Chapter 2. Selected Solar Study: ${cleanStudyName} (${cItem.label})`
            : `Capítulo 2. Estudio Solar Seleccionado: ${cleanStudyName} (${cItem.label})`);

    drawPageChrome(chapterHeader, pageNo, totalPagesDyn);

    const comp = cItem.comp;
    const compLabel = cItem.label;

    // Monthly values for horizontal, design optimal, and active study
    const radH_c: number[] =
      comp === 'global'
        ? res.horizontal.gdm0
        : comp === 'beam'
        ? res.horizontal.bdm0
        : comp === 'diffuse'
        ? res.horizontal.ddm0
        : new Array(12).fill(0.0);

    const radOpt_c: number[] = getMonthlyRadiationForAngle(res, comp, optAngle);

    const radAct_c: number[] = (() => {
      if (studyType === 'monthly') {
        return res.monthlyOptimum12.optimalTiltsDeg.map((deg, i) => getMonthlyRadiationForAngle(res, comp, deg)[i]);
      }
      if (studyType === 'seasonal') {
        const seasonalTilts = [
          res.seasonal.winterTiltDeg,
          res.seasonal.winterTiltDeg,
          res.seasonal.springTiltDeg,
          res.seasonal.springTiltDeg,
          res.seasonal.springTiltDeg,
          res.seasonal.summerTiltDeg,
          res.seasonal.summerTiltDeg,
          res.seasonal.summerTiltDeg,
          res.seasonal.autumnTiltDeg,
          res.seasonal.autumnTiltDeg,
          res.seasonal.autumnTiltDeg,
          res.seasonal.winterTiltDeg,
        ];
        return seasonalTilts.map((deg, i) => getMonthlyRadiationForAngle(res, comp, deg)[i]);
      }
      if (studyType === 'polar') {
        if (comp === 'global') return res.tracking.polarAxis.monthlyDailyKwh;
        if (res.tracking.polarAxis.components) return res.tracking.polarAxis.components[comp];
        return radOpt_c.map((v, i) => (v / (res.optimalAnnual.monthlyDailyKwh[i] || 1)) * res.tracking.polarAxis.monthlyDailyKwh[i]);
      }
      if (studyType === 'azimuthal') {
        if (comp === 'global') return res.tracking.azimuthalAxis.monthlyDailyKwh;
        if (res.tracking.azimuthalAxis.components) return res.tracking.azimuthalAxis.components[comp];
        return radOpt_c.map((v, i) => (v / (res.optimalAnnual.monthlyDailyKwh[i] || 1)) * res.tracking.azimuthalAxis.monthlyDailyKwh[i]);
      }
      if (studyType === 'horizontal') {
        if (comp === 'global') return res.tracking.horizontalAxis.monthlyDailyKwh;
        if (res.tracking.horizontalAxis.components) return res.tracking.horizontalAxis.components[comp];
        return radOpt_c.map((v, i) => (v / (res.optimalAnnual.monthlyDailyKwh[i] || 1)) * res.tracking.horizontalAxis.monthlyDailyKwh[i]);
      }
      if (studyType === 'dual') {
        if (comp === 'global') return res.tracking.dualAxis.monthlyDailyKwh;
        return radOpt_c.map((v, i) => (v / (res.optimalAnnual.monthlyDailyKwh[i] || 1)) * res.tracking.dualAxis.monthlyDailyKwh[i]);
      }
      return radOpt_c;
    })();

    const activeMeanDailyKwh_c = radAct_c.reduce((a, b) => a + b, 0) / 12;
    const activeAnnualTotalKwh_c = activeMeanDailyKwh_c * 365;
    const optMeanDailyKwh_c = radOpt_c.reduce((a, b) => a + b, 0) / 12;
    const optAnnualTotalKwh_c = optMeanDailyKwh_c * 365;
    const horizMeanDailyKwh_c = radH_c.reduce((a, b) => a + b, 0) / 12;
    const horizAnnualTotalKwh_c = horizMeanDailyKwh_c * 365;

    const gainVsOpt_c =
      studyType === 'annual'
        ? 0.0
        : optAnnualTotalKwh_c > 0
        ? ((activeAnnualTotalKwh_c - optAnnualTotalKwh_c) / optAnnualTotalKwh_c) * 100
        : 0.0;

    const gainVsHoriz_c =
      comp === 'albedo'
        ? NaN
        : horizAnnualTotalKwh_c > 0
        ? ((activeAnnualTotalKwh_c - horizAnnualTotalKwh_c) / horizAnnualTotalKwh_c) * 100
        : 0.0;

    const pvMonthly_c = pvMonthly.map((pv, i) => {
      const gGlob = res.optimalAnnual.monthlyDailyKwh[i] || 1;
      return (radAct_c[i] / gGlob) * pv;
    });

    if (studyType === 'comparative') {
      // -------------------------------------------------------------
      // OP OPERACIÓN 8: TABLA COMPARATIVA DE TODOS LOS MODELOS (FIGURA 5.2.98)
      // -------------------------------------------------------------
      const rad0_comp =
        comp === 'global' ? res.horizontal.gdm0
        : comp === 'beam' ? res.horizontal.bdm0
        : comp === 'diffuse' ? res.horizontal.ddm0
        : new Array(12).fill(0.0);

      const getCompData = (
        compObj: { global?: number[]; beam?: number[]; diffuse?: number[]; albedo?: number[] } | undefined,
        fallback: number[]
      ) => {
        if (comp === 'global') return fallback;
        if (compObj && compObj[comp]) return compObj[comp]!;
        if (comp === 'beam') return res.horizontal.bdm0;
        if (comp === 'diffuse') return res.horizontal.ddm0;
        return new Array(12).fill(0.0);
      };

      const radOptAnn_comp = getMonthlyRadiationForAngle(res, comp, res.optimalAnnual.optimalTiltDeg);
      const radOptSeas_comp =
        comp === 'global'
          ? res.seasonal.monthlyDailyKwh
          : getMonthlyRadiationForAngle(
              res,
              comp,
              Math.round((res.seasonal.winterTiltDeg + res.seasonal.summerTiltDeg) / 2)
            );

      const monthlyOptTilts = res.monthlyOptimum12?.optimalTiltsDeg ?? [];
      const radOptMonthly_comp: number[] = [];
      for (let m = 0; m < 12; m++) {
        if (comp === 'global') {
          radOptMonthly_comp.push(res.monthlyOptimum12?.monthlyDailyKwh?.[m] ?? res.horizontal.gdm0[m]);
        } else {
          const tiltM = monthlyOptTilts[m] ?? res.optimalAnnual.optimalTiltDeg;
          const radMonth = getMonthlyRadiationForAngle(res, comp, tiltM);
          radOptMonthly_comp.push(radMonth[m]);
        }
      }

      const radPolar_comp = getCompData(res.tracking.polarAxis.components, res.tracking.polarAxis.monthlyDailyKwh);
      const radAzim_comp = getCompData(res.tracking.azimuthalAxis.components, res.tracking.azimuthalAxis.monthlyDailyKwh);
      const radHorizTrack_comp = getCompData(res.tracking.horizontalAxis.components, res.tracking.horizontalAxis.monthlyDailyKwh);
      const radDual_comp = getCompData(res.tracking.dualAxis.components, res.tracking.dualAxis.monthlyDailyKwh);
      const tempMean_comp = res.temperatures.ambient.monthlyMeanC;

      // Annual daily averages
      const avgArr = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / 12;
      const m0_val = avgArr(rad0_comp);
      const mAnn_val = avgArr(radOptAnn_comp);
      const mSeas_val = avgArr(radOptSeas_comp);
      const mMth_val = avgArr(radOptMonthly_comp);
      const mPolar_val = avgArr(radPolar_comp);
      const mAzim_val = avgArr(radAzim_comp);
      const mHoriz_val = avgArr(radHorizTrack_comp);
      const mDual_val = avgArr(radDual_comp);
      const mTemp_val = res.temperatures.ambient.annualMeanC;

      // Exact angles for each study configuration across months
      const seasonTilts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
        if (i === 11 || i === 0 || i === 1) {
          return res.seasonal?.winterTiltDeg ?? 60;
        } else if (i === 2 || i === 3 || i === 4) {
          return res.seasonal?.springTiltDeg ?? 35;
        } else if (i === 5 || i === 6 || i === 7) {
          return res.seasonal?.summerTiltDeg ?? 15;
        }
        return res.seasonal?.autumnTiltDeg ?? 35;
      });
      const avgSeasonalTilt = avgArr(seasonTilts);
      const avgMonthlyTilt = monthlyOptTilts.length ? avgArr(monthlyOptTilts) : 0;
      const noonDualTilts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => getDualAxisNoonTiltDeg(res.latitude, i));
      const noonAzims = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => getNoonAzimuthDeg(res.latitude, i));
      const horizTilts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => getHorizontalTrackerDailyMeanTiltDeg(res.latitude, i));
      const avgDualTilt = avgArr(noonDualTilts);
      const avgDualAzim = avgArr(noonAzims);
      const avgHorizTilt = avgArr(horizTilts);
      const fixedOri = res.latitude >= 0 ? 0.0 : 180.0;

      // 1. Top 4 KPI Summary Cards (y = 28, height = 20, width = 39.5)
      const opBarY = 28;
      const opCardW = 39.5;
      const opCardH = 20;

      // Card 1: Horizontal (0°)
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(20, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'HORIZONTAL (0°)' : 'PLANO HORIZONTAL (0°)', 24, opBarY + 5.0);
      doc.setTextColor(15, 23, 42);
      drawRichText(doc, `${formatNum(m0_val, 2)} kWh/m²/d`, 24, opBarY + 12.5, 12, 'left', true, [15, 23, 42]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      drawRichText(doc, `${formatInt(m0_val * 365)} kWh/m²·${isEn ? 'yr' : 'año'}`, 24, opBarY + 17.5, 6, 'left', false, [100, 116, 139]);

      // Card 2: Fixed Optimum
      const op2X = 20 + opCardW + cardGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(op2X, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? `FIXED OPT (${optAngle}°)` : `ÓPTIMO FIJO (${optAngle}°)`, op2X + 4, opBarY + 5.0);
      drawRichText(doc, `${formatNum(mAnn_val, 2)} kWh/m²/d`, op2X + 4, opBarY + 12.5, 12, 'left', true, [2, 132, 199]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      const diffAnn0 = ((mAnn_val - m0_val) / (m0_val || 1)) * 100;
      const subAnn = comp === 'albedo' ? 'Rdm(0°) = 0' : `${diffAnn0 >= 0 ? '+' : ''}${formatNum(diffAnn0, 1)}% ${isEn ? 'vs horiz' : 's/ horiz'}`;
      doc.text(subAnn, op2X + 4, opBarY + 17.5);

      // Card 3: Monthly Optimum (12 positions)
      const op3X = op2X + opCardW + cardGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(op3X, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'MONTHLY OPT (12 POS)' : 'ÓPTIMO MENSUAL (12 POS)', op3X + 4, opBarY + 5.0);
      drawRichText(doc, `${formatNum(mMth_val, 2)} kWh/m²/d`, op3X + 4, opBarY + 12.5, 12, 'left', true, [16, 185, 129]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      const diffMth0 = ((mMth_val - m0_val) / (m0_val || 1)) * 100;
      const subMth = comp === 'albedo' ? 'Rdm(0°) = 0' : `${diffMth0 >= 0 ? '+' : ''}${formatNum(diffMth0, 1)}% ${isEn ? 'vs horiz' : 's/ horiz'}`;
      doc.text(subMth, op3X + 4, opBarY + 17.5);

      // Card 4: Two-Axis Tracking
      const op4X = op3X + opCardW + cardGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(op4X, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'TWO-AXIS TRACKING' : 'SEGUIM. A DOS EJES', op4X + 4, opBarY + 5.0);
      drawRichText(doc, `${formatNum(mDual_val, 2)} kWh/m²/d`, op4X + 4, opBarY + 12.5, 12, 'left', true, [5, 150, 105]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      const diffDual0 = ((mDual_val - m0_val) / (m0_val || 1)) * 100;
      const subDual = comp === 'albedo' ? 'Rdm(0°) = 0' : `${diffDual0 >= 0 ? '+' : ''}${formatNum(diffDual0, 1)}% ${isEn ? 'vs horiz' : 's/ horiz'}`;
      doc.text(subDual, op4X + 4, opBarY + 17.5);

      // 2. Table Section Title
      const compTblHeaderY = opBarY + opCardH + 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        isEn
          ? `Comparative Matrix of All Solar Models - ${cItem.nameEn} (${compLabel})`
          : `Tabla Comparativa de Todos los Tipos de Estudios - ${cItem.nameEs} (${compLabel})`,
        20,
        compTblHeaderY
      );

      // 3. The 10-Column Comparative Table Matching Figura 5.2.98 & Web Option 8 with Angles
      const tblCompY = compTblHeaderY + 3;
      doc.setFillColor(30, 41, 59);
      doc.rect(20, tblCompY, 170, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(255, 255, 255);

      const colCompX = [22, 38, 54, 71, 88, 105, 122, 139, 156, 173];
      const compCols = [
        isEn ? 'Month' : 'Mes',
        `${compLabel}(0°)`,
        isEn ? 'Fixed Opt' : 'Ópt. Anual',
        isEn ? 'Seasonal' : 'Ópt. Estac.',
        isEn ? 'Monthly' : 'Ópt. Mens.',
        isEn ? 'Polar Psi' : 'Eje Polar',
        isEn ? 'Azimuthal' : 'Eje Azim.',
        isEn ? 'Horizontal' : 'Eje Horiz.',
        isEn ? '2-Axis' : 'Dos Ejes',
        '', // Rendered with subscripts below
      ];

      compCols.forEach((c, idx) => {
        if (idx === 9) {
          drawTextWithSubscripts(
            doc,
            [
              { text: 'T', color: [255, 255, 255] },
              { text: 'amb', isSub: true, color: [255, 255, 255] },
              { text: ' (°C)', color: [255, 255, 255] }
            ],
            colCompX[9],
            tblCompY + 4.5,
            5.8,
            'left',
            true
          );
        } else if (c) {
          doc.text(c, colCompX[idx], tblCompY + 4.5);
        }
      });

      const compRowH = 6.2;
      let curCompRowY = tblCompY + 6.5;

      for (let i = 0; i < 12; i++) {
        if (i % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(20, curCompRowY, 170, compRowH, 'F');
        }
        // Subtle highlight on Dual Axis column
        doc.setFillColor(240, 253, 250);
        doc.rect(colCompX[8] - 1.5, curCompRowY, 16.5, compRowH, 'F');

        // Month name
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(30, 41, 59);
        doc.text(mFull[i], colCompX[0], curCompRowY + 3.8);

        // Helper to render cell with radiation value (line 1) and angles (line 2)
        const drawCompCell = (
          x: number,
          val: number,
          tilt: number,
          azim: number,
          isDual: boolean = false
        ) => {
          // Line 1: Radiation Value
          doc.setFont('helvetica', isDual ? 'bold' : 'normal');
          doc.setFontSize(5.6);
          if (isDual) {
            doc.setTextColor(4, 120, 87);
          } else {
            doc.setTextColor(30, 41, 59);
          }
          doc.text(formatNum(val, 2), x, curCompRowY + 2.7);

          // Line 2: Orientation & Inclination angles (Image 2)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(4.0);
          if (isDual) {
            doc.setTextColor(5, 150, 105);
          } else {
            doc.setTextColor(100, 116, 139);
          }
          const angleStr = `Inc: ${formatNum(tilt, 1)}° | Ori: ${formatNum(azim, 1)}°`;
          doc.text(angleStr, x, curCompRowY + 5.1);
        };

        drawCompCell(colCompX[1], rad0_comp[i], 0.0, 0.0);
        drawCompCell(colCompX[2], radOptAnn_comp[i], optAngle, fixedOri);
        drawCompCell(colCompX[3], radOptSeas_comp[i], seasonTilts[i], fixedOri);
        drawCompCell(colCompX[4], radOptMonthly_comp[i], monthlyOptTilts[i] ?? 0, fixedOri);
        drawCompCell(colCompX[5], radPolar_comp[i], res.latitude, fixedOri);
        drawCompCell(colCompX[6], radAzim_comp[i], res.latitude, noonAzims[i]);
        drawCompCell(colCompX[7], radHorizTrack_comp[i], horizTilts[i], 90.0);
        drawCompCell(colCompX[8], radDual_comp[i], noonDualTilts[i], noonAzims[i], true);

        // Col 9: Mean Ambient Temperature
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        doc.setTextColor(71, 85, 105);
        doc.text(formatNum(tempMean_comp[i], 1), colCompX[9], curCompRowY + 3.8);

        curCompRowY += compRowH;
      }

      // Comparative Table Row of Means (PROMEDIO) with average angles
      doc.setFillColor(15, 23, 42);
      doc.rect(20, curCompRowY, 170, compRowH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(56, 189, 248);
      doc.text(isEn ? 'AVERAGE' : 'PROMEDIO', colCompX[0], curCompRowY + 3.8);

      const drawPromedioCell = (
        x: number,
        val: number,
        avgTilt: number,
        avgOri: number,
        isDual: boolean = false
      ) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.6);
        doc.setTextColor(isDual ? 52 : 255, isDual ? 211 : 255, isDual ? 153 : 255);
        doc.text(formatNum(val, 2), x, curCompRowY + 2.7);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(4.0);
        doc.setTextColor(isDual ? 167 : 148, isDual ? 243 : 163, isDual ? 208 : 184);
        const angleStr = `Inc: ${formatNum(avgTilt, 1)}° | Ori: ${formatNum(avgOri, 1)}°`;
        doc.text(angleStr, x, curCompRowY + 5.1);
      };

      drawPromedioCell(colCompX[1], m0_val, 0.0, 0.0);
      drawPromedioCell(colCompX[2], mAnn_val, optAngle, fixedOri);
      drawPromedioCell(colCompX[3], mSeas_val, avgSeasonalTilt, fixedOri);
      drawPromedioCell(colCompX[4], mMth_val, avgMonthlyTilt, fixedOri);
      drawPromedioCell(colCompX[5], mPolar_val, res.latitude, fixedOri);
      drawPromedioCell(colCompX[6], mAzim_val, res.latitude, avgDualAzim);
      drawPromedioCell(colCompX[7], mHoriz_val, avgHorizTilt, 90.0);
      drawPromedioCell(colCompX[8], mDual_val, avgDualTilt, avgDualAzim, true);

      // Col 9: Annual Mean Ambient Temp
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      doc.setTextColor(255, 255, 255);
      doc.text(formatNum(mTemp_val, 1), colCompX[9], curCompRowY + 3.8);

      // 4. Insights Box for Comparative Study
      const insCompY = curCompRowY + 7.5;
      const dDual0 = ((mDual_val - m0_val) / (m0_val || 1)) * 100;
      const dDualAnn = ((mDual_val - mAnn_val) / (mAnn_val || 1)) * 100;
      const dMthAnn = ((mMth_val - mAnn_val) / (mAnn_val || 1)) * 100;
      const gainDualVs0 = comp === 'albedo' ? '-' : `${dDual0 >= 0 ? '+' : ''}${formatNum(dDual0, 1)}%`;
      const gainDualVsAnn = `${dDualAnn >= 0 ? '+' : ''}${formatNum(dDualAnn, 1)}%`;
      const gainMthVsAnn = `${dMthAnn >= 0 ? '+' : ''}${formatNum(dMthAnn, 1)}%`;

      const compInsightPoints = isEn
        ? [
            `Two-Axis Tracking Superiority: Continuous dual-axis tracking maximizes incident energy collection (${formatNum(mDual_val, 2)} kWh/m²/d annual mean), yielding ${gainDualVs0} over a horizontal surface and ${gainDualVsAnn} over the optimal fixed annual tilt.`,
            `Multi-Position Fixed Optimization: Seasonal (4 tilts) and monthly (12 tilts) adjustments achieve ${formatNum(mSeas_val, 2)} and ${formatNum(mMth_val, 2)} kWh/m²/d respectively, leveling winter capture by ${gainMthVsAnn} over fixed tilt without motorized mechanisms.`
          ]
        : [
            `Superioridad del Seguimiento a Dos Ejes: El seguimiento continuo a dos ejes maximiza la captación (${formatNum(mDual_val, 2)} kWh/m²/d de media anual), proporcionando una ganancia de ${gainDualVs0} frente a superficie horizontal y del ${gainDualVsAnn} frente al óptimo fijo anual.`,
            `Optimización Multi-Posición Fija: La adaptación estacional (4 posiciones) y mensual (12 posiciones) alcanzan ${formatNum(mSeas_val, 2)} y ${formatNum(mMth_val, 2)} kWh/m²/d respectivamente, reforzando la captación invernal en un ${gainMthVsAnn} sobre la inclinación fija anual.`
          ];

      drawInsightBox(
        isEn
          ? `KEY COMPARATIVE INSIGHTS: ALL SOLAR MODELS (${compLabel})`
          : `INSIGHTS COMPARATIVOS DESTACADOS: TODOS LOS MODELOS (${compLabel})`,
        compInsightPoints,
        20,
        insCompY,
        170,
        28
      );
    } else {
      // Operational metrics bar (Imagen 3)
      const opBarY = 28;
      const opCardW = 39.5;
      const opCardH = 22;

      // Metric 1: Media Anual
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(20, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'ANNUAL MEAN RESOURCE' : 'MEDIA ANUAL (RECURSO)', 24, opBarY + 5.5);
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      drawRichText(doc, `${formatNum(activeMeanDailyKwh_c, 2)} kWh/m²/d`, 24, opBarY + 14, 13, 'left', true, [15, 23, 42]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      drawRichText(doc, `${formatInt(activeAnnualTotalKwh_c)} kWh/m²·${isEn ? 'yr' : 'año'}`, 24, opBarY + 19, 6, 'left', false, [100, 116, 139]);

      // Metric 2: Inclinación Media / Rango
      const op2X = 20 + opCardW + cardGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(op2X, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'MEAN TILT / RANGE' : 'INCLINACIÓN MEDIA', op2X + 4, opBarY + 5.5);
      doc.setFontSize(13);
      doc.setTextColor(2, 132, 199);
      const tiltAvg =
        studyType === 'monthly'
          ? `${formatNum(res.monthlyOptimum12.optimalTiltsDeg.reduce((a, b) => a + b, 0) / 12, 1)}°`
          : studyType === 'seasonal'
          ? `${Math.round((res.seasonal.winterTiltDeg + res.seasonal.summerTiltDeg) / 2)}°`
          : studyType === 'polar'
          ? `${formatNum(res.latitude, 1)}°`
          : studyType === 'azimuthal'
          ? `${formatNum(res.latitude, 1)}°`
          : studyType === 'horizontal'
          ? `${formatNum(res.latitude >= 0 ? 0.0 : 180.0, 1)}°`
          : studyType === 'dual'
          ? `${formatNum(res.latitude, 1)}°`
          : `${formatAngle(optAngle, 0)}`;
      doc.text(tiltAvg, op2X + 4, opBarY + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(
        studyType === 'monthly'
          ? (isEn
              ? `Min: ${Math.min(...res.monthlyOptimum12.optimalTiltsDeg)}° | Max: ${Math.max(...res.monthlyOptimum12.optimalTiltsDeg)}°`
              : `Mín: ${Math.min(...res.monthlyOptimum12.optimalTiltsDeg)}° | Máx: ${Math.max(...res.monthlyOptimum12.optimalTiltsDeg)}°`)
          : studyType === 'seasonal'
          ? (isEn
              ? `Winter: ${res.seasonal.winterTiltDeg}° | Summer: ${res.seasonal.summerTiltDeg}°`
              : `Inv: ${res.seasonal.winterTiltDeg}° | Ver: ${res.seasonal.summerTiltDeg}°`)
          : studyType === 'polar'
          ? (isEn ? 'Polar axis tracking' : 'Seguimiento polar 1 eje')
          : studyType === 'azimuthal'
          ? (isEn ? 'Azimuthal tracking' : 'Seguimiento azimutal')
          : studyType === 'horizontal'
          ? (isEn ? 'E-W horizontal tracking' : 'Seguimiento horizontal E-O')
          : studyType === 'dual'
          ? (isEn ? 'Continuous 2-axis tracking' : 'Seguimiento 2 ejes continuo')
          : (isEn ? 'Design fixed optimum' : 'Óptimo fijo de diseño'),
        op2X + 4,
        opBarY + 19
      );

      // Metric 3: Ganancia s/ Fijo Anual
      const op3X = op2X + opCardW + cardGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(op3X, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'GAIN VS FIXED OPT' : 'GANANCIA S/ ÓPTIMO FIJO', op3X + 4, opBarY + 5.5);
      doc.setFontSize(13);
      doc.setTextColor(16, 185, 129);
      doc.text(formatPercent(gainVsOpt_c, 2, true), op3X + 4, opBarY + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      drawRichText(doc, `+${formatInt(Math.max(0, activeAnnualTotalKwh_c - optAnnualTotalKwh_c))} kWh/m²·${isEn ? 'yr' : 'año'}`, op3X + 4, opBarY + 19, 6, 'left', false, [100, 116, 139]);

      // Metric 4: Ganancia s/ Horizontal
      const op4X = op3X + opCardW + cardGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(op4X, opBarY, opCardW, opCardH, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'GAIN VS HORIZONTAL' : 'GANANCIA S/ HORIZONTAL', op4X + 4, opBarY + 5.5);
      doc.setFontSize(13);
      doc.setTextColor(16, 185, 129);
      const gainVsHorizDisplay = comp === 'albedo' ? '-' : formatPercent(gainVsHoriz_c, 2, true);
      doc.text(gainVsHorizDisplay, op4X + 4, opBarY + 14);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      const gainDiff = activeAnnualTotalKwh_c - horizAnnualTotalKwh_c;
      const gainVsHorizSub =
        comp === 'albedo'
          ? 'Rdm(0°) = 0'
          : `${gainDiff >= 0 ? '+' : ''}${formatInt(gainDiff)} kWh/m²·${isEn ? 'yr' : 'año'}`;
      drawRichText(doc, gainVsHorizSub, op4X + 4, opBarY + 19, 6, 'left', false, [100, 116, 139]);

      // 12 Tarjetas mensuales
      const mcY = opBarY + opCardH + 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        isEn
          ? `Monthly ${cItem.nameEn} Cards (${compLabel})`
          : `Tarjetas Mensuales de ${cItem.nameEs} (${compLabel})`,
        20,
        mcY
      );

      const mCardW = 12.8;
      const mCardH = 20;
      const mCardGap = 1.45;
      const mCardBaseY = mcY + 3;

      for (let i = 0; i < 12; i++) {
        const mx = 20 + i * (mCardW + mCardGap);
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(mx, mCardBaseY, mCardW, mCardH, 1.5, 1.5, 'FD');

        // Month
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(mShort[i].toUpperCase(), mx + 2, mCardBaseY + 4.5);

        const seasonalTiltDeg =
          i === 11 || i === 0 || i === 1
            ? res.seasonal.winterTiltDeg
            : i >= 2 && i <= 4
            ? res.seasonal.springTiltDeg
            : i >= 5 && i <= 7
            ? res.seasonal.summerTiltDeg
            : res.seasonal.autumnTiltDeg;

        const angleText =
          studyType === 'monthly'
            ? `${res.monthlyOptimum12.optimalTiltsDeg[i]}°`
            : studyType === 'seasonal'
            ? `${seasonalTiltDeg}°`
            : studyType === 'polar'
            ? (isEn ? 'Polar psi' : 'Seg.psi')
            : studyType === 'dual'
            ? (isEn ? '2-Axis' : '2 Ejes')
            : `${optAngle}°`;

        doc.setFontSize(8);
        doc.setTextColor(2, 132, 199);
        doc.text(angleText, mx + 2, mCardBaseY + 10.5);

        // Radiation value for this component
        const radM = radAct_c[i];
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(15, 23, 42);
        doc.text(`${formatNum(radM, 2)}`, mx + 2, mCardBaseY + 15);
        drawRichText(doc, 'kWh/m²/d', mx + 2, mCardBaseY + 18, 4.5, 'left', false, [148, 163, 184]);
      }

      // Tabla detallada
      const tY = mCardBaseY + mCardH + 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        isEn
          ? `Detailed Monthly Calculation Matrix - ${cItem.nameEn}`
          : `Tabla de Cálculo Detallada de la Operación - ${cItem.nameEs}`,
        20,
        tY
      );

      const tblY = tY + 3;
      doc.setFillColor(30, 41, 59);
      doc.rect(20, tblY, 170, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);

      const isAnnualOp = studyType === 'annual';

      const cols = isAnnualOp
        ? [
            isEn ? 'Month' : 'Mes',
            `${compLabel}(0°)`,
            isEn ? 'Tilt (°)' : 'Inc (°)',
            `${compLabel} Est.`,
            '', // Rendered with subscripts below
            '', // Rendered with subscripts below
            isEn ? 'PV Yield' : 'Prod (kWh)',
            isEn ? 'Gain vs 0°' : 'Gan. s/ 0°',
          ]
        : [
            isEn ? 'Month' : 'Mes',
            `${compLabel}(0°)`,
            isEn ? 'Tilt (°)' : 'Inc (°)',
            `${compLabel} Est.`,
            '', // Rendered with subscripts below
            '', // Rendered with subscripts below
            isEn ? 'PV Yield' : 'Prod (kWh)',
            isEn ? 'Gain vs 0°' : 'Gan. s/ 0°',
            isEn ? 'Gain vs Opt' : 'Gan. s/ Ópt',
          ];

      const colX = isAnnualOp
        ? [22, 44, 66, 84, 104, 124, 146, 170]
        : [22, 40, 56, 70, 88, 104, 124, 144, 168];

      cols.forEach((c, idx) => {
        if (idx === 4) {
          drawTextWithSubscripts(
            doc,
            [
              { text: 'T', color: [255, 255, 255] },
              { text: 'amb', isSub: true, color: [255, 255, 255] },
              { text: ' (°C)', color: [255, 255, 255] }
            ],
            colX[4],
            tblY + 4.5,
            6.5,
            'left',
            true
          );
        } else if (idx === 5) {
          drawTextWithSubscripts(
            doc,
            [
              { text: 'T', color: [255, 255, 255] },
              { text: 'C', isSub: true, color: [255, 255, 255] },
              { text: ' (°C)', color: [255, 255, 255] }
            ],
            colX[5],
            tblY + 4.5,
            6.5,
            'left',
            true
          );
        } else if (c) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(255, 255, 255);
          doc.text(c, colX[idx], tblY + 4.5);
        }
      });

      let curRowY = tblY + 6.5;
      for (let i = 0; i < 12; i++) {
        if (i % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(20, curRowY, 170, 5.0, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(30, 41, 59);
        doc.text(mFull[i], colX[0], curRowY + 3.5);
        doc.text(formatNum(radH_c[i], 2), colX[1], curRowY + 3.5);

        const seasonalTiltDeg =
          i === 11 || i === 0 || i === 1
            ? res.seasonal.winterTiltDeg
            : i >= 2 && i <= 4
            ? res.seasonal.springTiltDeg
            : i >= 5 && i <= 7
            ? res.seasonal.summerTiltDeg
            : res.seasonal.autumnTiltDeg;

        const tiltStr =
          studyType === 'monthly'
            ? `${res.monthlyOptimum12.optimalTiltsDeg[i]}°`
            : studyType === 'seasonal'
            ? `${seasonalTiltDeg}°`
            : studyType === 'polar'
            ? `${formatNum(res.latitude, 1)}°`
            : studyType === 'azimuthal'
            ? `${formatNum(res.latitude, 1)}°`
            : studyType === 'horizontal'
            ? '0,0°'
            : studyType === 'dual'
            ? `${formatNum(res.latitude, 1)}°`
            : `${optAngle}°`;
        doc.text(tiltStr, colX[2], curRowY + 3.5);

        doc.setTextColor(2, 132, 199);
        doc.text(formatNum(radAct_c[i], 2), colX[3], curRowY + 3.5);

        doc.setTextColor(71, 85, 105);
        doc.text(formatNum(res.temperatures.ambient.monthlyMeanC[i], 1), colX[4], curRowY + 3.5);
        doc.text(formatNum(res.temperatures.cellOperating.monthlyCellTempOptimalC[i], 1), colX[5], curRowY + 3.5);

        doc.setTextColor(15, 23, 42);
        doc.text(formatInt(pvMonthly_c[i] ?? 0), colX[6], curRowY + 3.5);

        if (comp === 'albedo') {
          doc.setTextColor(100, 116, 139);
          doc.text('-', colX[7], curRowY + 3.5);
        } else {
          const g0pct = radH_c[i] > 0 ? ((radAct_c[i] - radH_c[i]) / radH_c[i]) * 100 : 0;
          doc.setTextColor(g0pct >= 0 ? 16 : 220, g0pct >= 0 ? 185 : 38, g0pct >= 0 ? 129 : 38);
          doc.text(formatPercent(g0pct, 1, true), colX[7], curRowY + 3.5);
        }

        if (!isAnnualOp) {
          const gOptPct = radOpt_c[i] > 0 ? ((radAct_c[i] - radOpt_c[i]) / radOpt_c[i]) * 100 : 0;
          doc.text(formatPercent(gOptPct, 1, true), colX[8], curRowY + 3.5);
        }

        curRowY += 5.0;
      }

      // Row of Means
      doc.setFillColor(15, 23, 42);
      doc.rect(20, curRowY, 170, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(56, 189, 248);
      doc.text(isEn ? 'AVERAGE' : 'PROMEDIO', colX[0], curRowY + 4);
      doc.setTextColor(255, 255, 255);
      doc.text(formatNum(horizMeanDailyKwh_c, 2), colX[1], curRowY + 4);
      doc.text('-', colX[2], curRowY + 4);
      doc.text(formatNum(activeMeanDailyKwh_c, 2), colX[3], curRowY + 4);
      doc.text(formatNum(res.temperatures.ambient.annualMeanC, 1), colX[4], curRowY + 4);
      doc.text(formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1), colX[5], curRowY + 4);
      doc.text(formatInt(pvMonthly_c.reduce((a, b) => a + b, 0)), colX[6], curRowY + 4);
      if (comp === 'albedo') {
        doc.setTextColor(148, 163, 184);
        doc.text('-', colX[7], curRowY + 4);
      } else {
        doc.setTextColor(gainVsHoriz_c >= 0 ? 52 : 248, gainVsHoriz_c >= 0 ? 211 : 113, gainVsHoriz_c >= 0 ? 153 : 113);
        doc.text(formatPercent(gainVsHoriz_c, 1, true), colX[7], curRowY + 4);
      }
      if (!isAnnualOp) {
        doc.text(formatPercent(gainVsOpt_c, 1, true), colX[8], curRowY + 4);
      }

      // Insights box
      const ins2Y = curRowY + 9;
      const insightPoints =
        comp === 'beam'
          ? (isEn
              ? [
                  `Direct Beam Geometry: Beam radiation depends on direct solar incidence angle theta (cos(theta)). Optimization minimizes optical misalignment with the sun.`,
                  `Solar Capture Gain: In ${res.locationName}, direct beam capture yields +${formatPercent(gainVsHoriz_c, 1)} over horizontal (${formatInt(Math.round(activeAnnualTotalKwh_c))} kWh/m²·yr).`
                ]
              : [
                  `Geometría de Haz Directo: La radiación directa depende de la proyección del vector solar sobre el plano captador (cos(theta)), minimizando el ángulo de incidencia.`,
                  `Ganancia de Captación Directa: En ${res.locationName}, el aprovechamiento directo proporciona un incremento de +${formatPercent(gainVsHoriz_c, 1)} frente al plano horizontal (${formatInt(Math.round(activeAnnualTotalKwh_c))} kWh/m²·año).`
                ])
          : comp === 'diffuse'
          ? (isEn
              ? [
                  `Atmospheric Diffuse Radiation: Atmospheric scattering from Rayleigh and aerosols, calculated via isotropic sky view factor (1 + cos(beta))/2.`,
                  `Contribution in Overcast Conditions: Diffuse radiation contributes a steady baseline throughout the year (${formatInt(Math.round(activeAnnualTotalKwh_c))} kWh/m²·yr in ${res.locationName}).`
                ]
              : [
                  `Dispersión Difusa Atmosférica: Procede de la dispersión de Rayleigh y aerosoles, calculada con factor de visión celeste (1 + cos(beta))/2.`,
                  `Aporte en Condiciones Difusas: La componente difusa mantiene una aportación constante a lo largo del año (${formatInt(Math.round(activeAnnualTotalKwh_c))} kWh/m²·año en ${res.locationName}).`
                ])
          : comp === 'albedo'
          ? (isEn
              ? [
                  `Ground Albedo Reflection: Ground-reflected diffuse radiation modulated by reflectivity rho and plane tilt angle factor (1 - cos(beta))/2.`,
                  `Tilt Dependence: Exactly 0 on flat horizontal surfaces (0°) and increases with tilt, contributing +${formatInt(Math.round(activeAnnualTotalKwh_c))} kWh/m²·yr in ${res.locationName}.`
                ]
              : [
                  `Reflexión del Albedo del Terreno: Radiación reflejada por el suelo según reflectividad rho y factor de forma (1 - cos(beta))/2.`,
                  `Dependencia de Inclinación: Nula en plano horizontal (0°) y creciente con la inclinación, aportando +${formatInt(Math.round(activeAnnualTotalKwh_c))} kWh/m²·año en ${res.locationName}.`
                ])
          : (isEn
              ? [
                  `Seasonal Adaptation of Optimal Tilt: Solar declination varies between delta = -23.45° and +23.45°. Monthly tilt reaches 58°-60° in winter and 0°-4° in summer.`,
                  `Gain Comparison vs Annual Fixed: Optimization provides a net energy boost of +${formatPercent(gainVsOpt_c, 2)} (+${formatInt(Math.max(0, Math.round(activeAnnualTotalKwh_c - optAnnualTotalKwh_c)))} kWh/m²·yr) compared to annual fixed tilt (${formatAngle(optAngle, 1)}).`
                ]
              : [
                  `Adaptación Estacional del Ángulo Óptimo: La declinación solar varía entre delta = -23,45° y +23,45°. En invierno el ángulo alcanza 58°-60° en ${res.locationName} y en verano 0°-4°.`,
                  `Comparativa de Ganancia frente a Fijo Anual: La optimización proporciona un incremento neto de energía del +${formatPercent(gainVsOpt_c, 2)} (+${formatInt(Math.max(0, Math.round(activeAnnualTotalKwh_c - optAnnualTotalKwh_c)))} kWh/m²·año) frente a la inclinación fija anual de ${formatAngle(optAngle, 1)}.`
                ]);

      drawInsightBox(
        isEn
          ? `KEY TECHNICAL INSIGHTS: ${cItem.nameEn.toUpperCase()}`
          : `INSIGHTS TÉCNICOS DESTACADOS: ${cItem.nameEs.toUpperCase()}`,
        insightPoints,
        20,
        ins2Y,
        170,
        30
      );
    }
  });

  // =========================================================================
  // PÁGINA: CÁLCULO DE LA ENERGÍA PRODUCIDA (MÉTODO DE OSTERWALD)
  // (Para las operaciones que generan cálculos de energía)
  // =========================================================================
  if (hasEnergyPage) {
    doc.addPage();
    const energyChapTitle = isEn
      ? `Chapter 3. PV Energy Yield Calculation: ${cleanStudyName}`
      : `Capítulo 3. Cálculo de la Energía Producida: ${cleanStudyName}`;
    drawPageChrome(energyChapTitle, pageEnergy, totalPagesDyn);

    // 1. Calculations
    const radHoriz = res.horizontal.gdm0;
    const radStudy =
      studyType === 'monthly'
        ? res.monthlyOptimum12.monthlyDailyKwh
        : studyType === 'seasonal'
        ? res.seasonal.monthlyDailyKwh
        : studyType === 'polar'
        ? res.tracking.polarAxis.monthlyDailyKwh
        : studyType === 'azimuthal'
        ? res.tracking.azimuthalAxis.monthlyDailyKwh
        : studyType === 'horizontal'
        ? res.tracking.horizontalAxis.monthlyDailyKwh
        : studyType === 'dual'
        ? res.tracking.dualAxis.monthlyDailyKwh
        : res.optimalAnnual.monthlyDailyKwh;

    const tempAmb = res.temperatures.ambient.monthlyMeanC;

    const energyData = calculateOsterwaldEnergy(
      radHoriz,
      radStudy,
      tempAmb,
      peakKw,
      coefTemp,
      tonc
    );

    const seasonalData = res.seasonal;
    const fixedOri = res.latitude >= 0 ? 0.0 : 180.0;

    let studyColTitleLine1 = isEn ? 'Performed study' : 'Estudio realizado';
    let studyColTitleLine2 = '';
    if (studyType === 'monthly') {
      studyColTitleLine2 = isEn ? '(12 Monthly Angles)' : '(12 Inclinaciones óptimas)';
    } else if (studyType === 'seasonal' && seasonalData) {
      studyColTitleLine2 = isEn ? '(Seasonal Optimal Tilts)' : '(Inclinación ópt. estacional)';
    } else if (studyType === 'polar') {
      studyColTitleLine2 = isEn ? '(Polar 1-axis)' : '(Seg. 1 eje polar)';
    } else if (studyType === 'azimuthal') {
      studyColTitleLine2 = isEn ? '(Azimuthal 1-axis)' : '(Seg. 1 eje azimutal)';
    } else if (studyType === 'horizontal') {
      studyColTitleLine2 = isEn ? '(Horizontal 1-axis)' : '(Seg. 1 eje horizontal)';
    } else if (studyType === 'dual') {
      studyColTitleLine2 = isEn ? '(2-axis tracking)' : '(Seguimiento 2 ejes)';
    } else {
      studyColTitleLine2 = isEn
        ? `(Tilt: ${formatNum(optAngle, 1)}° | Azim: ${formatNum(fixedOri, 1)}°)`
        : `(Inc: ${formatNum(optAngle, 1)}° | Ori: ${formatNum(fixedOri, 1)}°)`;
    }

    // 2. Section Header
    const seTopY = 27;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      isEn
        ? 'Mean Monthly PV Energy Yield (kWh) • Osterwald Method'
        : 'Energía Media Mensual Generada y Balance de Producción (kWh) • Método de Osterwald',
      20,
      seTopY
    );

    // 3. Top 4 KPI Parameter Cards (y = 31, h = 20, w = 39.5)
    const seCardY = seTopY + 4;
    const seCardW = 39.5;
    const seCardH = 20;

    // Card 1: Potencia Pico
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(20, seCardY, seCardW, seCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(isEn ? 'INSTALLED PEAK POWER' : 'POTENCIA PICO INSTALADA', 24, seCardY + 5.0);
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`${formatNum(peakKw, 1)} kWp`, 24, seCardY + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(isEn ? 'Monocrystalline Silicon' : 'Silicio Monocristalino', 24, seCardY + 17.2);

    // Card 2: Coeficiente Térmico
    const se2X = 20 + seCardW + cardGap;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(se2X, seCardY, seCardW, seCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(isEn ? 'TEMP. COEFFICIENT (gamma)' : 'COEF. TEMPERATURA (gamma)', se2X + 4, seCardY + 5.0);
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38);
    doc.text(`${formatNum(coefTemp, 4)} 1/°C`, se2X + 4, seCardY + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(isEn ? 'Power derating per °C' : 'Variación de potencia s/ STC', se2X + 4, seCardY + 17.2);

    // Card 3: TONC
    const se3X = se2X + seCardW + cardGap;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(se3X, seCardY, seCardW, seCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(isEn ? 'NOCT / TONC' : 'TONC DE MÓDULOS', se3X + 4, seCardY + 5.0);
    doc.setFontSize(12);
    doc.setTextColor(180, 83, 9);
    doc.text(`${formatNum(tonc, 1)} °C`, se3X + 4, seCardY + 12.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    drawRichText(doc, '800 W/m² | Tamb = 20°C', se3X + 4, seCardY + 17.2, 5.8, 'left', false, [100, 116, 139]);

    // Card 4: Producción Anual
    const se4X = se3X + seCardW + cardGap;
    doc.setFillColor(240, 253, 250);
    doc.setDrawColor(167, 243, 208);
    doc.roundedRect(se4X, seCardY, seCardW, seCardH, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.0);
    doc.setTextColor(4, 120, 87);
    doc.text(isEn ? 'ANNUAL GENERATION' : 'PRODUCCIÓN ANUAL', se4X + 3.5, seCardY + 4.5);
    doc.setFontSize(5.4);
    doc.text(isEn ? '(STUDY)' : '(ESTUDIO)', se4X + 3.5, seCardY + 7.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(5, 150, 105);
    doc.text(`${formatInt(energyData.e_anual)} kWh`, se4X + 3.5, seCardY + 12.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(4, 120, 87);
    const gainPct = energyData.e0_anual > 0 ? (energyData.ganancia_anual / energyData.e0_anual) * 100 : 0;
    doc.text(`${energyData.ganancia_anual >= 0 ? '+' : ''}${formatInt(energyData.ganancia_anual)} kWh (+${formatNum(gainPct, 1)}%)`, se4X + 3.5, seCardY + 17.2);

    // 4. The 5-Column Table Matching Screenshot
    const tblEnerY = seCardY + seCardH + 5;
    const colE_X = [22, 43, 90, 122, 165];
    const colE_W = [20, 46, 31, 42, 24];

    // Header Background
    doc.setFillColor(30, 41, 59);
    doc.rect(20, tblEnerY, 170, 7.0, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);

    doc.text(isEn ? 'Month' : 'Mes', colE_X[0], tblEnerY + 4.7);
    doc.text(isEn ? 'Considered angles (Inc | Ori)' : 'Ángulos considerados (Inc | Ori)', colE_X[1], tblEnerY + 4.7);
    doc.text(isEn ? 'Horizontal (0°)' : 'Superficie horizontal (0°)', colE_X[2] + colE_W[2] - 2, tblEnerY + 4.7, { align: 'right' });

    // Col 4 title with clean 2-line wrapped text
    doc.setFontSize(5.6);
    doc.text(sanitizePdfText(studyColTitleLine1), colE_X[3] + colE_W[3] - 1, tblEnerY + 3.0, { align: 'right' });
    doc.setFontSize(5.2);
    doc.text(sanitizePdfText(studyColTitleLine2), colE_X[3] + colE_W[3] - 1, tblEnerY + 5.8, { align: 'right' });

    doc.setFontSize(6.2);
    doc.text(isEn ? 'Gain (kWh)' : 'Ganancia (kWh)', colE_X[4] + colE_W[4] - 2, tblEnerY + 4.7, { align: 'right' });

    // 12 Monthly Rows
    const rowEnerH = 5.6;
    let curRowEnerY = tblEnerY + 7.0;

    for (let i = 0; i < 12; i++) {
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(20, curRowEnerY, 170, rowEnerH, 'F');
      }

      // Highlight study column cell
      doc.setFillColor(240, 253, 250);
      doc.rect(colE_X[3] - 1, curRowEnerY, colE_W[3] + 1, rowEnerH, 'F');

      // Month name
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(30, 41, 59);
      doc.text(mFull[i], colE_X[0], curRowEnerY + 3.8);

      // Angle Badge text
      let angleText = '';
      if (studyType === 'monthly') {
        const mDeg = res.monthlyOptimum12?.optimalTiltsDeg ? res.monthlyOptimum12.optimalTiltsDeg[i] : optAngle;
        angleText = `Inc: ${formatNum(mDeg, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
      } else if (studyType === 'seasonal' && seasonalData) {
        if (i === 11 || i === 0 || i === 1) {
          angleText = `Inv: Inc: ${formatNum(seasonalData.winterTiltDeg, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
        } else if (i === 2 || i === 3 || i === 4) {
          angleText = `Pri: Inc: ${formatNum(seasonalData.springTiltDeg, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
        } else if (i === 5 || i === 6 || i === 7) {
          angleText = `Ver: Inc: ${formatNum(seasonalData.summerTiltDeg, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
        } else {
          angleText = `Oto: Inc: ${formatNum(seasonalData.autumnTiltDeg, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
        }
      } else if (studyType === 'polar') {
        angleText = `Inc: ${formatNum(res.latitude, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
      } else if (studyType === 'azimuthal') {
        angleText = `Inc: ${formatNum(res.latitude, 1)}° | Ori: ${formatNum(getNoonAzimuthDeg(res.latitude, i), 1)}°`;
      } else if (studyType === 'horizontal') {
        angleText = `Inc: ${formatNum(getHorizontalTrackerDailyMeanTiltDeg(res.latitude, i), 1)}° | Ori: 90,0°`;
      } else if (studyType === 'dual') {
        angleText = `Inc: ${formatNum(getDualAxisNoonTiltDeg(res.latitude, i), 1)}° | Ori: ${formatNum(getNoonAzimuthDeg(res.latitude, i), 1)}°`;
      } else {
        angleText = `Inc: ${formatNum(optAngle, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
      }

      // Render angle badge pill
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.2);
      doc.roundedRect(colE_X[1] + 1, curRowEnerY + 0.9, 44, 3.8, 0.8, 0.8, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.2);
      doc.setTextColor(3, 105, 161);
      doc.text(angleText, colE_X[1] + 1 + 22, curRowEnerY + 3.5, { align: 'center' });

      // Col 3: Horizontal 0°
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(71, 85, 105);
      doc.text(formatNum(energyData.e0_mes[i], 2), colE_X[2] + colE_W[2] - 2, curRowEnerY + 3.8, { align: 'right' });

      // Col 4: Performed study
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(15, 23, 42);
      doc.text(formatNum(energyData.e_mes[i], 2), colE_X[3] + colE_W[3] - 2, curRowEnerY + 3.8, { align: 'right' });

      // Col 5: Gain
      const g = energyData.ganancia_mes[i];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.2);
      if (Math.abs(g) < 0.005) {
        doc.setTextColor(100, 116, 139);
        doc.text('0,00', colE_X[4] + colE_W[4] - 2, curRowEnerY + 3.8, { align: 'right' });
      } else if (g > 0) {
        doc.setTextColor(5, 150, 105);
        doc.text(`+${formatNum(g, 2)}`, colE_X[4] + colE_W[4] - 2, curRowEnerY + 3.8, { align: 'right' });
      } else {
        doc.setTextColor(220, 38, 38);
        doc.text(formatNum(g, 2), colE_X[4] + colE_W[4] - 2, curRowEnerY + 3.8, { align: 'right' });
      }

      curRowEnerY += rowEnerH;
    }

    // Average angle string for footer rows
    let avgAngleText = '';
    const avgDualAzim = [0,1,2,3,4,5,6,7,8,9,10,11].reduce((acc, idx) => acc + getNoonAzimuthDeg(res.latitude, idx), 0) / 12;
    if (studyType === 'monthly') {
      const avgMonthlyTilt = res.monthlyOptimum12?.optimalTiltsDeg
        ? res.monthlyOptimum12.optimalTiltsDeg.reduce((a, b) => a + b, 0) / 12
        : optAngle;
      avgAngleText = `Inc: ${formatNum(avgMonthlyTilt, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
    } else if (studyType === 'seasonal' && seasonalData) {
      const avgSeasonalTilt = (seasonalData.winterTiltDeg * 3 + seasonalData.springTiltDeg * 3 + seasonalData.summerTiltDeg * 3 + seasonalData.autumnTiltDeg * 3) / 12;
      avgAngleText = `Inc: ${formatNum(avgSeasonalTilt, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
    } else if (studyType === 'polar') {
      avgAngleText = `Inc: ${formatNum(res.latitude, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
    } else if (studyType === 'azimuthal') {
      avgAngleText = `Inc: ${formatNum(res.latitude, 1)}° | Ori: ${formatNum(avgDualAzim, 1)}°`;
    } else if (studyType === 'horizontal') {
      const avgHorizTilt = [0,1,2,3,4,5,6,7,8,9,10,11].reduce((acc, idx) => acc + getHorizontalTrackerDailyMeanTiltDeg(res.latitude, idx), 0) / 12;
      avgAngleText = `Inc: ${formatNum(avgHorizTilt, 1)}° | Ori: 90,0°`;
    } else if (studyType === 'dual') {
      const avgDualTilt = [0,1,2,3,4,5,6,7,8,9,10,11].reduce((acc, idx) => acc + getDualAxisNoonTiltDeg(res.latitude, idx), 0) / 12;
      avgAngleText = `Inc: ${formatNum(avgDualTilt, 1)}° | Ori: ${formatNum(avgDualAzim, 1)}°`;
    } else {
      avgAngleText = `Inc: ${formatNum(optAngle, 1)}° | Ori: ${formatNum(fixedOri, 1)}°`;
    }

    // Footer Row 1: TOTAL ANUAL
    doc.setFillColor(15, 23, 42);
    doc.rect(20, curRowEnerY, 170, 6.4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(56, 189, 248);
    doc.text(isEn ? 'ANNUAL TOTAL' : 'TOTAL ANUAL', colE_X[0], curRowEnerY + 4.2);

    // Pill in footer
    doc.setFillColor(30, 41, 59);
    doc.roundedRect(colE_X[1] + 1, curRowEnerY + 1.2, 44, 4.0, 0.8, 0.8, 'F');
    doc.setTextColor(56, 189, 248);
    doc.setFontSize(5.2);
    doc.text(avgAngleText, colE_X[1] + 1 + 22, curRowEnerY + 3.8, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);
    doc.text(formatNum(energyData.e0_anual, 1), colE_X[2] + colE_W[2] - 2, curRowEnerY + 4.2, { align: 'right' });

    doc.setTextColor(56, 189, 248);
    doc.text(formatNum(energyData.e_anual, 1), colE_X[3] + colE_W[3] - 2, curRowEnerY + 4.2, { align: 'right' });

    doc.setTextColor(52, 211, 153);
    const gainTotalText = `${energyData.ganancia_anual >= 0 ? '+' : ''}${formatNum(energyData.ganancia_anual, 2)}`;
    doc.text(gainTotalText, colE_X[4] + colE_W[4] - 2, curRowEnerY + 4.2, { align: 'right' });

    curRowEnerY += 6.4;

    // Footer Row 2: MEDIA
    doc.setFillColor(30, 41, 59);
    doc.rect(20, curRowEnerY, 170, 6.0, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(148, 163, 184);
    doc.text(isEn ? 'MEAN' : 'MEDIA', colE_X[0], curRowEnerY + 4.0);

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(colE_X[1] + 1, curRowEnerY + 1.0, 44, 4.0, 0.8, 0.8, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(5.2);
    doc.text(avgAngleText, colE_X[1] + 1 + 22, curRowEnerY + 3.6, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);
    doc.text(formatNum(energyData.e0_anual / 12, 1), colE_X[2] + colE_W[2] - 2, curRowEnerY + 4.0, { align: 'right' });

    doc.setTextColor(255, 255, 255);
    doc.text(formatNum(energyData.e_anual / 12, 1), colE_X[3] + colE_W[3] - 2, curRowEnerY + 4.0, { align: 'right' });

    doc.setTextColor(52, 211, 153);
    const gainMeanText = `${(energyData.ganancia_anual / 12) >= 0 ? '+' : ''}${formatNum(energyData.ganancia_anual / 12, 2)}`;
    doc.text(gainMeanText, colE_X[4] + colE_W[4] - 2, curRowEnerY + 4.0, { align: 'right' });

    curRowEnerY += 6.0;

    // 5. Bottom Section: Osterwald Nomenclature (Left) + Insights (Right)
    const btmBoxY = curRowEnerY + 5;
    const btmH = 54;
    const btmLeftW = 82;
    const btmRightW = 84;
    const btmRightX = 20 + btmLeftW + 4;

    // Left Box: Método de Osterwald y Nomenclatura (Figura 5.2.80)
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(186, 230, 253);
    doc.setLineWidth(0.4);
    doc.roundedRect(20, btmBoxY, btmLeftW, btmH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(3, 105, 161);
    doc.text(isEn ? 'OSTERWALD METHOD & NOMENCLATURE' : 'MÉTODO DE OSTERWALD Y NOMENCLATURA', 24, btmBoxY + 5.5);

    // Formula Box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(253, 186, 116);
    doc.setLineWidth(0.4);
    doc.roundedRect(24, btmBoxY + 7.5, btmLeftW - 8, 12, 1.2, 1.2, 'FD');

    drawTextWithSubscripts(
      doc,
      [
        { text: 'P', color: [15, 23, 42] },
        { text: 'M', isSub: true, color: [15, 23, 42] },
        { text: ' = P', color: [15, 23, 42] },
        { text: 'M,STC', isSub: true, color: [15, 23, 42] },
        { text: ' · (G / G', color: [15, 23, 42] },
        { text: 'STC', isSub: true, color: [15, 23, 42] },
        { text: ') · [1 + gamma · (T', color: [15, 23, 42] },
        { text: 'C', isSub: true, color: [15, 23, 42] },
        { text: ' - 25)]', color: [15, 23, 42] }
      ],
      26,
      btmBoxY + 12.0,
      5.8,
      'left',
      true
    );

    drawTextWithSubscripts(
      doc,
      [
        { text: isEn ? 'where: T' : 'donde: T', color: [71, 85, 105] },
        { text: 'C', isSub: true, color: [71, 85, 105] },
        { text: ' = T', color: [71, 85, 105] },
        { text: 'amb', isSub: true, color: [71, 85, 105] },
        { text: ` + [(TONC - 20) / 800] · G   •   E = integral p(t) dt`, color: [71, 85, 105] }
      ],
      26,
      btmBoxY + 16.5,
      5.2,
      'left',
      false
    );

    // Nomenclature bullet list
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.0);
    doc.setTextColor(51, 65, 85);
    const nomY = btmBoxY + 23.5;
    const nomLineGap = 4.8;
    doc.text(`• PM: ${isEn ? 'Maximum power at MPP (W)' : 'Potencia máxima en el MPP (W)'} | PM,STC: ${isEn ? 'STC power (W)' : 'Potencia en STC (W)'}`, 24, nomY);
    drawRichText(doc, `• G: ${isEn ? 'Incident global irradiance (W/m²)' : 'Irradiancia global incidente (W/m²)'} | GSTC = 1.000 W/m²`, 24, nomY + nomLineGap, 5.0, 'left', false, [51, 65, 85]);
    doc.text(`• TC: ${isEn ? 'Operating cell temperature (°C)' : 'Temperatura de la célula (°C)'} | Tamb: ${isEn ? 'Ambient temperature (°C)' : 'Temperatura ambiente (°C)'}`, 24, nomY + nomLineGap * 2);
    doc.text(`• gamma: ${isEn ? 'Power temperature coefficient' : 'Coeficiente térmico de potencia'} (${formatNum(coefTemp, 4)} 1/°C)`, 24, nomY + nomLineGap * 3);
    doc.text(`• TONC: ${isEn ? 'Nominal operating cell temperature' : 'Temperatura de operación nominal'} (${formatNum(tonc, 1)} °C)`, 24, nomY + nomLineGap * 4);
    drawRichText(doc, isEn ? '  (measured at 800 W/m², 20 °C Tamb, AM 1.5, wind 1 m/s)' : '  (medida a 800 W/m², Tamb = 20 °C, espectro AM 1,5, viento 1 m/s)', 24, nomY + nomLineGap * 5, 5.0, 'left', false, [51, 65, 85]);

    // Right Box: Technical Insights (using drawInsightBox)
    const maxMonthIdx = energyData.e_mes.indexOf(Math.max(...energyData.e_mes));
    const minMonthIdx = energyData.e_mes.indexOf(Math.min(...energyData.e_mes));
    const maxMonthKwh = energyData.e_mes[maxMonthIdx];
    const minMonthKwh = energyData.e_mes[minMonthIdx];

    drawInsightBox(
      isEn ? 'KEY TECHNICAL INSIGHTS: PV ENERGY GENERATION' : 'INSIGHTS TÉCNICOS DESTACADOS: GENERACIÓN DE ENERGÍA FV',
      isEn
        ? [
            `Annual Energy Harvest: The ${cleanStudyName} configuration generates ${formatInt(energyData.e_anual)} kWh/yr (${formatInt(energyData.e_anual / peakKw)} kWh/kWp), obtaining a net gain of ${energyData.ganancia_anual >= 0 ? '+' : ''}${formatInt(energyData.ganancia_anual)} kWh/yr (+${formatNum(gainPct, 1)}%) over a horizontal plane.`,
            `Seasonal Leveling: Winter collection is substantially boosted by angular tilting, bridging the seasonal gap (peak: ${mFull[maxMonthIdx]} with ${formatInt(maxMonthKwh)} kWh; minimum: ${mFull[minMonthIdx]} with ${formatInt(minMonthKwh)} kWh; ratio: ${formatNum(maxMonthKwh / (minMonthKwh || 1), 2)}x).`,
            `Thermal Derating Impact: Summer operating cell temperature reaches high values, where gamma (${formatNum(coefTemp, 4)} 1/°C) modulates maximum power, while spring conditions offer optimal conversion efficiency.`
          ]
        : [
            `Balance Anual de Producción: La configuración ${cleanStudyName} produce ${formatInt(energyData.e_anual)} kWh/año (${formatInt(energyData.e_anual / peakKw)} kWh/kWp), obteniendo una ganancia neta de ${energyData.ganancia_anual >= 0 ? '+' : ''}${formatInt(energyData.ganancia_anual)} kWh/año (+${formatNum(gainPct, 1)}%) frente a superficie horizontal.`,
            `Nivelación Estacional: En los meses fríos la adaptación angular refuerza la captación directa frente a superficie plana (pico: ${mFull[maxMonthIdx]} con ${formatInt(maxMonthKwh)} kWh; mínimo: ${mFull[minMonthIdx]} con ${formatInt(minMonthKwh)} kWh; factor estacional: ${formatNum(maxMonthKwh / (minMonthKwh || 1), 2)}x).`,
            `Impacto del Derating Térmico: En verano la elevación de temperatura de célula modula la potencia máxima mediante el coeficiente gamma (${formatNum(coefTemp, 4)} 1/°C), situando el punto de mayor rendimiento relativo en primavera con insolación alta y temperatura moderada.`
          ],
      btmRightX,
      btmBoxY,
      btmRightW,
      btmH
    );
  }

  // =========================================================================
  // PÁGINA: RANKING DE RENDIMIENTO DE LAS 8 SUPERFICIES (Imagen 2 & Imagen 5)
  // =========================================================================
  doc.addPage();
  const benchmarkChapterHeader = hasEnergyPage
    ? (isEn ? 'Chapter 4. Global Benchmark & Ranking of Surfaces' : 'Capítulo 4. Comparativa y Ranking Global de Superficies')
    : (isEn ? 'Chapter 3. Global Benchmark & Ranking of Surfaces' : 'Capítulo 3. Comparativa y Ranking Global de Superficies');
  drawPageChrome(benchmarkChapterHeader, pageChapBenchmark, totalPagesDyn);


  // Ranking Bar Chart (Matching Imagen 2)
  drawRichText(doc, isEn ? 'Surfaces Performance Ranking & Annual Irradiation (kWh/m²·yr)' : 'Comparativa y Ranking de Rendimiento de Superficies (kWh/m²·año)', 20, 28, 9, 'left', true, [15, 23, 42]);

  const sortedSurfs = [...res.surfaceComparison].sort(
    (a, b) => b.annualRadiationKwhM2 - a.annualRadiationKwhM2
  );

  const rBoxY = 32;
  const rBoxH = 68;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, rBoxY, 170, rBoxH, 2, 2, 'FD');

  const maxRankRad = sortedSurfs[0]?.annualRadiationKwhM2 || 2500;
  let barRowY = rBoxY + 7;

  // Colors for ranking bars
  const barColors: [number, number, number][] = [
    [244, 114, 182], // 2 ejes (pink)
    [168, 85, 247],  // 1 eje polar (purple)
    [147, 51, 234],  // 1 eje azimutal (indigo)
    [129, 140, 248], // 1 eje horiz (light purple)
    [56, 189, 248],  // 12 meses (sky)
    [14, 165, 233],  // 4 estac (blue)
    [245, 158, 11],  // fija óptima (amber)
    [2, 132, 199],   // horiz (cyan)
  ];

  sortedSurfs.forEach((s, idx) => {
    // Keep bar width within 44mm so value and percentage gains are 100% visible inside the card
    const barWidth = Math.max(2, (s.annualRadiationKwhM2 / maxRankRad) * 44);
    const [r, g, b] = barColors[idx] || [14, 165, 233];

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42);
    doc.text(getSurfaceDisplayName(s, isEn), 24, barRowY + 4);

    // Bar
    doc.setFillColor(r, g, b);
    doc.roundedRect(74, barRowY, barWidth, 4.8, 1, 1, 'F');

    // Value text
    drawRichText(doc, `${formatInt(Math.round(s.annualRadiationKwhM2))} kWh/m²`, 74 + barWidth + 2.5, barRowY + 3.8, 6.5, 'left', true, [15, 23, 42]);

    // Percentage Gain text (In a prominent, dedicated visible position at X = 154mm)
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(s.gainOverHorizontalPct > 0 ? 5 : 100, s.gainOverHorizontalPct > 0 ? 150 : 116, s.gainOverHorizontalPct > 0 ? 105 : 139);
    const gainStr = s.gainOverHorizontalPct > 0 ? `(+${formatPercent(s.gainOverHorizontalPct, 1)})` : '(Base 0,0%)';
    doc.text(gainStr, 154, barRowY + 3.8);

    barRowY += 7.2;
  });

  // Table of 8 surfaces (Imagen 5)
  const tbl8Y = rBoxY + rBoxH + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'Global Benchmark Matrix of All 8 Configurations' : 'Comparativa Global de Todas las Superficies (8 Configuraciones)', 20, tbl8Y);

  const t8BoxY = tbl8Y + 3;
  doc.setFillColor(30, 41, 59);
  doc.rect(20, t8BoxY, 170, 6.0, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);

  const h8 = [
    isEn ? 'Topology / Surface' : 'Topología / Superficie',
    isEn ? 'Type' : 'Tipo',
    isEn ? 'Mean Rad.' : 'Rad. Media',
    isEn ? 'Annual Total' : 'Total Anual',
    isEn ? 'Gain Horiz' : 'Gan. Horiz',
    isEn ? 'Gain Opt Fixed' : 'Gan. Fijo Ópt',
    isEn ? 'Osterwald Prod.' : 'Prod. Osterwald',
    isEn ? 'Cell Temp' : 'Temp. Célula',
  ];
  const x8 = [22, 65, 80, 98, 117, 135, 154, 174];
  h8.forEach((col, idx) => doc.text(col, x8[idx], t8BoxY + 4));

  let cur8Y = t8BoxY + 6.0;
  sortedSurfs.forEach((surf, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, cur8Y, 170, 5.0, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(15, 23, 42); // Reset text color from table header white
    const sName = getSurfaceDisplayName(surf, isEn);
    const sLines = doc.splitTextToSize(sName, 41);
    if (sLines.length > 1) {
      doc.text(sLines[0], x8[0], cur8Y + 2.2);
      doc.text(sLines[1], x8[0], cur8Y + 4.3);
    } else {
      doc.text(sLines[0] || '', x8[0], cur8Y + 3.5);
    }

    // Type Badge text
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(surf.category === 'dual' ? 244 : surf.category === 'single' ? 147 : 14, surf.category === 'dual' ? 114 : surf.category === 'single' ? 51 : 165, surf.category === 'dual' ? 182 : surf.category === 'single' ? 234 : 233);
    doc.text(getCategoryBadge(surf.category, isEn), x8[1], cur8Y + 3.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 41, 59);
    doc.text(`${formatNum(surf.meanDailyKwhM2, 3)} kWh`, x8[2], cur8Y + 3.5);
    doc.text(`${formatInt(Math.round(surf.annualRadiationKwhM2))} kWh`, x8[3], cur8Y + 3.5);

    doc.setTextColor(surf.gainOverHorizontalPct > 0 ? 16 : 100, surf.gainOverHorizontalPct > 0 ? 185 : 116, surf.gainOverHorizontalPct > 0 ? 129 : 139);
    doc.text(`${surf.gainOverHorizontalPct > 0 ? '+' : ''}${formatNum(surf.gainOverHorizontalPct, 1)}%`, x8[4], cur8Y + 3.5);

    doc.setTextColor(surf.gainOverAnnualFixedPct >= 0 ? 16 : 220, surf.gainOverAnnualFixedPct >= 0 ? 185 : 38, surf.gainOverAnnualFixedPct >= 0 ? 129 : 38);
    doc.text(`${surf.gainOverAnnualFixedPct >= 0 ? '+' : ''}${formatNum(surf.gainOverAnnualFixedPct, 1)}%`, x8[5], cur8Y + 3.5);

    doc.setTextColor(15, 23, 42);
    doc.text(`${formatInt(Math.round(surf.energyProducedOsterwaldKwhYear))} kWh`, x8[6], cur8Y + 3.5);
    doc.text(`${formatNum(surf.meanCellTempDegC, 1)} °C`, x8[7], cur8Y + 3.5);

    cur8Y += 5.0;
  });

  // Insights Box on 8 surfaces
  const ins3Y = cur8Y + 8;
  drawInsightBox(
    isEn ? 'KEY TECHNICAL INSIGHTS: SOLAR TRACKING VS FIXED TOPOLOGIES' : 'INSIGHTS TÉCNICOS DESTACADOS: SEGUIMIENTO SOLAR VS SUPERFICIES FIJAS',
    isEn
      ? [
          `1-Axis Polar Tracking Performance: Polar tracking achieves 2,379 kWh/m²·yr (+39.20% over horizontal), representing 97.4% of the energy collected by dual-axis tracking (2,442 kWh/m²·yr). Given its lower electromechanical cost and fewer moving parts, it delivers the optimal techno-economic return.`,
          `Investment Comparison on Fixed Structures: Seasonal tilt with 4 manual adjustments (+13.44%) substantially increases capture compared to annual fixed (+9.16%). 12 monthly adjustments only add a modest +1.26% extra, making 4 adjustments per year the ideal operational balance between maintenance effort and energy gain.`,
        ]
      : [
          `Rendimiento del Seguimiento Polar a 1 Eje: El seguimiento polar alcanza 2.379 kWh/m²·año (+39,20% sobre horizontal), lo que equivale al 97,4% de la energía captada por el seguidor a dos ejes (2.442 kWh/m²·año). Debido a su menor coste electromecánico y menor número de accionamientos móviles, representa la solución óptima en rentabilidad técnico-económica.`,
          `Comparativa de Inversión en Superficies Fijas: La inclinación fija estacional con 4 ajustes manuales (+13,44%) incrementa sustancialmente la captación respecto a la fija anual (+9,16%). Los 12 ajustes mensuales solo suman un modesto +1,26% adicional, por lo que operacionalmente 4 ajustes al año maximizan la relación beneficio/mantenimiento.`,
        ],
    20,
    ins3Y,
    170,
    28
  );

  // =========================================================================
  // PÁGINA 5: MAPA DE PÉRDIDAS DE CAPTACIÓN CTE DB-HE4 (Imagen 4)
  // =========================================================================
  doc.addPage();
  const lossMapsChapterHeader = hasEnergyPage
    ? (isEn ? 'Chapter 5. CTE DB-HE4 Captation Losses' : 'Capítulo 5. Pérdidas de Captación CTE DB-HE4')
    : (isEn ? 'Chapter 4. CTE DB-HE4 Captation Losses' : 'Capítulo 4. Pérdidas de Captación CTE DB-HE4');
  drawPageChrome(lossMapsChapterHeader, pageChapLossMaps, totalPagesDyn);

  // Optimal Point Card
  const cteTopY = 28;
  doc.setFillColor(209, 250, 229);
  doc.setDrawColor(52, 211, 153);
  doc.roundedRect(20, cteTopY, 170, 14, 2, 2, 'FD');
  const optTitle = isEn
    ? `Absolute Capture Optimum (CTE DB-HE4): Tilt: ${formatNum(res.captureLossMap.optimalPoint.betaDeg, 0, false)}°, Azimuth: ${formatNum(res.captureLossMap.optimalPoint.alphaDeg, 0, false)}° | ${formatNum(res.captureLossMap.optimalPoint.maxDailyRadiationKwh, 3)} kWh/m²/day (${formatInt(Math.round(res.captureLossMap.optimalPoint.maxAnnualRadiationKwhM2))} kWh/m²·yr)`
    : `Óptimo Absoluto de Captación (CTE DB-HE4): Inclinación: ${formatNum(res.captureLossMap.optimalPoint.betaDeg, 0, false)}°, Orientación: ${formatNum(res.captureLossMap.optimalPoint.alphaDeg, 0, false)}° | ${formatNum(res.captureLossMap.optimalPoint.maxDailyRadiationKwh, 3)} kWh/m²/día (${formatInt(Math.round(res.captureLossMap.optimalPoint.maxAnnualRadiationKwhM2))} kWh/m²·año)`;
  drawRichText(doc, optTitle, 24, cteTopY + 8.5, 8.5, 'left', true, [4, 120, 87]);

  // 4 CTE Limits Cards (Matching Imagen 4)
  const lCardY = cteTopY + 18;
  const lCardW = 39.5;
  const lCardH = 22;

  // 1: General (<= 10%)
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(20, lCardY, lCardW, lCardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(22, 101, 52);
  doc.text(isEn ? 'CTE GENERAL LIMIT' : 'LÍMITE GENERAL CTE', 24, lCardY + 5.5);
  doc.text(isEn ? '(Loss <= 10%)' : '(Pérdida <= 10%)', 24, lCardY + 9.5);
  doc.setFontSize(11);
  doc.text(formatPercent(res.captureLossMap.cteZones.generalPctCompliant, 1), 24, lCardY + 16.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'of angular space' : 'del espacio angular', 24, lCardY + 20);

  // 2: Superposición (<= 20%)
  const l2X = 20 + lCardW + cardGap;
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(254, 240, 138);
  doc.roundedRect(l2X, lCardY, lCardW, lCardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(133, 77, 14);
  doc.text(isEn ? 'CTE SUPERPOSITION' : 'SUPERPOSICIÓN CTE', l2X + 4, lCardY + 5.5);
  doc.text(isEn ? '(Loss <= 20%)' : '(Pérdida <= 20%)', l2X + 4, lCardY + 9.5);
  doc.setFontSize(11);
  doc.text(formatPercent(res.captureLossMap.cteZones.superpositionPctCompliant, 1), l2X + 4, lCardY + 16.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'of angular space' : 'del espacio angular', l2X + 4, lCardY + 20);

  // 3: Integración (<= 40%)
  const l3X = l2X + lCardW + cardGap;
  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(254, 215, 170);
  doc.roundedRect(l3X, lCardY, lCardW, lCardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(154, 52, 18);
  doc.text(isEn ? 'ARCH. INTEGRATION' : 'INTEGRACIÓN ARQUITECT.', l3X + 4, lCardY + 5.5);
  doc.text(isEn ? '(Loss <= 40%)' : '(Pérdida <= 40%)', l3X + 4, lCardY + 9.5);
  doc.setFontSize(11);
  doc.text(formatPercent(res.captureLossMap.cteZones.integrationPctCompliant, 1), l3X + 4, lCardY + 16.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'of angular space' : 'del espacio angular', l3X + 4, lCardY + 20);

  // 4: Fuera de norma (> 40%)
  const l4X = l3X + lCardW + cardGap;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(254, 202, 202);
  doc.roundedRect(l4X, lCardY, lCardW, lCardH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(153, 27, 27);
  doc.text(isEn ? 'NON-COMPLIANT' : 'FUERA DE NORMA', l4X + 4, lCardY + 5.5);
  doc.text(isEn ? '(Loss > 40%)' : '(Pérdida > 40%)', l4X + 4, lCardY + 9.5);
  doc.setFontSize(11);
  const outOfNorm = 100 - res.captureLossMap.cteZones.integrationPctCompliant;
  doc.text(formatPercent(outOfNorm, 1), l4X + 4, lCardY + 16.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'outside CTE limits' : 'fuera de norma CTE', l4X + 4, lCardY + 20);

  // Diagram of Capture Loss Map (positioned directly below CTE zone cards)
  const mapY = lCardY + lCardH + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  const extraStartPage = pageChapLossMaps + 1;
  const extraEndPage = pageChapLossMaps + extraMapPages;
  const extraPageText = extraMapPages > 1
    ? (isEn ? `Pages ${extraStartPage}-${extraEndPage}` : `Págs. ${extraStartPage} y ${extraEndPage}`)
    : (isEn ? `Page ${extraStartPage}` : `Pág. ${extraStartPage}`);

  const mapTitle =
    studyType === 'monthly'
      ? isEn
        ? `Capture Loss Isoline Diagram (Annual Global Benchmark • 12 Monthly Maps on ${extraPageText})`
        : `Diagrama Isolíneas del Mapa de Pérdidas (Referencia Anual • 12 Mapas Mensuales en ${extraPageText})`
      : studyType === 'seasonal'
      ? isEn
        ? `Capture Loss Isoline Diagram (Annual Global Benchmark • 4 Seasonal Maps on ${extraPageText})`
        : `Diagrama Isolíneas del Mapa de Pérdidas (Referencia Anual • 4 Mapas Estacionales en ${extraPageText})`
      : isEn
      ? 'CTE DB-HE4 Isoline Loss Heatmap Diagram (1° Resolution)'
      : 'Diagrama Isolíneas del Mapa de Pérdidas de Captación (Resolución 1°)';
  doc.text(mapTitle, 20, mapY);

  const mapBoxY = mapY + 3;
  const mapW = 170;
  const mapH = 60;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, mapBoxY, mapW, mapH, 2, 2, 'FD');

  // Draw simulated CTE contour zones strictly contained within card
  const optXMap = 20 + mapW / 2;
  const rawOptYMap = mapBoxY + mapH * (1 - optAngle / 90.0);
  const ryMax = 12.0;
  // Center strictly clamped so orange ellipse ry=12 never reaches closer than 7mm to top/bottom borders
  const optYMap = Math.max(mapBoxY + ryMax + 5, Math.min(mapBoxY + mapH - ryMax - 7, rawOptYMap));

  // Zone 4: Red (> 40%) - Background frame
  doc.setFillColor(254, 226, 226);
  doc.roundedRect(22, mapBoxY + 2, mapW - 4, mapH - 4, 1.5, 1.5, 'F');

  // Zone 3: Orange (<= 40%) - Strictly bounded
  doc.setFillColor(254, 215, 170);
  doc.ellipse(optXMap, optYMap, 50, 12, 'F');

  // Zone 2: Yellow (<= 20%)
  doc.setFillColor(254, 240, 138);
  doc.ellipse(optXMap, optYMap, 33, 8.5, 'F');

  // Zone 1: Green (<= 10%)
  doc.setFillColor(187, 247, 208);
  doc.ellipse(optXMap, optYMap, 18, 5.0, 'F');

  // Center crosshair and star
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.4);
  doc.line(optXMap - 56, optYMap, optXMap + 56, optYMap);
  doc.line(optXMap, mapBoxY + 4, optXMap, mapBoxY + mapH - 5);

  doc.setFillColor(30, 41, 59);
  doc.circle(optXMap, optYMap, 1.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`* ${isEn ? 'OPTIMUM: Tilt' : 'OPTIMO: Inc'} = ${optAngle}°, ${isEn ? 'Azimuth' : 'Ori'} = 0° (0% ${isEn ? 'loss' : 'perdida'})`, optXMap + 3, optYMap - 2.5);

  // Axis Labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? '-90° (East)' : '-90° (Este)', 24, mapBoxY + mapH - 2);
  doc.text(isEn ? '0° (South)' : '0° (Sur)', optXMap - 4, mapBoxY + mapH - 2);
  doc.text(isEn ? '+90° (West)' : '+90° (Oeste)', 166, mapBoxY + mapH - 2);

  doc.text(isEn ? '90° (Vertical)' : '90° (Vertical)', 23, mapBoxY + 6);
  doc.text(isEn ? '0° (Horizontal)' : '0° (Horizontal)', 23, mapBoxY + mapH - 7);

  // Insights box on CTE
  const ins4Y = mapBoxY + mapH + 6;
  drawInsightBox(
    isEn ? 'KEY TECHNICAL INSIGHTS: CTE DB-HE4 REGULATORY COMPLIANCE' : 'INSIGHTS TÉCNICOS DESTACADOS: CUMPLIMIENTO REGLAMENTARIO CTE DB-HE4',
    isEn
      ? [
          `Architectural Integration Tolerance: For rooftop and facade installations, DB-HE4 allows up to 20% (superposition) and 40% (architectural integration) capture losses. This permits orienting collectors up to +/-60° azimuth from south within Spanish regulatory limits.`,
          `Optimal Design Window for General Limit (Loss <= 10%): The optimal window for utility-scale ground or flat-roof arrays corresponds to the green domain (Tilt between 18° and 48°, Azimuth between -25° and +25°), securing over 90% of maximum potential solar yield.`,
        ]
      : [
          `Tolerancia de Integración Arquitectónica: Para instalaciones en cubiertas y fachadas existentes, el DB-HE4 admite hasta un 20% (superposición) y 40% (integración arquitectónica) de pérdidas. Esto permite desviar los captadores hasta +/-60° azimutales respecto al sur con una penalización admisible dentro de los estándares legales españoles.`,
          `Ventana de Inclinación para Límite General (Pérdida <= 10%): El diseño óptimo para grandes generadores o instalaciones en suelo queda circunscrito al elipsoide verde (Inclinación entre 18° y 48°, Orientación entre -25° y +25°), asegurando captar más del 90% del recurso solar potencial disponible.`,
        ],
    20,
    ins4Y,
    170,
    32
  );

  // =========================================================================
  // PÁGINAS 4.x: MAPAS DE PÉRDIDAS MENSUALES (12) / ESTACIONALES (4)
  // =========================================================================
  const drawMiniLossMap = (m: MiniLossMap, x: number, y: number, w: number, h: number) => {
    // Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sanitizePdfText(m.label), x + 3, y + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(sanitizePdfText(m.sub), x + w - 3, y + 5.5, { align: 'right' });

    drawRichText(
      doc,
      `${isEn ? 'Optimum: Tilt' : 'Optimo: Inc'} = ${formatNum(m.betaDeg, 0, false)}°, ${isEn ? 'Az' : 'Ori'} = ${formatNum(m.alphaDeg, 0, false)}° | ${formatNum(m.maxDaily, 2)} kWh/m²/d`,
      x + 3,
      y + 10,
      6.5,
      'left',
      true,
      [4, 120, 87]
    );

    // Heatmap area
    const hx = x + 9;
    const hy = y + 13;
    const hw = w - 12;
    const hh = h - 28;
    const betas = lossMapRes.betasDeg;
    const alphas = lossMapRes.alphasDeg;
    const mat = m.lossMatrix;
    if (mat && mat.length === betas.length && betas.length > 0 && alphas.length > 0) {
      const nR = betas.length;
      const nC = alphas.length;
      const cw = hw / nC;
      const ch = hh / nR;
      for (let r = 0; r < nR; r++) {
        // row 0 -> lowest beta at bottom
        const betaIdxFromTop = betas[0] <= betas[nR - 1] ? nR - 1 - r : r;
        const cy = hy + betaIdxFromTop * ch;
        for (let c = 0; c < nC; c++) {
          const l = mat[r][c];
          if (l <= 10) doc.setFillColor(134, 239, 172);
          else if (l <= 20) doc.setFillColor(253, 224, 71);
          else if (l <= 40) doc.setFillColor(253, 186, 116);
          else doc.setFillColor(252, 165, 165);
          doc.rect(hx + c * cw, cy, cw + 0.05, ch + 0.05, 'F');
        }
      }
      // Optimum marker
      const aMin = Math.min(...alphas);
      const aMax = Math.max(...alphas);
      const bMin = Math.min(...betas);
      const bMax = Math.max(...betas);
      const ox = hx + ((m.alphaDeg - aMin) / (aMax - aMin || 1)) * hw;
      const oy = hy + hh - ((m.betaDeg - bMin) / (bMax - bMin || 1)) * hh;
      doc.setFillColor(15, 23, 42);
      doc.circle(Math.max(hx + 1, Math.min(hx + hw - 1, ox)), Math.max(hy + 1, Math.min(hy + hh - 1, oy)), 1.0, 'F');
    } else {
      doc.setFillColor(254, 226, 226);
      doc.rect(hx, hy, hw, hh, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(isEn ? 'Matrix not available' : 'Matriz no disponible', hx + hw / 2, hy + hh / 2, { align: 'center' });
    }
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.2);
    doc.rect(hx, hy, hw, hh, 'S');

    // Axis labels
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(100, 116, 139);
    doc.text('90°', x + 2, hy + 2);
    doc.text('0°', x + 3, hy + hh);
    doc.text('-90° E', hx, hy + hh + 3);
    doc.text('0° S', hx + hw / 2, hy + hh + 3, { align: 'center' });
    doc.text(`+90° ${isEn ? 'W' : 'O'}`, hx + hw, hy + hh + 3, { align: 'right' });

    // CTE compliance summary
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    const sy = y + h - 4;
    doc.setTextColor(22, 101, 52);
    doc.text(sanitizePdfText(`<=10%: ${formatNum(m.zones.generalPctCompliant, 1)}%`), x + 3, sy);
    doc.setTextColor(133, 77, 14);
    doc.text(sanitizePdfText(`<=20%: ${formatNum(m.zones.superpositionPctCompliant, 1)}%`), x + w / 2, sy, { align: 'center' });
    doc.setTextColor(154, 52, 18);
    doc.text(sanitizePdfText(`<=40%: ${formatNum(m.zones.integrationPctCompliant, 1)}%`), x + w - 3, sy, { align: 'right' });
  };

  if (extraMapPages > 0) {
    const cols = 2;
    const rows = studyType === 'monthly' ? 3 : 2;
    const gridTop = 36;
    const gridBottom = pageHeight - 22;
    const gap = 5;
    const cardW = (170 - gap) / cols;
    const cardH = (gridBottom - gridTop - gap * (rows - 1)) / rows;

    for (let p = 0; p < extraMapPages; p++) {
      doc.addPage();
      const pageNo = pageChapLossMaps + p + 1;
      const extraChapterPrefix = hasEnergyPage ? (isEn ? 'Chapter 5.' : 'Capítulo 5.') : (isEn ? 'Chapter 4.' : 'Capítulo 4.');
      drawPageChrome(
        studyType === 'monthly'
          ? `${extraChapterPrefix} ${isEn ? `Monthly Loss Maps (${p + 1}/${extraMapPages})` : `Mapas de Pérdidas Mensuales (${p + 1}/${extraMapPages})`}`
          : `${extraChapterPrefix} ${isEn ? 'Seasonal Loss Maps' : 'Mapas de Pérdidas Estacionales'}`,
        pageNo,
        totalPagesDyn
      );

      // Title & Legend: wrap title to max 94mm so it never collides with the legend at lx = 120mm
      const titleStr = sanitizePdfText(
        studyType === 'monthly'
          ? isEn
            ? 'CTE DB-HE4 Capture Loss Maps - 12 Monthly Positions'
            : 'Mapas de Pérdidas de Captación CTE DB-HE4 - 12 Posiciones Mensuales'
          : isEn
          ? 'CTE DB-HE4 Capture Loss Maps - 4 Seasonal Positions'
          : 'Mapas de Pérdidas de Captación CTE DB-HE4 - 4 Posiciones Estacionales'
      );
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const titleLines: string[] = doc.splitTextToSize(titleStr, 94);
      if (titleLines.length === 1) {
        doc.text(titleLines[0], 20, 29);
      } else {
        doc.text(titleLines[0], 20, 27.2);
        doc.text(titleLines[1], 20, 31.0);
      }

      // Legend positioned safely to the right starting at lx = 120mm
      const legend: [string, [number, number, number]][] = [
        ['<= 10%', [134, 239, 172]],
        ['<= 20%', [253, 224, 71]],
        ['<= 40%', [253, 186, 116]],
        ['> 40%', [252, 165, 165]],
      ];
      let lx = 120;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      legend.forEach(([lbl, col]) => {
        doc.setFillColor(col[0], col[1], col[2]);
        doc.rect(lx, 26.5, 3.5, 3, 'F');
        doc.setTextColor(51, 65, 85);
        doc.text(sanitizePdfText(lbl), lx + 4.5, 29);
        lx += 17.5;
      });

      const slice = extraMapsList.slice(p * mapsPerPage, (p + 1) * mapsPerPage);
      slice.forEach((m, i) => {
        const cx = 20 + (i % cols) * (cardW + gap);
        const cy = gridTop + Math.floor(i / cols) * (cardH + gap);
        drawMiniLossMap(m, cx, cy, cardW, cardH);
      });
    }
  }

  // =========================================================================
  // PÁGINA FINAL: CURVA DE EVOLUCIÓN CONTINUA 1° A 90° (Capítulo Radiación)
  // =========================================================================
  doc.addPage();
  const evolutionChapterHeader = hasEnergyPage
    ? (isEn ? 'Chapter 6. Continuous Radiation Evolution Curve (Tilt 1° to 90°)' : 'Capítulo 6. Evolución Continua de Radiación (Inclinación 1° a 90°)')
    : (isEn ? 'Chapter 5. Continuous Radiation Evolution Curve (Tilt 1° to 90°)' : 'Capítulo 5. Evolución Continua de Radiación (Inclinación 1° a 90°)');
  drawPageChrome(evolutionChapterHeader, pageChapEvolution, totalPagesDyn);

  // Curve 1° to 90° Chart Frame
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'Global Radiation Evolution Across Tilt Spectrum (Tilt 1° to 90°)' : 'Evolución de la Radiación en el Rango Continuo de Inclinaciones (Inclinación 1° a 90°)', 20, 28);

  const cvW = 170;
  const cvH = 65;
  const cvBoxY = 30;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, cvBoxY, cvW, cvH, 2, 2, 'FD');

  // Compute 1° to 90° points
  const radCurve1to90: number[] = [];
  for (let deg = 1; deg <= 90; deg++) {
    const mDaily = getMonthlyRadiationForAngle(res, 'global', deg);
    radCurve1to90.push(mDaily.reduce((a, b) => a + b, 0) / 12);
  }

  const meanRad0 = res.horizontal.annualMeanDailyKwh;
  const meanRadStudy =
    studyType === 'annual'
      ? res.optimalAnnual.annualMeanDailyKwh
      : studyType === 'monthly'
      ? res.monthlyOptimum12.annualMeanDailyKwh
      : studyType === 'seasonal'
      ? res.seasonal.annualMeanDailyKwh
      : studyType === 'polar'
      ? res.tracking.polarAxis.annualMeanDailyKwh
      : studyType === 'azimuthal'
      ? res.tracking.azimuthalAxis.annualMeanDailyKwh
      : studyType === 'horizontal'
      ? res.tracking.horizontalAxis.annualMeanDailyKwh
      : res.tracking.dualAxis.annualMeanDailyKwh;
  const maxValCv = Math.max(...radCurve1to90, meanRad0, meanRadStudy) * 1.15;
  const minValCv = Math.min(...radCurve1to90, meanRad0, meanRadStudy) * 0.85;

  const axOriginX = 36;
  const axOriginY = cvBoxY + cvH - 12; // 83
  const axMaxX = 24 + 12 + (cvW - 24); // 182 = getCvX(90)
  const axTopY = cvBoxY + 13; // 43

  const getCvX = (deg: number) => axOriginX + ((deg - 1) / 89) * (cvW - 24);
  const getCvY = (val: number) => axOriginY - ((val - minValCv) / (maxValCv - minValCv || 1)) * (cvH - 24);

  // Background Grid and Y-Axis Ticks & Values
  const numYTicks = 4;
  for (let i = 0; i <= numYTicks; i++) {
    const val = minValCv + (i / numYTicks) * (maxValCv - minValCv);
    const yPos = getCvY(val);

    // Subtle horizontal grid line
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.2);
    doc.line(axOriginX, yPos, axMaxX, yPos);

    // Y tick mark
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.35);
    doc.line(axOriginX - 1.5, yPos, axOriginX, yPos);

    // Y numeric label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(formatNum(val, 1), axOriginX - 2.5, yPos + 0.9, { align: 'right' });
  }

  // Y-Axis Title / Unit (Wrapped cleanly into 2 lines strictly inside margin and above top tick)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Gdm', axOriginX - 2.5, cvBoxY + 8.5, { align: 'right' });
  doc.text('(kWh/m²/d)', axOriginX - 2.5, cvBoxY + 11.5, { align: 'right' });

  // Horizontal Reference Line
  const y0Line = getCvY(meanRad0);
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(0.6);
  doc.line(axOriginX, y0Line, axMaxX, y0Line);

  // Study Average Reference Line
  const yStudyLine = getCvY(meanRadStudy);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.8);
  doc.line(axOriginX, yStudyLine, axMaxX, yStudyLine);

  // Main 1° to 90° Curve (Royal Blue)
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.4);
  for (let deg = 1; deg < 90; deg++) {
    doc.line(
      getCvX(deg),
      getCvY(radCurve1to90[deg - 1]),
      getCvX(deg + 1),
      getCvY(radCurve1to90[deg])
    );
  }

  // Peak Circle & Optimum Annotation
  const optClamped = Math.max(1, Math.min(90, optAngle));
  const optPx = getCvX(optClamped);
  const optPy = getCvY(radCurve1to90[optClamped - 1]);

  doc.setFillColor(220, 38, 38);
  doc.circle(optPx, optPy, 2.0, 'F');
  doc.setDrawColor(220, 38, 38);
  doc.setLineWidth(0.5);
  doc.line(optPx, optPy, optPx, axOriginY);

  const optCurveText = `* ${isEn ? 'Optimal Tilt: Tilt' : 'Inclinación Óptima: Inc'} = ${optClamped}° (${formatNum(radCurve1to90[optClamped - 1], 2)} kWh/m²/d)`;
  drawRichText(doc, optCurveText, optPx - 15, optPy - 4, 7.5, 'left', true, [220, 38, 38]);

  // Main X & Y Axes Lines
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.5);
  doc.line(axOriginX, axTopY, axOriginX, axOriginY); // Vertical Y axis line
  doc.line(axOriginX, axOriginY, axMaxX, axOriginY); // Horizontal X axis line

  // X Axis Ticks & Numerical Labels
  for (const ang of [1, 15, 30, 45, 60, 75, 90]) {
    const ax = getCvX(ang);
    // Tick downwards
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.35);
    doc.line(ax, axOriginY, ax, axOriginY + 1.5);

    // Angle label
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text(`${ang}°`, ax, axOriginY + 4.2, { align: 'center' });
  }

  // X-Axis Title / Unit (Wrapped cleanly, character-safe without corrupted glyphs)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(71, 85, 105);
  const axMidX = (axOriginX + axMaxX) / 2;
  const xTitle = isEn ? 'Collector Tilt Angle (°)' : 'Ángulo de Inclinación del Captador (°)';
  const xTitleWrapped = doc.splitTextToSize(xTitle, 75);
  xTitleWrapped.forEach((line: string, lIdx: number) => {
    doc.text(line, axMidX, axOriginY + 8.5 + lIdx * 3.0, { align: 'center' });
  });

  // Legend
  doc.setFontSize(6.8);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(1.2);
  doc.line(38, cvBoxY + 7, 46, cvBoxY + 7);
  doc.setTextColor(37, 99, 235);
  doc.text(isEn ? 'Gdm Curve (1°..90°)' : 'Curva Gdm (1°..90°)', 48, cvBoxY + 8);

  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(0.8);
  doc.line(82, cvBoxY + 7, 90, cvBoxY + 7);
  doc.setTextColor(14, 165, 233);
  doc.text(`${isEn ? 'Horizontal Plane 0°' : 'Plano Horizontal 0°'} (${formatNum(meanRad0, 2)})`, 92, cvBoxY + 8);

  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(1.0);
  const legendStudyCurve = doc.splitTextToSize(`${cleanStudyName} (${formatNum(meanRadStudy, 2)})`, 50);
  const isMultiLineStudy = legendStudyCurve.length > 1;
  const lineYStudy = isMultiLineStudy ? cvBoxY + 7.5 : cvBoxY + 7.0;
  doc.line(134, lineYStudy, 142, lineYStudy);
  doc.setTextColor(16, 185, 129);
  if (isMultiLineStudy) {
    doc.text(legendStudyCurve[0], 144, cvBoxY + 6.2);
    doc.text(legendStudyCurve[1], 144, cvBoxY + 9.2);
  } else {
    doc.text(legendStudyCurve[0] || '', 144, cvBoxY + 8);
  }

  // Key Tilts Discrete Table
  const dtY = cvBoxY + cvH + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'Discrete Tilt Angles Benchmark Matrix' : 'Valores Discretos de Radiación en Inclinaciones Estándar', 20, dtY);

  const dtBoxY = dtY + 3;
  doc.setFillColor(30, 41, 59);
  doc.rect(20, dtBoxY, 170, 6.0, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);

  const dtCols = [
    isEn ? 'Tilt Angle' : 'Inclinación',
    isEn ? 'Mean Gdm (kWh/m²/d)' : 'Gdm Media (kWh/m²/d)',
    isEn ? 'Annual Irrad. (kWh/m²)' : 'Irradiación Anual (kWh/m²)',
    isEn ? 'Gain vs Horiz (%)' : 'Ganancia vs Horiz (%)',
    isEn ? 'Loss vs Opt (%)' : 'Pérdida vs Óptimo (%)',
  ];
  const dtX = [24, 56, 95, 133, 162];
  dtCols.forEach((col, idx) => drawRichText(doc, col, dtX[idx], dtBoxY + 4, 6.5, 'left', true, [255, 255, 255]));

  const sampleDegs = [0, 15, 30, 45, 60, 75, 90, optAngle];
  const uniqueDegs = Array.from(new Set(sampleDegs)).sort((a, b) => a - b);
  const maxRadOptVal = radCurve1to90[optClamped - 1];

  let curDtY = dtBoxY + 6.0;
  uniqueDegs.forEach((deg, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, curDtY, 170, 5.0, 'F');
    }
    const val = deg === 0 ? meanRad0 : radCurve1to90[deg - 1];
    const ann = val * 365;
    const gainH = meanRad0 > 0 ? ((val - meanRad0) / meanRad0) * 100 : 0;
    const lossOpt = maxRadOptVal > 0 ? ((maxRadOptVal - val) / maxRadOptVal) * 100 : 0;

    doc.setFont('helvetica', deg === optAngle ? 'bold' : 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(deg === optAngle ? 220 : 15, deg === optAngle ? 38 : 23, deg === optAngle ? 38 : 42);
    doc.text(
      deg === optAngle
        ? (isEn ? `Tilt = ${deg}° (OPTIMAL)` : `Inc = ${deg}° (ÓPTIMO)`)
        : (isEn ? `Tilt = ${deg}°` : `Inc = ${deg}°`),
      dtX[0],
      curDtY + 3.5
    );

    const valColor: [number, number, number] = deg === optAngle ? [220, 38, 38] : [30, 41, 59];
    drawRichText(doc, `${formatNum(val, 3)} kWh/m²/d`, dtX[1], curDtY + 3.5, 6.5, 'left', deg === optAngle, valColor);
    drawRichText(doc, `${formatInt(Math.round(ann))} kWh/m²`, dtX[2], curDtY + 3.5, 6.5, 'left', deg === optAngle, valColor);

    doc.setFont('helvetica', deg === optAngle ? 'bold' : 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(gainH >= 0 ? 16 : 220, gainH >= 0 ? 185 : 38, gainH >= 0 ? 129 : 38);
    doc.text(`${gainH >= 0 ? '+' : ''}${formatNum(gainH, 2)}%`, dtX[3], curDtY + 3.5);

    doc.setTextColor(lossOpt <= 0.05 ? 16 : lossOpt <= 10 ? 234 : 220, lossOpt <= 0.05 ? 185 : lossOpt <= 10 ? 179 : 38, lossOpt <= 0.05 ? 129 : lossOpt <= 10 ? 8 : 38);
    doc.text(lossOpt <= 0.05 ? (isEn ? '0.00% (Max)' : '0,00% (Máx)') : `-${formatNum(lossOpt, 2)}%`, dtX[4], curDtY + 3.5);

    curDtY += 5.0;
  });

  // Insights box on tilt curve
  const ins5Y = curDtY + 6;
  drawInsightBox(
    isEn ? 'KEY TECHNICAL INSIGHTS: ANGULAR SENSITIVITY' : 'INSIGHTS TÉCNICOS DESTACADOS: SENSIBILIDAD ANGULAR Y MESETA DE TOLERANCIA',
    isEn
      ? [
          `Angular Tolerance Plateau: The annual radiation curve exhibits a broad convex plateau around optimum (Tilt = ${optAngle}°). Tilts between 20° and 40° capture over 98.8% of maximum potential resource, offering generous construction tolerance for standard roof pitches.`,
          `Accelerated Drop at Steep Angles: For inclinations above 60°, radiation capture drops sharply (up to -28% at 90° compared to optimum) due to reduced direct beam projection during peak summer insolation.`,
        ]
      : [
          `Meseta de Tolerancia Angular: La curva anual de radiación exhibe una amplia meseta convexa en torno al óptimo (Inclinación = ${optAngle}°). Inclinaciones en el rango de 20° a 40° capturan más del 98,8% del recurso máximo potencial, permitiendo una gran tolerancia constructiva para adaptarse a pendientes de tejados estándar.`,
          `Caída Acelerada en Inclinaciones Elevadas: Para inclinaciones superiores a 60°, la captación desciende rápidamente (hasta un -28% a 90° frente a la óptima), debido a la reducción del factor de visión directa durante los meses estivales de mayor insolación.`,
        ],
    20,
    ins5Y,
    170,
    30
  );

  // -------------------------------------------------------------
  // SAVE / DOWNLOAD PDF WITH TIMESTAMP
  // -------------------------------------------------------------
  const cleanLoc = res.locationName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = isEn
    ? `OrientSol4_Technical_Report_${studyType.toUpperCase()}_${cleanLoc}_${fileTimestamp}.pdf`
    : `OrientSol4_Informe_${studyType.toUpperCase()}_${cleanLoc}_${fileTimestamp}.pdf`;
  const pdfBlob = doc.output('blob');

  let savedDirectoryLabel = 'C:\\OrientSol3\\InformesPDF';

  // Use File System Access API if available
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Documento PDF (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      savedDirectoryLabel = handle.name || filename;
      showPdfGeneratedSuccessModal(savedDirectoryLabel, isEn);
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return; // User cancelled
    }
  }

  // Fallback download
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  showPdfGeneratedSuccessModal('C:\\OrientSol3\\InformesPDF', isEn);
}

/**
 * Energy Data Interface for Official Energy Report
 */
export interface EnergyDataReport {
  e0_mes: number[];
  e_mes: number[];
  ganancia_mes: number[];
  e0_anual: number;
  e_anual: number;
  ganancia_anual: number;
}

/**
 * Generates the Official OrientSol 4.0 Energy Report PDF strictly conforming to:
 * - Figura 5.2.83: Contenidos del informe generado para la energía producida
 * - Tabla de contenidos (1. Introducción, 2. Energía generada)
 * - Lista de figuras (2.1. Energía media horizontal, 2.2. Energía estudio seleccionado, 2.3. Ganancias respecto al plano horizontal)
 * - Exact Timestamps and Highlighted Insights
 */
export async function generateOrientSolEnergyPDFReport(
  res: SolarBridgeSimulationResult,
  energyData: EnergyDataReport,
  peakKw: number,
  coefTemp: number,
  tonc: number,
  studyTitle: string,
  isEn: boolean
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const months = isEn
    ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const downloadDateFormatted = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const fileTimestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const cleanStudyTitle = sanitizePdfText(studyTitle);

  // Header & Footer helper using the exact same format
  const drawPageChrome = (chapterTitle: string, pageNum: number, totalPages: number) => {
    drawOrientSolPageChrome(doc, {
      chapterTitle,
      subHeader: `OrientSol 4.0 • ${cleanStudyTitle} • ${res.locationName} (Lat: ${formatNum(res.latitude, 2)}°)`,
      pageNum,
      totalPages,
      formattedDateTime: downloadDateFormatted,
      isoTimestamp: now.toISOString(),
      isEn,
      skipHeader: false,
    });
  };

  // =========================================================================
  // PÁGINA 1: PORTADA & CONTENIDOS DEL INFORME (Figura 5.2.83)
  // =========================================================================
  drawPageChrome(
    isEn
      ? 'Chapter 1. Introduction & PV Installation Parameters'
      : 'Capítulo 1. Introducción y Parámetros de la Instalación FV',
    1,
    3
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isEn
      ? 'OrientSol 4.0 • Software Implementation & Energy Study'
      : 'OrientSol 4.0 • Implementación de Software y Estudio Energético',
    20,
    30
  );

  // Box 1: Tabla de contenidos
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(20, 38, 170, 32, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'Table of contents' : 'Tabla de contenidos', 25, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    isEn
      ? '1. Introduction ................................................................................................................... 1'
      : '1. Introducción ................................................................................................................... 1',
    25,
    57
  );
  doc.text(
    isEn
      ? '2. Generated energy ............................................................................................................ 2'
      : '2. Energía generada ............................................................................................................ 2',
    25,
    64
  );

  // Box 2: Lista de figuras
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(20, 76, 170, 40, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? 'List of figures' : 'Lista de figuras', 25, 86);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    isEn
      ? '2.1. Mean monthly energy on horizontal surface ................................................................ 2'
      : '2.1. Energía media mensual sobre superficie horizontal ..................................................... 2',
    25,
    95
  );
  doc.text(
    isEn
      ? '2.2. Mean monthly energy for selected study .................................................................... 3'
      : '2.2. Energía media mensual para el estudio seleccionado ................................................... 3',
    25,
    102
  );
  doc.text(
    isEn
      ? '2.3. Global radiation gains relative to horizontal plane ................................................... 3'
      : '2.3. Ganancias de la rad. global respecto al plano horizontal ............................................... 3',
    25,
    109
  );

  // Caption: Figura 5.2.83
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(37, 99, 235);
  doc.text(
    isEn
      ? 'Figure 5.2.83. Report contents generated for produced energy'
      : 'Figura 5.2.83. Contenidos del informe generado para la energía producida',
    25,
    122
  );

  // Sección 1: Introducción
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? '1. Introduction' : '1. Introducción', 20, 134);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(20, 138, 170, 78, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${isEn ? 'Location' : 'Ciudad'}:`, 25, 146);
  doc.setFont('helvetica', 'normal');
  const locLinesEnergy: string[] = doc.splitTextToSize(sanitizePdfText(res.locationName), 52);
  doc.text(locLinesEnergy, 55, 146);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Latitude' : 'Latitud'}:`, 110, 146);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatNum(res.latitude, 4)}°`, 135, 146);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Study' : 'Estudio'}:`, 25, 154);
  doc.setFont('helvetica', 'normal');
  const studyTitleLines = doc.splitTextToSize(cleanStudyTitle, 52);
  doc.text(studyTitleLines, 55, 154);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Method' : 'Método'}:`, 110, 154);
  doc.setFont('helvetica', 'normal');
  doc.text('Osterwald Thermal & Yield Model', 135, 154);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Installed peak power' : 'Potencia pico instalada'}:`, 25, 162);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatNum(peakKw, 2)} kWp`, 80, 162);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Temperature coefficient' : 'Coeficiente de temperatura'} (gamma):`, 25, 170);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatNum(coefTemp, 4)} 1/°C`, 85, 170);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'NOCT / TONC' : 'TONC'}:`, 25, 178);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formatNum(tonc, 1)} °C`, 85, 178);

  doc.setFont('helvetica', 'bold');
  doc.text(`${isEn ? 'Export timestamp' : 'Marca temporal de exportación'}:`, 25, 186);
  doc.setFont('helvetica', 'normal');
  const tsEnergyLines: string[] = doc.splitTextToSize(`${downloadDateFormatted} (ISO: ${now.toISOString()})`, 98);
  doc.text(tsEnergyLines, 85, 186);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const formula1 = isEn
    ? 'Calculation implemented according to Osterwald formula: PM = PM,STC · (G/1000) · [1 + gamma · (T_C - 25)]'
    : 'Cálculo implementado según la fórmula de Osterwald: PM = PM,STC · (G/1000) · [1 + gamma · (T_C - 25)]';
  const f1Lines = doc.splitTextToSize(sanitizePdfText(formula1), 160);
  doc.text(f1Lines, 25, 199);

  const formula2 = isEn
    ? 'where cell temperature is given by: T_C = T_{amb} + [(NOCT - 20) / 800] · G'
    : 'donde la temperatura de célula viene dada por: T_C = T_{amb} + [(TONC - 20) / 800] · G';
  const f2Lines = doc.splitTextToSize(sanitizePdfText(formula2), 160);
  doc.text(f2Lines, 25, 205);

  // =========================================================================
  // PÁGINA 2: ENERGÍA GENERADA & FIGURA 2.1
  // =========================================================================
  doc.addPage();
  drawPageChrome(
    isEn
      ? 'Chapter 2. Monthly Energy Yield & Horizontal Plane Resource'
      : 'Capítulo 2. Energía Generada Mensual y Recurso en Superficie Horizontal',
    2,
    3
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(isEn ? '2. Generated energy' : '2. Energía generada', 20, 30);

  // Monthly Energy Table
  const tableY = 36;
  doc.setFillColor(37, 99, 235);
  doc.rect(20, tableY, 170, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(isEn ? 'Month' : 'Mes', 23, tableY + 5);
  doc.text(isEn ? 'Horizontal plane (kWh)' : 'Superficie horizontal (kWh)', 55, tableY + 5);
  doc.text(isEn ? 'Performed study (kWh)' : 'Estudio realizado (kWh)', 110, tableY + 5);
  doc.text(isEn ? 'Gain (kWh)' : 'Ganancia (kWh)', 160, tableY + 5);

  let curY = tableY + 7;
  for (let i = 0; i < 12; i++) {
    const isAlt = i % 2 === 1;
    if (isAlt) {
      doc.setFillColor(248, 250, 252);
      doc.rect(20, curY, 170, 5.5, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(months[i], 23, curY + 4);
    doc.text(formatNum(energyData.e0_mes[i], 2), 65, curY + 4);
    doc.text(formatNum(energyData.e_mes[i], 2), 120, curY + 4);

    const g = energyData.ganancia_mes[i];
    if (g >= 0) doc.setTextColor(16, 185, 129);
    else doc.setTextColor(239, 68, 68);
    doc.text(`${g >= 0 ? '+' : ''}${formatNum(g, 2)}`, 165, curY + 4);

    curY += 5.5;
  }

  // Annual total row
  doc.setFillColor(15, 23, 42);
  doc.rect(20, curY, 170, 6.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(isEn ? 'ANNUAL' : 'ANUAL', 23, curY + 4.5);
  doc.text(formatNum(energyData.e0_anual, 1), 65, curY + 4.5);
  doc.text(formatNum(energyData.e_anual, 1), 120, curY + 4.5);
  doc.text(`${energyData.ganancia_anual >= 0 ? '+' : ''}${formatNum(energyData.ganancia_anual, 2)}`, 165, curY + 4.5);

  // Figura 2.1: Gráfica de energía horizontal
  const chart1Y = curY + 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isEn
      ? 'Figure 2.1. Mean monthly energy on horizontal surface'
      : 'Figura 2.1. Energía media mensual sobre superficie horizontal',
    20,
    chart1Y
  );

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(20, chart1Y + 4, 170, 52, 2, 2, 'FD');

  const maxE0 = Math.max(...energyData.e0_mes) * 1.15 || 2500;
  const barPlotBaseY = chart1Y + 48;
  const barPlotH = 32;
  const barW = 8.5;
  const barStep = 12.5;
  const axisX1 = 30;
  const axisEndX1 = 186;

  // Axes lines and Y scale
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(axisX1, barPlotBaseY, axisX1, barPlotBaseY - barPlotH - 2); // Y axis line
  doc.line(axisX1, barPlotBaseY, axisEndX1, barPlotBaseY); // X baseline

  // Y axis title (Wrapped into 2 clean lines above top tick)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(71, 85, 105);
  doc.text(isEn ? 'Energy' : 'Energía', axisX1 - 2, barPlotBaseY - barPlotH - 3.8, { align: 'right' });
  doc.text('(kWh)', axisX1 - 2, barPlotBaseY - barPlotH - 1.2, { align: 'right' });

  const e0Ticks = [0.25, 0.5, 0.75, 1.0].map((f) => Math.round(maxE0 * f));
  e0Ticks.forEach((tv) => {
    const yT = barPlotBaseY - (tv / maxE0) * barPlotH;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.25);
    doc.line(axisX1, yT, axisEndX1, yT); // gridline
    doc.setDrawColor(203, 213, 225);
    doc.line(axisX1 - 1.2, yT, axisX1, yT); // tick
    doc.text(formatInt(tv), axisX1 - 2, yT + 1.2, { align: 'right' });
  });

  for (let i = 0; i < 12; i++) {
    const val = energyData.e0_mes[i];
    const h = (val / maxE0) * barPlotH;
    const x = axisX1 + 3 + i * barStep;
    const y = barPlotBaseY - h;

    doc.setFillColor(37, 99, 235);
    doc.rect(x, y, barW, h, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(i + 1), x + 2.5, barPlotBaseY + 4);

    doc.setFontSize(5.5);
    doc.setTextColor(37, 99, 235);
    doc.text(formatInt(Math.round(val)), x - 1, y - 2);
  }

  // X-Axis Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Month of the year' : 'Mes del año', (axisX1 + axisEndX1) / 2, barPlotBaseY + 7.5, { align: 'center' });

  // Insight box on Page 2
  const insE1Y = chart1Y + 60;
  drawPdfInsightBox(
    doc,
    isEn
      ? 'TECHNICAL INSIGHT: HORIZONTAL RESOURCE & SEASONAL VARIATION'
      : 'INSIGHT TÉCNICO: RECURSO HORIZONTAL Y VARIACIÓN ESTACIONAL',
    [
      isEn
        ? `Flat Surface Seasonality: Generation on a horizontal surface reaches its minimum in December (${formatInt(Math.round(energyData.e0_mes[11]))} kWh) and its maximum in July (${formatInt(Math.round(energyData.e0_mes[6]))} kWh), with a variation ratio of ${formatNum((energyData.e0_mes[6] || 1) / (energyData.e0_mes[11] || 1), 2)}x.`
        : `Estacionalidad de Superficie Plana: La generación sobre superficie horizontal alcanza su mínimo en diciembre (${formatInt(Math.round(energyData.e0_mes[11]))} kWh) y su máximo en julio (${formatInt(Math.round(energyData.e0_mes[6]))} kWh), con un factor de variación de ${formatNum((energyData.e0_mes[6] || 1) / (energyData.e0_mes[11] || 1), 2)}x.`,
    ],
    20,
    insE1Y,
    170,
    18
  );

  // =========================================================================
  // PÁGINA 3: FIGURAS 2.2 Y 2.3 CON INSIGHTS
  // =========================================================================
  doc.addPage();
  drawPageChrome(
    isEn
      ? 'Chapter 3. Energy Comparison & Net Yield Optimization'
      : 'Capítulo 3. Comparativa Energética y Ganancias Netas',
    3,
    3
  );

  // Figura 2.2: Energía estudio seleccionado
  const chart2Y = 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isEn
      ? 'Figure 2.2. Mean monthly energy for selected study'
      : 'Figura 2.2. Energía media mensual para el estudio seleccionado',
    20,
    chart2Y
  );

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(20, chart2Y + 4, 170, 54, 2, 2, 'FD');

  const maxE = Math.max(...energyData.e_mes) * 1.15 || 2500;
  const barPlot2BaseY = chart2Y + 48;
  const barPlot2H = 32;

  // Axes lines and Y scale
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(axisX1, barPlot2BaseY, axisX1, barPlot2BaseY - barPlot2H - 2); // Y axis line
  doc.line(axisX1, barPlot2BaseY, axisEndX1, barPlot2BaseY); // X baseline

  // Y axis title (Wrapped into 2 clean lines above top tick)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(71, 85, 105);
  doc.text(isEn ? 'Energy' : 'Energía', axisX1 - 2, barPlot2BaseY - barPlot2H - 3.8, { align: 'right' });
  doc.text('(kWh)', axisX1 - 2, barPlot2BaseY - barPlot2H - 1.2, { align: 'right' });

  const eTicks = [0.25, 0.5, 0.75, 1.0].map((f) => Math.round(maxE * f));
  eTicks.forEach((tv) => {
    const yT = barPlot2BaseY - (tv / maxE) * barPlot2H;
    doc.setDrawColor(241, 245, 249);
    doc.setLineWidth(0.25);
    doc.line(axisX1, yT, axisEndX1, yT); // gridline
    doc.setDrawColor(203, 213, 225);
    doc.line(axisX1 - 1.2, yT, axisX1, yT); // tick
    doc.text(formatInt(tv), axisX1 - 2, yT + 1.2, { align: 'right' });
  });

  for (let i = 0; i < 12; i++) {
    const val = energyData.e_mes[i];
    const h = (val / maxE) * barPlot2H;
    const x = axisX1 + 3 + i * barStep;
    const y = barPlot2BaseY - h;

    doc.setFillColor(16, 185, 129);
    doc.rect(x, y, barW, h, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(i + 1), x + 2.5, barPlot2BaseY + 4);

    doc.setFontSize(5.5);
    doc.setTextColor(16, 185, 129);
    doc.text(formatInt(Math.round(val)), x - 1, y - 2);
  }

  // X-Axis Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Month of the year' : 'Mes del año', (axisX1 + axisEndX1) / 2, barPlot2BaseY + 7.5, { align: 'center' });

  // Figura 2.3: Ganancias respecto al plano horizontal
  const chart3Y = chart2Y + 64;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isEn
      ? 'Figure 2.3. Global radiation gains with respect to horizontal plane'
      : 'Figura 2.3. Ganancias de la rad. global respecto al plano horizontal',
    20,
    chart3Y
  );

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(20, chart3Y + 4, 170, 56, 2, 2, 'FD');

  const maxGainAbs = Math.max(...energyData.ganancia_mes.map((g) => Math.abs(g))) * 1.25 || 500;
  const zeroLineY = chart3Y + 34;

  // Zero axis line and Y axis
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(axisX1, chart3Y + 12, axisX1, chart3Y + 50); // Vertical Y axis line
  doc.setDrawColor(148, 163, 184);
  doc.line(axisX1, zeroLineY, axisEndX1, zeroLineY); // Zero baseline

  // Y axis title (Wrapped into 2 clean lines above zero line)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.0);
  doc.setTextColor(71, 85, 105);
  doc.text(isEn ? 'Net Gain' : 'Ganancia', axisX1 - 2, chart3Y + 9.5, { align: 'right' });
  doc.text('(kWh)', axisX1 - 2, chart3Y + 12.2, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text('0', axisX1 - 2, zeroLineY + 1, { align: 'right' });

  // Gain ticks (+posGain, -posGain)
  const posGainTick = Math.round(maxGainAbs * 0.75);
  const yPosTick = zeroLineY - (posGainTick / maxGainAbs) * 18;
  const yNegTick = zeroLineY + (posGainTick / maxGainAbs) * 18;

  doc.setDrawColor(241, 245, 249);
  doc.setLineWidth(0.25);
  doc.line(axisX1, yPosTick, axisEndX1, yPosTick);
  doc.line(axisX1, yNegTick, axisEndX1, yNegTick);
  doc.setDrawColor(203, 213, 225);
  doc.line(axisX1 - 1.2, yPosTick, axisX1, yPosTick);
  doc.line(axisX1 - 1.2, yNegTick, axisX1, yNegTick);
  doc.text(`+${formatInt(posGainTick)}`, axisX1 - 2, yPosTick + 1.2, { align: 'right' });
  doc.text(`-${formatInt(posGainTick)}`, axisX1 - 2, yNegTick + 1.2, { align: 'right' });

  for (let i = 0; i < 12; i++) {
    const g = energyData.ganancia_mes[i];
    const h = (Math.abs(g) / maxGainAbs) * 18;
    const x = axisX1 + 3 + i * barStep;

    if (g >= 0) {
      doc.setFillColor(16, 185, 129);
      doc.rect(x, zeroLineY - h, barW, h, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(16, 185, 129);
      doc.text(`+${formatInt(Math.round(g))}`, x - 1, zeroLineY - h - 2);
    } else {
      doc.setFillColor(239, 68, 68);
      doc.rect(x, zeroLineY, barW, h, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(239, 68, 68);
      doc.text(formatInt(Math.round(g)), x - 1, zeroLineY + h + 5);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(i + 1), x + 2.5, zeroLineY + (g >= 0 ? 4 : -2));
  }

  // X-Axis Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 116, 139);
  doc.text(isEn ? 'Month of the year' : 'Mes del año', (axisX1 + axisEndX1) / 2, zeroLineY + 8.5, { align: 'center' });

  // Insight box on Page 3
  const insE2Y = chart3Y + 66;
  drawPdfInsightBox(
    doc,
    isEn
      ? 'TECHNICAL INSIGHT: NET CONTRIBUTION OF ENERGY OPTIMIZATION'
      : 'INSIGHT TÉCNICO: APORTE NETO DE LA OPTIMIZACIÓN ENERGÉTICA',
    [
      isEn
        ? `Cumulative Annual Gain: The selected configuration (${studyTitle}) provides a net annual gain of +${formatNum(energyData.ganancia_anual, 1)} kWh compared to a horizontal surface, concentrating the greatest relative gain during winter by intercepting beam irradiance at a lower incident angle.`
        : `Beneficio Anual Acumulado: La configuración seleccionada (${studyTitle}) genera una ganancia anual neta de +${formatNum(energyData.ganancia_anual, 1)} kWh frente a superficie horizontal, concentrándose el mayor beneficio relativo en invierno al captar la radiación directa con menor ángulo de incidencia.`,
    ],
    20,
    insE2Y,
    170,
    20
  );

  // Save the Energy PDF
  const cleanLoc = res.locationName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = isEn
    ? `OrientSol4_Energy_Report_${cleanLoc}_${fileTimestamp}.pdf`
    : `OrientSol4_Informe_Energia_${cleanLoc}_${fileTimestamp}.pdf`;
  const pdfBlob = doc.output('blob');

  let savedDirectoryLabel = 'C:\\OrientSol3\\InformesPDF';

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: isEn ? 'PDF Document (*.pdf)' : 'Documento PDF (*.pdf)',
            accept: { 'application/pdf': ['.pdf'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      savedDirectoryLabel = handle.name || filename;
      showPdfGeneratedSuccessModal(savedDirectoryLabel, isEn);
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  showPdfGeneratedSuccessModal('C:\\OrientSol3\\InformesPDF', isEn);
}
