import type { RadiationComponentType } from '@/components/climate/OptimalAnnualStudyPanel';
import { themeManager } from '@/services/theme/themeManager';
import { formatNum } from '@/utils/formatters';
import { renderWrappedSvgTitle } from './chartSvgUtils';

export interface InclinationEvolutionChartProps {
  radiationCurve: number[]; // 91 elements (angles 0° to 90°)
  allCurves?: {
    global: number[];
    beam: number[];
    diffuse: number[];
    albedo: number[];
  };
  component: RadiationComponentType;
  optimalAngle: number;
  selectedAngleX: number;
  gridEnabled: boolean;
  isEn: boolean;
}

export interface MonthlyOptimumChartProps {
  rad0: number[];
  radOpt: number[];
  radX: number[];
  gainsPct: number[]; // vs 0°
  allMonthlyData?: {
    global: { rad0: number[]; radOpt: number[]; radX: number[]; gainsPct: number[] };
    beam: { rad0: number[]; radOpt: number[]; radX: number[]; gainsPct: number[] };
    diffuse: { rad0: number[]; radOpt: number[]; radX: number[]; gainsPct: number[] };
    albedo: { rad0: number[]; radOpt: number[]; radX: number[]; gainsPct: number[] };
  };
  component: RadiationComponentType;
  optimalAngle: number;
  selectedAngleX: number;
  gridEnabled: boolean;
  isEn: boolean;
}

const MONTHS_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Saves the given SVG chart element standalone to a user-chosen local computer directory.
 * Uses the File System Access API (window.showSaveFilePicker) with high-res PNG and SVG support,
 * and falls back to standard download if not supported.
 */
export async function saveSvgChartLocally(
  svgElement: SVGSVGElement,
  fileNameBase: string,
  isEn: boolean
): Promise<{ success: boolean; message: string }> {
  try {
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

    // Render 2x high-resolution canvas
    const scale = 2;
    const vbWidth = svgElement.viewBox.baseVal?.width || 820;
    const vbHeight = svgElement.viewBox.baseVal?.height || 360;

    const canvas = document.createElement('canvas');
    canvas.width = vbWidth * scale;
    canvas.height = vbHeight * scale;
    const ctx = canvas.getContext('2d');

    const svgUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    const pngBlob = await new Promise<Blob>((resolve) => {
      img.onload = () => {
        if (ctx) {
          ctx.fillStyle = '#090d16';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else resolve(svgBlob);
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        resolve(svgBlob);
      };
      img.src = svgUrl;
    });

    // 1. Native OS File Picker: allows choosing specific local folder & name
    if (typeof (window as any).showSaveFilePicker === 'function') {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${fileNameBase}.png`,
          types: [
            {
              description: isEn ? 'PNG Image (*.png)' : 'Imagen PNG (*.png)',
              accept: { 'image/png': ['.png'] },
            },
            {
              description: isEn ? 'SVG Vector Graphic (*.svg)' : 'Gráfico Vectorial SVG (*.svg)',
              accept: { 'image/svg+xml': ['.svg'] },
            },
          ],
        });

        const chosenName: string = handle.name || `${fileNameBase}.png`;
        const writable = await handle.createWritable();
        if (chosenName.toLowerCase().endsWith('.svg')) {
          await writable.write(svgBlob);
        } else {
          await writable.write(pngBlob);
        }
        await writable.close();

        return {
          success: true,
          message: isEn
            ? `Chart saved locally as "${chosenName}"`
            : `Gráfico guardado en local como "${chosenName}"`,
        };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return { success: false, message: '' }; // User closed modal
        }
        console.warn('showSaveFilePicker not completed, using fallback:', err);
      }
    }

    // 2. Fallback: Browser download
    const downloadUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${fileNameBase}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);

    return {
      success: true,
      message: isEn
        ? `Chart downloaded as "${fileNameBase}.png"`
        : `Gráfico descargado como "${fileNameBase}.png"`,
    };
  } catch (err: any) {
    console.error('saveSvgChartLocally error:', err);
    return {
      success: false,
      message: isEn ? `Error saving chart: ${err.message}` : `Error al guardar el gráfico: ${err.message}`,
    };
  }
}

/**
 * Renders SVG Chart 1 (MATLAB Grafica_Inclinaciones.fig / Figures 5.2.57, 5.2.58, 5.2.59):
 * "Evolución de la radiación en función de la inclinación" across 0° to 90°.
 * Supports single component (global, beam, diffuse, albedo) or "Todas" (all 4 components simultaneously).
 */
export function renderInclinationEvolutionSvg(props: InclinationEvolutionChartProps): string {
  const { radiationCurve, allCurves, component, optimalAngle, selectedAngleX, gridEnabled, isEn } = props;

  const width = 820;
  const height = 370;
  const padding = { top: 50, right: 110, bottom: 50, left: 65 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const isAll = component === 'all' && Boolean(allCurves);

  // Build 91 data points for angles 0° to 90°
  const buildPoints = (arr: number[]) => {
    const pts: Array<{ angle: number; rad: number }> = [];
    for (let deg = 0; deg <= 90; deg++) {
      const val = deg === 0 ? arr[0] || 0 : arr[deg] || arr[deg - 1] || 0;
      pts.push({ angle: deg, rad: val });
    }
    return pts;
  };

  const curvePoints = buildPoints(radiationCurve);
  const globalPts = isAll ? buildPoints(allCurves!.global) : curvePoints;
  const beamPts = isAll ? buildPoints(allCurves!.beam) : [];
  const diffusePts = isAll ? buildPoints(allCurves!.diffuse) : [];
  const albedoPts = isAll ? buildPoints(allCurves!.albedo) : [];

  let allRadValues: number[] = [];
  if (isAll) {
    allRadValues = [
      ...globalPts.map((p) => p.rad),
      ...beamPts.map((p) => p.rad),
      ...diffusePts.map((p) => p.rad),
      ...albedoPts.map((p) => p.rad),
    ];
  } else {
    allRadValues = curvePoints.map((p) => p.rad);
  }

  // When representing all components or standard MATLAB, Y starts at 0 (Figure 5.2.59)
  const minRad = 0;
  const maxRad = Math.max(1.0, Math.ceil(Math.max(...allRadValues, 1.0) * 1.20 * 10) / 10);
  const radSpan = Math.max(0.1, maxRad - minRad);

  const xScale = (deg: number) => padding.left + (deg / 90) * plotWidth;
  const yScale = (rad: number) => padding.top + plotHeight - ((rad - minRad) / radSpan) * plotHeight;

  const isDark = themeManager.isDark();
  const plotBg = isDark ? '#08131a' : '#ffffff';
  const axisLabelFill = isDark ? '#cbd5e1' : '#1e293b';
  const axisLineStroke = isDark ? '#475569' : '#94a3b8';
  const gridLineStroke = isDark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const tickTextFill = isDark ? '#94a3b8' : '#334155';
  const titleFill = isDark ? '#f8fafc' : '#0f172a';
  const legendBoxFill = isDark ? 'rgba(15, 23, 42, 0.92)' : '#ffffff';
  const legendBoxStroke = isDark ? 'rgba(255,255,255,0.18)' : '#cbd5e1';
  const legendTextFill = isDark ? '#f8fafc' : '#0f172a';

  // Badge theme styling strictly respecting Light and Dark modes
  const badgeBoxFill = isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.97)';
  const badgeOptStroke = isDark ? '#f59e0b' : '#d97706';
  const badgeOptTextTitle = isDark ? '#fef08a' : '#b45309';
  const badgeOptTextVal = isDark ? '#fef9c3' : '#78350f';

  const badgeXStroke = isDark ? '#a855f7' : '#7c3aed';
  const badgeXTextTitle = isDark ? '#f3e8ff' : '#6d28d9';
  const badgeXTextVal = isDark ? '#faf5ff' : '#4c1d95';

  const badgeBeamStroke = isDark ? '#ef4444' : '#dc2626';
  const badgeBeamText = isDark ? '#fca5a5' : '#991b1b';

  const badgeDiffStroke = isDark ? '#84cc16' : '#65a30d';
  const badgeDiffText = isDark ? '#bef264' : '#365314';

  const badgeAlbStroke = isDark ? '#f59e0b' : '#d97706';
  const badgeAlbText = isDark ? '#fed7aa' : '#92400e';

  // Gridlines
  let gridLinesSvg = '';
  if (gridEnabled) {
    const ySteps = 6;
    for (let i = 0; i <= ySteps; i++) {
      const val = minRad + (radSpan / ySteps) * i;
      const y = yScale(val);
      gridLinesSvg += `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${gridLineStroke}" stroke-dasharray="3,3" />
        <text x="${padding.left - 10}" y="${y + 4}" fill="${tickTextFill}" font-size="11" text-anchor="end" font-family="monospace">${formatNum(val, 1)}</text>
      `;
    }
    for (let deg = 0; deg <= 90; deg += 10) {
      const x = xScale(deg);
      gridLinesSvg += `
        <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="${gridLineStroke}" stroke-dasharray="3,3" />
        <text x="${x}" y="${height - padding.bottom + 18}" fill="${tickTextFill}" font-size="11" text-anchor="middle" font-family="monospace">${deg}°</text>
      `;
    }
  } else {
    const ySteps = 6;
    for (let i = 0; i <= ySteps; i++) {
      const val = minRad + (radSpan / ySteps) * i;
      const y = yScale(val);
      gridLinesSvg += `
        <text x="${padding.left - 10}" y="${y + 4}" fill="${tickTextFill}" font-size="11" text-anchor="end" font-family="monospace">${formatNum(val, 1)}</text>
      `;
    }
    for (let deg = 0; deg <= 90; deg += 15) {
      const x = xScale(deg);
      gridLinesSvg += `
        <text x="${x}" y="${height - padding.bottom + 18}" fill="${tickTextFill}" font-size="11" text-anchor="middle" font-family="monospace">${deg}°</text>
      `;
    }
  }

  const toPathD = (pts: Array<{ angle: number; rad: number }>) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.angle).toFixed(1)} ${yScale(p.rad).toFixed(1)}`).join(' ');

  // Curves paths
  const pathD = toPathD(isAll ? globalPts : curvePoints);
  const pathBeamD = isAll ? toPathD(beamPts) : '';
  const pathDiffuseD = isAll ? toPathD(diffusePts) : '';
  const pathAlbedoD = isAll ? toPathD(albedoPts) : '';

  // Gradient area (only when single component)
  const areaD = `${pathD} L ${xScale(90).toFixed(1)} ${height - padding.bottom} L ${xScale(0).toFixed(1)} ${height - padding.bottom} Z`;

  // Optimal Angle point (on primary / global curve)
  const optPts = isAll ? globalPts : curvePoints;
  const optRad = optPts[optimalAngle]?.rad || 0;
  const optX = xScale(optimalAngle);
  const optY = yScale(optRad);

  const optBeamRad = isAll ? (beamPts[optimalAngle]?.rad || 0) : 0;
  const optBeamY = yScale(optBeamRad);
  const optDiffRad = isAll ? (diffusePts[optimalAngle]?.rad || 0) : 0;
  const optDiffY = yScale(optDiffRad);
  const optAlbRad = isAll ? (albedoPts[optimalAngle]?.rad || 0) : 0;
  const optAlbY = yScale(optAlbRad);

  // Selected Angle X point
  const angleXRad = optPts[selectedAngleX]?.rad || 0;
  const angleXX = xScale(selectedAngleX);
  const angleXY = yScale(angleXRad);

  const angleXBeamRad = isAll ? (beamPts[selectedAngleX]?.rad || 0) : 0;
  const angleXBeamY = yScale(angleXBeamRad);
  const angleXDiffRad = isAll ? (diffusePts[selectedAngleX]?.rad || 0) : 0;
  const angleXDiffY = yScale(angleXDiffRad);
  const angleXAlbRad = isAll ? (albedoPts[selectedAngleX]?.rad || 0) : 0;
  const angleXAlbY = yScale(angleXAlbRad);

  // Layout and collision avoidance for badges
  const isAngleXNearOpt = selectedAngleX !== optimalAngle && Math.abs(selectedAngleX - optimalAngle) <= 12;
  const optBadgeY = Math.max(padding.top + 34, optY - 8);
  const angleXBadgeY = isAngleXNearOpt
    ? (optBadgeY > padding.top + 64 ? optBadgeY - 32 : optBadgeY + 32)
    : Math.max(padding.top + 34, angleXY - 8);

  const optSubOffset = isAngleXNearOpt && selectedAngleX > optimalAngle ? -62 : 8;
  const angleXSubOffset = isAngleXNearOpt && selectedAngleX < optimalAngle ? -62 : 8;

  const chartTitle = isEn
    ? 'Evolution of radiation as a function of inclination'
    : 'Evolución de la radiación en función de la inclinación';

  const xLabel = isEn ? 'Inclination (°)' : 'Inclinación (°)';
  const yLabel = isEn ? 'Radiation (kWh/m²/day)' : 'Radiación (kWh/m²/día)';

  // Build legend matching MATLAB Figure 5.2.59
  let legendSvg = '';
  if (isAll) {
    legendSvg = `
      <g transform="translate(${width - padding.right + 12}, ${padding.top + 8})">
        <rect x="0" y="0" width="88" height="110" rx="4" fill="${legendBoxFill}" stroke="${legendBoxStroke}" />
        <!-- Gdm: Cyan -->
        <line x1="10" y1="20" x2="34" y2="20" stroke="#00b4d8" stroke-width="3" />
        <text x="42" y="24" fill="${legendTextFill}" font-size="12" font-weight="700" font-family="monospace">Gdm</text>
        <!-- Bdm: Red -->
        <line x1="10" y1="45" x2="34" y2="45" stroke="#ef4444" stroke-width="3" />
        <text x="42" y="49" fill="${legendTextFill}" font-size="12" font-weight="700" font-family="monospace">Bdm</text>
        <!-- Ddm: Lime Green -->
        <line x1="10" y1="70" x2="34" y2="70" stroke="#84cc16" stroke-width="3" />
        <text x="42" y="74" fill="${legendTextFill}" font-size="12" font-weight="700" font-family="monospace">Ddm</text>
        <!-- Rdm: Orange -->
        <line x1="10" y1="95" x2="34" y2="95" stroke="#f59e0b" stroke-width="3" />
        <text x="42" y="99" fill="${legendTextFill}" font-size="12" font-weight="700" font-family="monospace">Rdm</text>
      </g>
    `;
  } else {
    const compSymbol =
      component === 'global' ? 'Gdm' : component === 'beam' ? 'Bdm' : component === 'diffuse' ? 'Ddm' : 'Rdm';
    const compColor =
      component === 'global' ? '#00b4d8' : component === 'beam' ? '#ef4444' : component === 'diffuse' ? '#84cc16' : '#f59e0b';
    legendSvg = `
      <g transform="translate(${width - padding.right + 12}, ${padding.top + 10})">
        <rect x="0" y="0" width="84" height="32" rx="4" fill="${legendBoxFill}" stroke="${legendBoxStroke}" />
        <line x1="10" y1="16" x2="32" y2="16" stroke="${compColor}" stroke-width="3" />
        <text x="40" y="20" fill="${legendTextFill}" font-size="12" font-weight="700" font-family="monospace">${compSymbol}</text>
      </g>
    `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" class="opt-svg-chart" id="svg-inclination-evolution" width="100%" height="auto" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="grad-curve-fill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#00b4d8" stop-opacity="0.30" />
          <stop offset="100%" stop-color="#0284c7" stop-opacity="0.02" />
        </linearGradient>
        <filter id="glow-opt" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#f59e0b" flood-opacity="0.8" />
        </filter>
        <filter id="glow-anglex" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#a855f7" flood-opacity="0.8" />
        </filter>
        <filter id="badge-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="${isDark ? '#000000' : '#475569'}" flood-opacity="${isDark ? '0.6' : '0.12'}" />
        </filter>
      </defs>

      <!-- Chart Title with safe wrapping & baseline -->
      ${renderWrappedSvgTitle({
        text: chartTitle,
        centerX: width / 2,
        startY: 28,
        fill: titleFill,
        fontSize: 15,
        fontWeight: 700,
        maxCharsPerLine: 54,
      })}

      <!-- Plot Background -->
      <rect x="${padding.left}" y="${padding.top}" width="${plotWidth}" height="${plotHeight}" fill="${plotBg}" rx="4" stroke="${axisLineStroke}" stroke-width="0.8" />

      <!-- Grid and Axes -->
      ${gridLinesSvg}

      <!-- Main Axis Lines -->
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="${axisLineStroke}" stroke-width="1.5" />
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="${axisLineStroke}" stroke-width="1.5" />

      <!-- Axis Labels -->
      <text x="${padding.left + plotWidth / 2}" y="${height - 12}" fill="${axisLabelFill}" font-size="13" font-weight="600" text-anchor="middle">
        ${xLabel}
      </text>
      <text transform="rotate(-90)" x="${-height / 2}" y="20" fill="${axisLabelFill}" font-size="13" font-weight="600" text-anchor="middle">
        ${yLabel}
      </text>

      ${!isAll ? `<path d="${areaD}" fill="url(#grad-curve-fill)" />` : ''}

      ${
        isAll
          ? `
        <!-- Four Radiation Curves (Figure 5.2.59) -->
        <!-- 1. Global (Gdm: Cyan) -->
        <path d="${pathD}" fill="none" stroke="#00b4d8" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
        <!-- 2. Beam (Bdm: Red) -->
        <path d="${pathBeamD}" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <!-- 3. Diffuse (Ddm: Lime Green) -->
        <path d="${pathDiffuseD}" fill="none" stroke="#84cc16" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <!-- 4. Albedo (Rdm: Orange) -->
        <path d="${pathAlbedoD}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      `
          : `
        <path d="${pathD}" fill="none" stroke="${component === 'beam' ? '#ef4444' : component === 'diffuse' ? '#84cc16' : component === 'albedo' ? '#f59e0b' : '#00b4d8'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      `
      }

      <!-- Optimal Angle Indicator (Markers on all curves when Todas is selected) -->
      <line
        x1="${optX}"
        y1="${isAll ? Math.min(optY, optBeamY, optDiffY, optAlbY) : optY}"
        x2="${optX}"
        y2="${height - padding.bottom}"
        stroke="#f59e0b"
        stroke-width="1.5"
        stroke-dasharray="4,3"
      />

      <!-- Global Curve Intersection (Gdm) -->
      <circle cx="${optX}" cy="${optY}" r="6.5" fill="#00b4d8" stroke="#ffffff" stroke-width="2" filter="url(#glow-opt)" />
      <g transform="translate(${optX}, ${optBadgeY})">
        <rect x="-38" y="-30" width="76" height="28" rx="4" fill="${badgeBoxFill}" stroke="${badgeOptStroke}" stroke-width="1.2" filter="url(#badge-shadow)" />
        <text x="0" y="-17" fill="${badgeOptTextTitle}" font-size="10.5" font-weight="700" text-anchor="middle" font-family="monospace">
          ${isEn ? 'Opt' : 'Ópt'}: ${optimalAngle}°
        </text>
        <text x="0" y="-5" fill="${badgeOptTextVal}" font-size="10" font-weight="700" text-anchor="middle" font-family="monospace">
          (${formatNum(optRad, 2)})
        </text>
      </g>

      ${
        isAll
          ? `
        <!-- Beam Curve Intersection (Bdm: Red) -->
        <circle cx="${optX}" cy="${optBeamY}" r="5.5" fill="#ef4444" stroke="#ffffff" stroke-width="1.8" />
        <g transform="translate(${optX + optSubOffset}, ${optBeamY + 3})">
          <rect x="0" y="-10" width="54" height="16" rx="3" fill="${badgeBoxFill}" stroke="${badgeBeamStroke}" stroke-width="0.9" filter="url(#badge-shadow)" />
          <text x="27" y="2" fill="${badgeBeamText}" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">B: ${formatNum(optBeamRad, 2)}</text>
        </g>

        <!-- Diffuse Curve Intersection (Ddm: Lime Green) -->
        <circle cx="${optX}" cy="${optDiffY}" r="5.5" fill="#84cc16" stroke="#ffffff" stroke-width="1.8" />
        <g transform="translate(${optX + optSubOffset}, ${optDiffY + 3})">
          <rect x="0" y="-10" width="54" height="16" rx="3" fill="${badgeBoxFill}" stroke="${badgeDiffStroke}" stroke-width="0.9" filter="url(#badge-shadow)" />
          <text x="27" y="2" fill="${badgeDiffText}" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">D: ${formatNum(optDiffRad, 2)}</text>
        </g>

        <!-- Albedo Curve Intersection (Rdm: Orange) -->
        <circle cx="${optX}" cy="${optAlbY}" r="5.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.8" />
        <g transform="translate(${optX + optSubOffset}, ${optAlbY + 3})">
          <rect x="0" y="-10" width="54" height="16" rx="3" fill="${badgeBoxFill}" stroke="${badgeAlbStroke}" stroke-width="0.9" filter="url(#badge-shadow)" />
          <text x="27" y="2" fill="${badgeAlbText}" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">R: ${formatNum(optAlbRad, 2)}</text>
        </g>
      `
          : ''
      }

      <!-- Selected Angle X Indicator (Markers on all curves) -->
      ${
        selectedAngleX !== optimalAngle
          ? `
        <line
          x1="${angleXX}"
          y1="${isAll ? Math.min(angleXY, angleXBeamY, angleXDiffY, angleXAlbY) : angleXY}"
          x2="${angleXX}"
          y2="${height - padding.bottom}"
          stroke="#a855f7"
          stroke-width="1.5"
          stroke-dasharray="4,3"
        />

        <!-- Global Intersection at Angle X -->
        <circle cx="${angleXX}" cy="${angleXY}" r="6" fill="#c084fc" stroke="#ffffff" stroke-width="2" filter="url(#glow-anglex)" />
        <g transform="translate(${angleXX}, ${angleXBadgeY})">
          <rect x="-38" y="-30" width="76" height="28" rx="4" fill="${badgeBoxFill}" stroke="${badgeXStroke}" stroke-width="1.2" filter="url(#badge-shadow)" />
          <text x="0" y="-17" fill="${badgeXTextTitle}" font-size="10.5" font-weight="700" text-anchor="middle" font-family="monospace">
            X: ${selectedAngleX}°
          </text>
          <text x="0" y="-5" fill="${badgeXTextVal}" font-size="10" font-weight="700" text-anchor="middle" font-family="monospace">
            (${formatNum(angleXRad, 2)})
          </text>
        </g>

        ${
          isAll
            ? `
          <!-- Beam Intersection at Angle X -->
          <circle cx="${angleXX}" cy="${angleXBeamY}" r="5" fill="#ef4444" stroke="#c084fc" stroke-width="1.8" />
          <g transform="translate(${angleXX + angleXSubOffset}, ${angleXBeamY + 3})">
            <rect x="0" y="-10" width="54" height="16" rx="3" fill="${badgeBoxFill}" stroke="${badgeXStroke}" stroke-width="0.9" filter="url(#badge-shadow)" />
            <text x="27" y="2" fill="${badgeBeamText}" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">B: ${formatNum(angleXBeamRad, 2)}</text>
          </g>

          <!-- Diffuse Intersection at Angle X -->
          <circle cx="${angleXX}" cy="${angleXDiffY}" r="5" fill="#84cc16" stroke="#c084fc" stroke-width="1.8" />
          <g transform="translate(${angleXX + angleXSubOffset}, ${angleXDiffY + 3})">
            <rect x="0" y="-10" width="54" height="16" rx="3" fill="${badgeBoxFill}" stroke="${badgeXStroke}" stroke-width="0.9" filter="url(#badge-shadow)" />
            <text x="27" y="2" fill="${badgeDiffText}" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">D: ${formatNum(angleXDiffRad, 2)}</text>
          </g>

          <!-- Albedo Intersection at Angle X -->
          <circle cx="${angleXX}" cy="${angleXAlbY}" r="5" fill="#f59e0b" stroke="#c084fc" stroke-width="1.8" />
          <g transform="translate(${angleXX + angleXSubOffset}, ${angleXAlbY + 3})">
            <rect x="0" y="-10" width="54" height="16" rx="3" fill="${badgeBoxFill}" stroke="${badgeXStroke}" stroke-width="0.9" filter="url(#badge-shadow)" />
            <text x="27" y="2" fill="${badgeAlbText}" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">R: ${formatNum(angleXAlbRad, 2)}</text>
          </g>
        `
            : ''
        }
      `
          : ''
      }

      <!-- Legend in Right Margin (Figures 5.2.57 & 5.2.59) -->
      ${legendSvg}
    </svg>
  `;
}

/**
 * Renders SVG Chart 2 (MATLAB Grafica_OptAnual.fig / 5th image):
 * Top Chart: Monthly Radiation: Optimal vs 0° vs Angle X.
 * Bottom Chart: Monthly Gains Bar Chart (%).
 */
export function renderMonthlyOptimumAndGainsSvg(props: MonthlyOptimumChartProps): string {
  const {
    rad0,
    radOpt,
    radX,
    gainsPct,
    allMonthlyData,
    component,
    optimalAngle,
    selectedAngleX,
    gridEnabled,
    isEn,
  } = props;
  const months = isEn ? MONTHS_SHORT_EN : MONTHS_SHORT_ES;

  const width = 820;
  const height = 480;
  const padding = { top: 40, right: 40, bottom: 40, left: 65 };

  // Two subplots: top (radiations, h=200), bottom (gains, h=160)
  const topH = 190;
  const bottomH = 150;
  const gap = 50;

  const plotW = width - padding.left - padding.right;
  const topY0 = padding.top;
  const topY1 = topY0 + topH;
  const bottomY0 = topY1 + gap;
  const bottomY1 = bottomY0 + bottomH;

  const isAll = component === 'all' && Boolean(allMonthlyData);

  // 1. Scales for Top Plot (Radiation)
  const allRadVals = isAll
    ? [
        ...allMonthlyData!.global.radOpt,
        ...allMonthlyData!.beam.radOpt,
        ...allMonthlyData!.diffuse.radOpt,
        ...allMonthlyData!.albedo.radOpt,
      ]
    : [...rad0, ...radOpt, ...radX];

  const isDark = themeManager.isDark();
  const plotBg = isDark ? '#08131a' : '#ffffff';
  const title1Fill = isDark ? '#f8fafc' : '#0f172a';
  const title2Fill = isDark ? '#f8fafc' : '#0f172a';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
  const tickFill = isDark ? '#94a3b8' : '#334155';
  const axisLineStroke = isDark ? '#475569' : '#94a3b8';
  const legendBoxFill = isDark ? 'rgba(15, 23, 42, 0.92)' : '#ffffff';
  const legendBoxStroke = isDark ? 'rgba(255,255,255,0.15)' : '#cbd5e1';

  const maxRad = Math.ceil(Math.max(...allRadVals, 1.0) * 1.15 * 10) / 10;
  const yTopScale = (v: number) => topY1 - (v / maxRad) * topH;
  const xMonthScale = (idx: number) => padding.left + (idx + 0.5) * (plotW / 12);

  // Top Plot Grid
  let topGrid = '';
  if (gridEnabled) {
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxRad / ticks) * i;
      const y = yTopScale(v);
      topGrid += `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${gridStroke}" stroke-dasharray="3,3" />
        <text x="${padding.left - 10}" y="${y + 4}" fill="${tickFill}" font-size="10" text-anchor="end" font-family="monospace">${formatNum(v, 1)}</text>
      `;
    }
  } else {
    for (let i = 0; i <= 4; i++) {
      const v = (maxRad / 4) * i;
      const y = yTopScale(v);
      topGrid += `<text x="${padding.left - 10}" y="${y + 4}" fill="${tickFill}" font-size="10" text-anchor="end" font-family="monospace">${formatNum(v, 1)}</text>`;
    }
  }

  // Top Curves
  const toMonthLine = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xMonthScale(i).toFixed(1)} ${yTopScale(v).toFixed(1)}`).join(' ');

  const optLine = toMonthLine(radOpt);
  const horizLine = toMonthLine(rad0);
  const xLine = toMonthLine(radX);

  const globalOptLine = isAll ? toMonthLine(allMonthlyData!.global.radOpt) : '';
  const beamOptLine = isAll ? toMonthLine(allMonthlyData!.beam.radOpt) : '';
  const diffOptLine = isAll ? toMonthLine(allMonthlyData!.diffuse.radOpt) : '';
  const albOptLine = isAll ? toMonthLine(allMonthlyData!.albedo.radOpt) : '';

  // 2. Scales for Bottom Plot (Gains %)
  const activeGains = isAll ? allMonthlyData!.global.gainsPct : gainsPct;
  const minGain = Math.floor(Math.min(...activeGains, 0) / 10) * 10;
  const maxGain = Math.ceil(Math.max(...activeGains, 10) / 10) * 10;
  const gainSpan = Math.max(10, maxGain - minGain);
  const yGainScale = (pct: number) => bottomY1 - ((pct - minGain) / gainSpan) * bottomH;
  const zeroY = yGainScale(0);

  // Bottom Plot Bars
  const colW = plotW / 12;
  const barW = colW * 0.45;

  const gainBars = activeGains
    .map((pct: number, idx: number) => {
      const cx = xMonthScale(idx);
      const bx = cx - barW / 2;
      const by = Math.min(yGainScale(pct), zeroY);
      const bh = Math.max(2, Math.abs(yGainScale(pct) - zeroY));
      const color = pct >= 0 ? '#10b981' : '#f87171';

      return `
        <rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${color}" fill-opacity="0.85" stroke="${color}" stroke-width="1">
          <title>${months[idx]}: ${pct >= 0 ? '+' : ''}${formatNum(pct, 2)}%</title>
        </rect>
        <text x="${cx}" y="${pct >= 0 ? by - 4 : by + bh + 12}" fill="${color}" font-size="10" font-weight="700" text-anchor="middle" font-family="monospace">
          ${pct >= 0 ? '+' : ''}${Math.round(pct)}%
        </text>
      `;
    })
    .join('');

  // Bottom Grid and Month Labels
  let bottomGrid = `
    <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" stroke="${axisLineStroke}" stroke-width="1.5" />
  `;

  months.forEach((m, idx) => {
    const cx = xMonthScale(idx);
    bottomGrid += `
      <text x="${cx}" y="${bottomY1 + 18}" fill="${tickFill}" font-size="11" text-anchor="middle" font-weight="600">${m}</text>
    `;
  });

  const compLabel = isAll
    ? (isEn ? 'All Components' : 'Todas las componentes')
    : component === 'global'
    ? 'Global'
    : component === 'beam'
    ? 'Directa'
    : component === 'diffuse'
    ? 'Difusa'
    : 'Albedo';

  const title1 = isEn
    ? `Monthly ${compLabel} Radiation (kWh/m²/day) at Optimal Tilt (${optimalAngle}°)`
    : `Radiación mensual ${compLabel.toLowerCase()} (kWh/m²/día) en inclinación óptima (${optimalAngle}°)`;

  const title2 = isEn
    ? `Radiation Gains (%) vs Horizontal (0°)`
    : `Ganancias de radiación (%) s/ Horizontal (0°)`;

  return `
    <svg viewBox="0 0 ${width} ${height}" class="opt-svg-chart" width="100%" height="auto" preserveAspectRatio="xMidYMid meet">
      <!-- SUBPLOT 1: Monthly Radiations with safe wrapping & baseline -->
      ${renderWrappedSvgTitle({
        text: title1,
        centerX: width / 2,
        startY: 25,
        fill: title1Fill,
        fontSize: 14.5,
        fontWeight: 700,
        maxCharsPerLine: 56,
      })}

      <!-- Subplot 1 Background -->
      <rect x="${padding.left}" y="${topY0}" width="${plotW}" height="${topH}" fill="${plotBg}" rx="4" stroke="${axisLineStroke}" stroke-width="0.8" />

      ${topGrid}
      <line x1="${padding.left}" y1="${topY1}" x2="${width - padding.right}" y2="${topY1}" stroke="${axisLineStroke}" stroke-width="1.2" />
      <line x1="${padding.left}" y1="${topY0}" x2="${padding.left}" y2="${topY1}" stroke="${axisLineStroke}" stroke-width="1.2" />

      ${
        isAll
          ? `
        <!-- Four Monthly Curves at Optimal Tilt -->
        <path d="${globalOptLine}" fill="none" stroke="#00b4d8" stroke-width="2.8" stroke-linecap="round" />
        ${allMonthlyData!.global.radOpt.map((v: number, i: number) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="4.5" fill="#00b4d8" stroke="#ffffff" stroke-width="1.5" />`).join('')}

        <path d="${beamOptLine}" fill="none" stroke="#ef4444" stroke-width="2.4" stroke-linecap="round" />
        ${allMonthlyData!.beam.radOpt.map((v: number, i: number) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="4" fill="#ef4444" stroke="#ffffff" stroke-width="1.2" />`).join('')}

        <path d="${diffOptLine}" fill="none" stroke="#84cc16" stroke-width="2.4" stroke-linecap="round" />
        ${allMonthlyData!.diffuse.radOpt.map((v: number, i: number) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="4" fill="#84cc16" stroke="#ffffff" stroke-width="1.2" />`).join('')}

        <path d="${albOptLine}" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linecap="round" />
        ${allMonthlyData!.albedo.radOpt.map((v: number, i: number) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="4" fill="#f59e0b" stroke="#ffffff" stroke-width="1.2" />`).join('')}

        <!-- Top Legend: Todas (4 components) -->
        <g transform="translate(${width - padding.right - 280}, ${topY0 + 6})">
          <rect x="0" y="0" width="275" height="26" rx="4" fill="${legendBoxFill}" stroke="${legendBoxStroke}" />
          <circle cx="12" cy="13" r="4" fill="#00b4d8" />
          <text x="20" y="17" fill="#0284c7" font-size="11" font-weight="700">Gdm</text>
          
          <circle cx="75" cy="13" r="4" fill="#ef4444" />
          <text x="83" y="17" fill="#dc2626" font-size="11" font-weight="700">Bdm</text>

          <circle cx="138" cy="13" r="4" fill="#84cc16" />
          <text x="146" y="17" fill="#65a30d" font-size="11" font-weight="700">Ddm</text>

          <circle cx="202" cy="13" r="4" fill="#f59e0b" />
          <text x="210" y="17" fill="#d97706" font-size="11" font-weight="700">Rdm</text>
        </g>
      `
          : `
        <!-- Single Component: Opt vs 0° vs X -->
        <path d="${horizLine}" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-dasharray="4,3" />
        ${rad0.map((v, i) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="3.5" fill="#0ea5e9" />`).join('')}

        ${
          selectedAngleX !== optimalAngle
            ? `
          <path d="${xLine}" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" />
          ${radX.map((v, i) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="3" fill="#a855f7" />`).join('')}
        `
            : ''
        }

        <path d="${optLine}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
        ${radOpt.map((v, i) => `<circle cx="${xMonthScale(i)}" cy="${yTopScale(v)}" r="4.5" fill="#fbbf24" stroke="#ffffff" stroke-width="1.5" />`).join('')}

        <!-- Top Legend -->
        <g transform="translate(${width - padding.right - 260}, ${topY0 + 6})">
          <rect x="0" y="0" width="250" height="26" rx="4" fill="${legendBoxFill}" stroke="${legendBoxStroke}" />
          <circle cx="12" cy="13" r="4" fill="#fbbf24" />
          <text x="20" y="17" fill="#d97706" font-size="11" font-weight="700">${isEn ? 'Opt' : 'Ópt'}. (${optimalAngle}°)</text>
          
          <circle cx="95" cy="13" r="4" fill="#0ea5e9" />
          <text x="103" y="17" fill="#0284c7" font-size="11" font-weight="600">0° (Horiz)</text>

          ${
            selectedAngleX !== optimalAngle
              ? `
            <circle cx="178" cy="13" r="4" fill="#a855f7" />
            <text x="186" y="17" fill="#9333ea" font-size="11" font-weight="600">X (${selectedAngleX}°)</text>
          `
              : ''
          }
        </g>
      `
      }

      <!-- SUBPLOT 2: Gains Bar Chart (%) with safe wrapping & baseline -->
      ${renderWrappedSvgTitle({
        text: title2,
        centerX: width / 2,
        startY: bottomY0 - 15,
        fill: title2Fill,
        fontSize: 13.5,
        fontWeight: 700,
        maxCharsPerLine: 56,
      })}

      <!-- Subplot 2 Background -->
      <rect x="${padding.left}" y="${bottomY0}" width="${plotW}" height="${bottomH}" fill="${plotBg}" rx="4" stroke="${axisLineStroke}" stroke-width="0.8" />

      ${bottomGrid}
      ${gainBars}
    </svg>
  `;
}
