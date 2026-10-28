import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import {
  getMonthlyRadiationForAngle,
  type TableRadiationComponent,
} from '@/components/climate/OptimalAnnualStudyPanel';
import { themeManager } from '@/services/theme/themeManager';
import { renderWrappedSvgTitle, computeSvgTitleLayout } from './chartSvgUtils';
import { showAlbedoWarningModal } from '@/components/modals/AlbedoWarningModal';

export type SeasonalGraphComponentChoice = 'global' | 'beam' | 'diffuse' | 'albedo' | 'all';

interface OptimalSeasonalGraphsProps {
  simulationResult: SolarBridgeSimulationResult;
  locationName: string;
  latitude: number;
  initialComponent?: SeasonalGraphComponentChoice;
  onBack?: () => void;
  onExit?: () => void;
}

const MONTH_NAMES_SHORT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export function renderOptimalSeasonalGraphsWindow(props: OptimalSeasonalGraphsProps): HTMLElement {
  const { simulationResult: res, locationName, latitude, onBack, onExit } = props;
  const container = document.createElement('div');
  container.className = 'opt-matlab-graphs-window';
  container.id = 'opt-seasonal-graphs-window';

  let selectedComponent: SeasonalGraphComponentChoice = props.initialComponent || 'global';
  let gridTopEnabled: boolean = true;
  let gridBottomEnabled: boolean = false;

  const winterDeg = res.seasonal.winterTiltDeg;
  const springDeg = res.seasonal.springTiltDeg;
  const summerDeg = res.seasonal.summerTiltDeg;
  const autumnDeg = res.seasonal.autumnTiltDeg;
  const optTiltAnnual = res.optimalAnnual?.optimalTiltDeg ?? 30;

  // Calculates 12-month array at respective seasonal angles:
  // Dec (11), Jan (0), Feb (1) -> winter
  // Mar (2), Apr (3), May (4) -> spring
  // Jun (5), Jul (6), Aug (7) -> summer
  // Sep (8), Oct (9), Nov (10) -> autumn
  function getSeasonalVector(comp: TableRadiationComponent): number[] {
    const vals: number[] = new Array(12).fill(0);
    for (let m = 0; m < 12; m++) {
      let deg = winterDeg;
      if (m === 2 || m === 3 || m === 4) deg = springDeg;
      else if (m === 5 || m === 6 || m === 7) deg = summerDeg;
      else if (m === 8 || m === 9 || m === 10) deg = autumnDeg;
      vals[m] = getMonthlyRadiationForAngle(res, comp, deg)[m];
    }
    return vals;
  }

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const isAll = selectedComponent === 'all';
    const isAlbedo = selectedComponent === 'albedo';

    const compKey = isAll ? 'global' : (selectedComponent as TableRadiationComponent);
    const rad0 = getMonthlyRadiationForAngle(res, compKey, 0);
    const radOptAnu = getMonthlyRadiationForAngle(res, compKey, optTiltAnnual);
    const radSeas = getSeasonalVector(compKey);

    const allData = {
      global: {
        rad0: getMonthlyRadiationForAngle(res, 'global', 0),
        radOptAnu: getMonthlyRadiationForAngle(res, 'global', optTiltAnnual),
        radSeas: getSeasonalVector('global'),
      },
      beam: {
        rad0: getMonthlyRadiationForAngle(res, 'beam', 0),
        radOptAnu: getMonthlyRadiationForAngle(res, 'beam', optTiltAnnual),
        radSeas: getSeasonalVector('beam'),
      },
      diffuse: {
        rad0: getMonthlyRadiationForAngle(res, 'diffuse', 0),
        radOptAnu: getMonthlyRadiationForAngle(res, 'diffuse', optTiltAnnual),
        radSeas: getSeasonalVector('diffuse'),
      },
      albedo: {
        rad0: getMonthlyRadiationForAngle(res, 'albedo', 0),
        radOptAnu: getMonthlyRadiationForAngle(res, 'albedo', optTiltAnnual),
        radSeas: getSeasonalVector('albedo'),
      },
    };

    const calcGainsPct = (seasArr: number[], baseArr: number[]) =>
      seasArr.map((seas, i) => (baseArr[i] > 0 ? ((seas - baseArr[i]) / baseArr[i]) * 100 : 0));

    // Gains vs 0° and vs Annual optimal tilt
    const gainsVs0 = isAlbedo ? new Array(12).fill(0) : calcGainsPct(radSeas, rad0);
    const gainsVsAnu = isAlbedo && optTiltAnnual === 0 ? new Array(12).fill(0) : calcGainsPct(radSeas, radOptAnu);

    const allGainsVs0 = {
      global: calcGainsPct(allData.global.radSeas, allData.global.rad0),
      beam: calcGainsPct(allData.beam.radSeas, allData.beam.rad0),
      diffuse: calcGainsPct(allData.diffuse.radSeas, allData.diffuse.rad0),
      albedo: new Array(12).fill(0),
    };

    const allGainsVsAnu = {
      global: calcGainsPct(allData.global.radSeas, allData.global.radOptAnu),
      beam: calcGainsPct(allData.beam.radSeas, allData.beam.radOptAnu),
      diffuse: calcGainsPct(allData.diffuse.radSeas, allData.diffuse.radOptAnu),
      albedo: calcGainsPct(allData.albedo.radSeas, allData.albedo.radOptAnu),
    };

    const minVal = (arr: number[]) => (arr.length ? Math.min(...arr) : 0);
    const meanVal = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const maxVal = (arr: number[]) => (arr.length ? Math.max(...arr) : 0);

    const compName =
      selectedComponent === 'global'
        ? (isEn ? 'global' : 'global')
        : selectedComponent === 'beam'
        ? (isEn ? 'direct' : 'directa')
        : selectedComponent === 'diffuse'
        ? (isEn ? 'diffuse' : 'difusa')
        : selectedComponent === 'albedo'
        ? (isEn ? 'albedo' : 'de albedo')
        : '';

    const topPlotTitle = isAll
      ? (isEn ? 'All radiation components' : 'Todas las componentes de la radiación')
      : isEn
      ? `${compName.charAt(0).toUpperCase() + compName.slice(1)} radiation (kWh/m²/day)`
      : `Radiación ${compName} (kWh/m²/día)`;

    const bottomPlotTitle = isAll
      ? (isEn ? 'Gains of all components vs horizontal plane (0°) for seasonal optimal tilt' : 'Ganancias de todas las componentes respecto al plano horizontal (0°) para la inclinación óptima estacional')
      : isEn
      ? `Gains of ${compName} radiation vs horizontal plane (0°) for seasonal optimal tilt`
      : `Ganancias de radiación ${compName} respecto al plano horizontal (0°) para la inclinación óptima estacional`;

    const isDark = themeManager.isDark();
    const plotBg = isDark ? '#0b171f' : '#ffffff';
    const plotBorder = isDark ? 'rgba(255,255,255,0.3)' : '#94a3b8';
    const titleColor = isDark ? '#f8fafc' : '#0f172a';
    const labelColor = isDark ? '#cbd5e1' : '#1e293b';
    const tickColor = isDark ? '#94a3b8' : '#334155';
    const gridStroke = isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
    const zeroLineStroke = isDark ? '#ffffff' : '#0f172a';
    const legendBg = isDark ? 'rgba(15, 23, 42, 0.92)' : '#ffffff';
    const legendBorder = isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1';
    const legendText = isDark ? '#f8fafc' : '#0f172a';

    // -------------------------------------------------------------
    // Seasonal Shading Helpers (Matching Table Colors from Imagen 1)
    // -------------------------------------------------------------
    // Winter: Dec, Jan, Feb -> Blue/Cyan
    // Spring: Mar, Apr, May -> Green
    // Summer: Jun, Jul, Aug -> Amber/Yellow
    // Autumn: Sep, Oct, Nov -> Brown/Rust
    const seasonBands = (innerWVal: number, padLeft: number, padTop: number, innerHVal: number) => {
      const slotW = innerWVal / 12;
      return `
        <!-- Invierno (Ene, Feb) -->
        <rect x="${padLeft}" y="${padTop}" width="${slotW * 2}" height="${innerHVal}" fill="rgba(2, 132, 199, 0.10)" />
        <text x="${padLeft + slotW}" y="${padTop + 12}" fill="rgba(56, 189, 248, 0.7)" font-size="9" text-anchor="middle" font-weight="700">INV</text>
        
        <!-- Primavera (Mar, Abr, May) -->
        <rect x="${padLeft + slotW * 2}" y="${padTop}" width="${slotW * 3}" height="${innerHVal}" fill="rgba(22, 163, 74, 0.10)" />
        <text x="${padLeft + slotW * 3.5}" y="${padTop + 12}" fill="rgba(74, 222, 128, 0.7)" font-size="9" text-anchor="middle" font-weight="700">PRIM</text>
        
        <!-- Verano (Jun, Jul, Ago) -->
        <rect x="${padLeft + slotW * 5}" y="${padTop}" width="${slotW * 3}" height="${innerHVal}" fill="rgba(217, 119, 6, 0.10)" />
        <text x="${padLeft + slotW * 6.5}" y="${padTop + 12}" fill="rgba(250, 204, 21, 0.7)" font-size="9" text-anchor="middle" font-weight="700">VER</text>
        
        <!-- Otoño (Sep, Oct, Nov) -->
        <rect x="${padLeft + slotW * 8}" y="${padTop}" width="${slotW * 3}" height="${innerHVal}" fill="rgba(154, 52, 18, 0.10)" />
        <text x="${padLeft + slotW * 9.5}" y="${padTop + 12}" fill="rgba(251, 146, 60, 0.7)" font-size="9" text-anchor="middle" font-weight="700">OTO</text>
        
        <!-- Invierno (Dic) -->
        <rect x="${padLeft + slotW * 11}" y="${padTop}" width="${slotW}" height="${innerHVal}" fill="rgba(2, 132, 199, 0.10)" />
        <text x="${padLeft + slotW * 11.5}" y="${padTop + 12}" fill="rgba(56, 189, 248, 0.7)" font-size="9" text-anchor="middle" font-weight="700">INV</text>
      `;
    };

    // -------------------------------------------------------------
    // SVG 1: Top Plot (Line Chart of Radiation vs Months)
    // -------------------------------------------------------------
    const topTitleLayout = computeSvgTitleLayout(topPlotTitle, {
      basePadTop: 34,
      basePlotH: 200,
      maxCharsPerLine: 44,
      fontSize: 12,
      lineHeight: 15,
      topMargin: 16,
      gapBelowTitle: 10,
    });
    const plotW = 540;
    const plotH = topTitleLayout.plotH;
    const pad = { top: topTitleLayout.padTop, right: 90, bottom: 35, left: 45 };
    const innerW = plotW - pad.left - pad.right;
    const innerH = 200 - 34 - 35;

    const maxRadiationY = isAll ? 8 : Math.ceil(Math.max(...radSeas, ...rad0, 1.0) * 1.15);
    const yTop = (v: number) => pad.top + innerH - (Math.min(v, maxRadiationY) / maxRadiationY) * innerH;
    const xMonth = (idx: number) => pad.left + (idx + 0.5) * (innerW / 12);

    let gridLinesTop = '';
    const yTicksCount = maxRadiationY <= 6 ? maxRadiationY : 4;
    for (let i = 0; i <= yTicksCount; i++) {
      const v = (maxRadiationY / yTicksCount) * i;
      const y = yTop(v);
      if (gridTopEnabled) {
        gridLinesTop += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + innerW}" y2="${y}" stroke="${gridStroke}" stroke-dasharray="2,3" />`;
      }
      gridLinesTop += `<text x="${pad.left - 6}" y="${y + 4}" fill="${tickColor}" font-size="10" text-anchor="end" font-family="monospace">${Math.round(v)}</text>`;
    }

    if (gridTopEnabled) {
      for (let i = 0; i < 12; i++) {
        const x = xMonth(i);
        gridLinesTop += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${pad.top + innerH}" stroke="${gridStroke}" stroke-dasharray="2,3" />`;
      }
    }

    const makeLineD = (arr: number[]) =>
      arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xMonth(i).toFixed(1)} ${yTop(v).toFixed(1)}`).join(' ');

    let topSeriesHtml = '';
    let topLegendHtml = '';

    if (!isAll) {
      const colorSeas =
        selectedComponent === 'beam'
          ? '#ef4444'
          : selectedComponent === 'diffuse'
          ? '#84cc16'
          : selectedComponent === 'albedo'
          ? '#f59e0b'
          : '#38bdf8';

      const colorZero =
        selectedComponent === 'beam'
          ? '#f87171'
          : selectedComponent === 'diffuse'
          ? '#15803d'
          : selectedComponent === 'albedo'
          ? '#92400e'
          : '#0369a1';

      topSeriesHtml = `
        <path d="${makeLineD(radSeas)}" fill="none" stroke="${colorSeas}" stroke-width="2.8" stroke-linecap="round" />
        <path d="${makeLineD(rad0)}" fill="none" stroke="${colorZero}" stroke-width="2.8" stroke-linecap="round" />
      `;

      topLegendHtml = `
        <g transform="translate(${pad.left + innerW + 10}, ${pad.top + 5})">
          <rect x="0" y="0" width="76" height="42" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <line x1="8" y1="14" x2="26" y2="14" stroke="${colorSeas}" stroke-width="2.5" />
          <text x="32" y="17" fill="${legendText}" font-size="10.5" font-weight="600">${isEn ? 'Opt. seas.' : 'Ópt. est.'}</text>
          <line x1="8" y1="30" x2="26" y2="30" stroke="${colorZero}" stroke-width="2.5" />
          <text x="32" y="33" fill="${legendText}" font-size="10.5" font-weight="600">0°</text>
        </g>
      `;
    } else {
      topSeriesHtml = `
        <path d="${makeLineD(allData.global.radSeas)}" fill="none" stroke="#38bdf8" stroke-width="2.4" />
        <path d="${makeLineD(allData.global.rad0)}" fill="none" stroke="#0284c7" stroke-width="2.4" />
        <path d="${makeLineD(allData.beam.radSeas)}" fill="none" stroke="#ef4444" stroke-width="2.4" />
        <path d="${makeLineD(allData.beam.rad0)}" fill="none" stroke="#b91c1c" stroke-width="2.4" />
        <path d="${makeLineD(allData.diffuse.radSeas)}" fill="none" stroke="#84cc16" stroke-width="2.4" />
        <path d="${makeLineD(allData.diffuse.rad0)}" fill="none" stroke="#15803d" stroke-width="2.4" />
        <path d="${makeLineD(allData.albedo.radSeas)}" fill="none" stroke="#f59e0b" stroke-width="2.4" />
        <path d="${makeLineD(allData.albedo.rad0)}" fill="none" stroke="#92400e" stroke-width="2.4" />
      `;

      topLegendHtml = `
        <g transform="translate(${pad.left + innerW + 8}, ${pad.top - 12})">
          <rect x="0" y="0" width="80" height="152" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <line x1="6" y1="14" x2="22" y2="14" stroke="#38bdf8" stroke-width="2.5" />
          <text x="26" y="17" fill="${legendText}" font-size="9.5" font-weight="600">Gdm(ópt)</text>
          <line x1="6" y1="32" x2="22" y2="32" stroke="#0284c7" stroke-width="2.5" />
          <text x="26" y="35" fill="${legendText}" font-size="9.5" font-weight="600">Gdm(0°)</text>
          <line x1="6" y1="50" x2="22" y2="50" stroke="#ef4444" stroke-width="2.5" />
          <text x="26" y="53" fill="${legendText}" font-size="9.5" font-weight="600">Bdm(ópt)</text>
          <line x1="6" y1="68" x2="22" y2="68" stroke="#b91c1c" stroke-width="2.5" />
          <text x="26" y="71" fill="${legendText}" font-size="9.5" font-weight="600">Bdm(0°)</text>
          <line x1="6" y1="86" x2="22" y2="86" stroke="#84cc16" stroke-width="2.5" />
          <text x="26" y="89" fill="${legendText}" font-size="9.5" font-weight="600">Ddm(ópt)</text>
          <line x1="6" y1="104" x2="22" y2="104" stroke="#15803d" stroke-width="2.5" />
          <text x="26" y="107" fill="${legendText}" font-size="9.5" font-weight="600">Ddm(0°)</text>
          <line x1="6" y1="122" x2="22" y2="122" stroke="#f59e0b" stroke-width="2.5" />
          <text x="26" y="125" fill="${legendText}" font-size="9.5" font-weight="600">Rdm(ópt)</text>
          <line x1="6" y1="140" x2="22" y2="140" stroke="#92400e" stroke-width="2.5" />
          <text x="26" y="143" fill="${legendText}" font-size="9.5" font-weight="600">Rdm(0°)</text>
        </g>
      `;
    }

    const svgTopHtml = `
      <svg viewBox="0 0 ${plotW} ${plotH}" style="width: 100%; height: auto; background: ${plotBg}; border: 1px solid ${plotBorder}; border-radius: 4px;">
        ${renderWrappedSvgTitle({
          lines: topTitleLayout.lines,
          centerX: pad.left + innerW / 2,
          firstY: topTitleLayout.firstY,
          fill: titleColor,
          fontSize: topTitleLayout.fontSize,
          lineHeight: topTitleLayout.lineHeight,
          fontWeight: 700,
        })}
        <text x="14" y="${plotH / 2}" fill="${labelColor}" font-size="10.5" font-weight="600" text-anchor="middle" transform="rotate(-90 14 ${plotH / 2})">${isEn ? 'Radiation' : 'Radiación'}</text>
        <text x="${pad.left + innerW / 2}" y="${plotH - 8}" fill="${labelColor}" font-size="10.5" font-weight="600" text-anchor="middle">${isEn ? 'Months' : 'Meses'}</text>

        ${seasonBands(innerW, pad.left, pad.top, innerH)}
        ${gridLinesTop}
        ${topSeriesHtml}

        <rect x="${pad.left}" y="${pad.top}" width="${innerW}" height="${innerH}" fill="none" stroke="${plotBorder}" />

        ${MONTH_NAMES_SHORT.map((m, i) => {
          const x = xMonth(i);
          return `<text x="${x}" y="${pad.top + innerH + 15}" fill="${tickColor}" font-size="10" text-anchor="middle" font-family="monospace">${m}</text>`;
        }).join('')}

        ${topLegendHtml}
      </svg>
    `;

    // -------------------------------------------------------------
    // SVG 2: Bottom Plot (Bar Chart of Gains %) - Full Negative & Dual-Bar Support
    // -------------------------------------------------------------
    const bottomTitleLayout = computeSvgTitleLayout(bottomPlotTitle, {
      basePadTop: 34,
      basePlotH: 205,
      maxCharsPerLine: 42,
      fontSize: 11.5,
      lineHeight: 14.5,
      topMargin: 16,
      gapBelowTitle: 10,
    });
    const bottomPlotW = 540;
    const bottomPlotH = bottomTitleLayout.plotH;
    const bPad = { top: bottomTitleLayout.padTop, right: 90, bottom: 35, left: 45 };
    const bInnerW = bottomPlotW - bPad.left - bPad.right;
    const bInnerH = 205 - 34 - 35;

    // Calculate realistic dynamic Y limits to ensure negative diffuse or tracking gains render properly!
    const allGainsPool = isAll
      ? [
          ...allGainsVs0.global,
          ...allGainsVs0.beam,
          ...allGainsVs0.diffuse,
          ...allGainsVsAnu.global,
          ...allGainsVsAnu.beam,
          ...allGainsVsAnu.diffuse,
        ]
      : isAlbedo
      ? gainsVsAnu
      : [...gainsVs0, ...gainsVsAnu];

    const rawMinGain = Math.min(...allGainsPool, 0);
    const rawMaxGain = Math.max(...allGainsPool, 10);

    let minGainY = 0;
    if (rawMinGain < -0.1) {
      minGainY = Math.floor((rawMinGain * 1.15) / 10) * 10;
    }
    let maxGainY = Math.ceil((rawMaxGain * 1.15) / 10) * 10;
    if (maxGainY - minGainY < 30) maxGainY = minGainY + 30;

    const yBottom = (v: number) => {
      const clamped = Math.max(minGainY, Math.min(maxGainY, v));
      const ratio = (clamped - minGainY) / (maxGainY - minGainY);
      return bPad.top + bInnerH - ratio * bInnerH;
    };

    let gridLinesBottom = '';
    // Generate 4 to 5 ticks including 0
    const bTicks: number[] = [];
    const step = Math.max(10, Math.round((maxGainY - minGainY) / 4 / 5) * 5);
    for (let tVal = minGainY; tVal <= maxGainY + 0.1; tVal += step) {
      bTicks.push(Math.round(tVal));
    }
    if (!bTicks.includes(0)) bTicks.push(0);
    bTicks.sort((a, b) => a - b);

    for (const v of bTicks) {
      const y = yBottom(v);
      if (gridBottomEnabled) {
        gridLinesBottom += `<line x1="${bPad.left}" y1="${y}" x2="${bPad.left + bInnerW}" y2="${y}" stroke="${gridStroke}" stroke-dasharray="2,3" />`;
      }
      gridLinesBottom += `<text x="${bPad.left - 6}" y="${y + 4}" fill="${tickColor}" font-size="10" text-anchor="end" font-family="monospace">${v}</text>`;
    }

    let bottomBarsHtml = '';
    let bottomLegendHtml = '';

    const yZero = yBottom(0);

    if (!isAll) {
      // TWO BARS PER MONTH: matching MATLAB OrientSol Grafica_OptEstacional:
      // Bar 1: Gain vs 0° (Plano horizontal)
      // Bar 2: Gain vs Ópt. anual
      const monthSlotW = bInnerW / 12;
      const barW = Math.max(4, monthSlotW * 0.36);
      const gap = 2;

      bottomBarsHtml = '';
      for (let i = 0; i < 12; i++) {
        const slotX = bPad.left + i * monthSlotW + (monthSlotW - (barW * 2 + gap)) / 2;
        const g0 = gainsVs0[i];
        const gAnu = gainsVsAnu[i];

        // Bar 1: vs 0° (Cyan/Blue if positive, darker blue if negative). Omitted if isAlbedo because Rdm(0°)=0 is indeterminate
        if (!isAlbedo) {
          const y1 = yBottom(g0);
          const barY1 = Math.min(y1, yZero);
          const barH1 = Math.max(0.5, Math.abs(y1 - yZero));
          const color1 = g0 >= 0 ? '#0284c7' : '#0369a1';
          bottomBarsHtml += `<rect x="${slotX}" y="${barY1}" width="${barW}" height="${barH1}" fill="${color1}" stroke="#0f172a" stroke-width="0.5" rx="1" />`;
        }

        // Bar 2: vs Ópt. anual (Green if positive, red if negative)
        const y2 = yBottom(gAnu);
        const barY2 = Math.min(y2, yZero);
        const barH2 = Math.max(0.5, Math.abs(y2 - yZero));
        const color2 = gAnu >= 0 ? '#10b981' : '#f43f5e';
        bottomBarsHtml += `<rect x="${slotX + barW + gap}" y="${barY2}" width="${barW}" height="${barH2}" fill="${color2}" stroke="#0f172a" stroke-width="0.5" rx="1" />`;
      }

      if (isAlbedo) {
        bottomBarsHtml += `
          <g class="albedo-seas-note">
            <rect x="${bPad.left + 10}" y="${bPad.top + 6}" width="${bInnerW - 20}" height="22" fill="${isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb'}" stroke="#f59e0b" stroke-width="0.8" rx="3" />
            <text x="${bPad.left + bInnerW / 2}" y="${bPad.top + 20}" fill="${isDark ? '#fbbf24' : '#92400e'}" font-size="9" font-weight="600" text-anchor="middle">
              Rdm(0º) = 0: ${isEn ? 'Gains vs horizontal plane (0°) cannot be calculated' : 'Las ganancias s/ plano horizontal (0°) no se pueden calcular'}
            </text>
          </g>
        `;
      }

      bottomLegendHtml = `
        <g transform="translate(${bPad.left + bInnerW + 4}, ${bPad.top + 4})">
          <rect x="0" y="0" width="86" height="52" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <rect x="6" y="8" width="10" height="10" fill="${isAlbedo ? '#94a3b8' : '#0284c7'}" stroke="#0f172a" stroke-width="0.5" />
          <text x="20" y="13" fill="${legendText}" font-size="8" font-weight="700">vs 0°</text>
          <text x="20" y="21" fill="${isAlbedo ? '#f59e0b' : legendText}" font-size="7" font-weight="${isAlbedo ? '700' : '500'}">${isAlbedo ? 'Indet. Rdm=0' : (isEn ? '(Horiz)' : '(Plano hor.)')}</text>
          <rect x="6" y="29" width="10" height="10" fill="#10b981" stroke="#0f172a" stroke-width="0.5" />
          <text x="20" y="35" fill="${legendText}" font-size="8" font-weight="700">${isEn ? 'vs Ann.' : 'vs Ópt.'}</text>
          <text x="20" y="44" fill="${legendText}" font-size="7" font-weight="500">${isEn ? 'opt' : 'anual'}</text>
        </g>
      `;
    } else {
      // 4 components grouped bars
      const monthSlotW = bInnerW / 12;
      const barW = Math.max(3, monthSlotW * 0.18);
      const gap = 1;

      bottomBarsHtml = '';
      for (let i = 0; i < 12; i++) {
        const slotX = bPad.left + i * monthSlotW + 4;
        const gG = allGainsVs0.global[i];
        const gB = allGainsVs0.beam[i];
        const gD = allGainsVs0.diffuse[i];
        const gR = allGainsVs0.albedo[i];

        const bars = [
          { val: gG, color: '#0284c7' },
          { val: gB, color: '#ef4444' },
          { val: gD, color: '#84cc16' },
          { val: gR, color: '#f59e0b' },
        ];

        bars.forEach((b, bIdx) => {
          const bx = slotX + bIdx * (barW + gap);
          const y = yBottom(b.val);
          const barY = Math.min(y, yZero);
          const barH = Math.max(0.5, Math.abs(y - yZero));
          bottomBarsHtml += `<rect x="${bx}" y="${barY}" width="${barW}" height="${barH}" fill="${b.color}" stroke="#0f172a" stroke-width="0.4" rx="1" />`;
        });
      }

      bottomLegendHtml = `
        <g transform="translate(${bPad.left + bInnerW + 4}, ${bPad.top + 4})">
          <rect x="0" y="0" width="86" height="98" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <text x="43" y="11" fill="${legendText}" font-size="8" font-weight="700" text-anchor="middle">vs 0°</text>
          <text x="43" y="20" fill="${legendText}" font-size="7" font-weight="500" text-anchor="middle">${isEn ? '(Horiz)' : '(Plano hor.)'}</text>
          <rect x="6" y="26" width="10" height="9" fill="#0284c7" />
          <text x="20" y="34" fill="${legendText}" font-size="8.5" font-weight="600">Gdm (Glob)</text>
          <rect x="6" y="42" width="10" height="9" fill="#ef4444" />
          <text x="20" y="50" fill="${legendText}" font-size="8.5" font-weight="600">Bdm (Dir)</text>
          <rect x="6" y="58" width="10" height="9" fill="#84cc16" />
          <text x="20" y="66" fill="${legendText}" font-size="8.5" font-weight="600">Ddm (Dif)</text>
          <rect x="6" y="74" width="10" height="9" fill="#f59e0b" />
          <text x="20" y="82" fill="${legendText}" font-size="8.5" font-weight="600">Rdm (Alb)</text>
        </g>
      `;
    }

    const svgBottomHtml = `
      <svg viewBox="0 0 ${bottomPlotW} ${bottomPlotH}" style="width: 100%; height: auto; background: ${plotBg}; border: 1px solid ${plotBorder}; border-radius: 4px;">
        ${renderWrappedSvgTitle({
          lines: bottomTitleLayout.lines,
          centerX: bPad.left + bInnerW / 2,
          firstY: bottomTitleLayout.firstY,
          fill: titleColor,
          fontSize: bottomTitleLayout.fontSize,
          lineHeight: bottomTitleLayout.lineHeight,
          fontWeight: 700,
        })}
        <text x="14" y="${bottomPlotH / 2}" fill="${labelColor}" font-size="10.5" font-weight="600" text-anchor="middle" transform="rotate(-90 14 ${bottomPlotH / 2})">${isEn ? 'Gains (%)' : 'Ganancias (%)'}</text>
        <text x="${bPad.left + bInnerW / 2}" y="${bottomPlotH - 8}" fill="${labelColor}" font-size="10.5" font-weight="600" text-anchor="middle">${isEn ? 'Months' : 'Meses'}</text>

        ${seasonBands(bInnerW, bPad.left, bPad.top, bInnerH)}
        ${gridLinesBottom}

        <!-- Zero Line -->
        <line x1="${bPad.left}" y1="${yZero}" x2="${bPad.left + bInnerW}" y2="${yZero}" stroke="${zeroLineStroke}" stroke-width="1.4" />

        ${bottomBarsHtml}

        <rect x="${bPad.left}" y="${bPad.top}" width="${bInnerW}" height="${bInnerH}" fill="none" stroke="${plotBorder}" />

        ${MONTH_NAMES_SHORT.map((m, i) => {
          const x = bPad.left + (i + 0.5) * (bInnerW / 12);
          return `<text x="${x}" y="${bPad.top + bInnerH + 15}" fill="${tickColor}" font-size="10" text-anchor="middle" font-family="monospace">${m}</text>`;
        }).join('')}

        ${bottomLegendHtml}
      </svg>
    `;

    container.innerHTML = `
      <div class="opt-matlab-graphs-frame">
        <!-- 1. Header Bar -->
        <div class="opt-graphs-header-bar">
          <div class="opt-graphs-header-left">
            <div class="opt-graphs-meta-row">
              <span class="meta-label"><strong>${isEn ? 'City:' : 'Ciudad:'}</strong> ${locationName}</span>
              <span class="meta-label" style="margin-left: 2rem;">
                <strong>${isEn ? 'Latitude (°):' : 'Latitud (°):'}</strong>
                <span style="color: #38bdf8; font-weight: 700;">${latitude.toFixed(2)}</span>
              </span>
            </div>
            <div class="opt-graphs-study-row">
              <span class="meta-label">
                <strong>${isEn ? 'Study:' : 'Estudio:'}</strong>
                <span style="color: #34d399; font-weight: 600;">${isEn ? 'Seasonal optimal tilt' : 'Inclinación óptima estacional'}</span>
              </span>
            </div>
          </div>
          <div class="opt-graphs-header-right">
            <div class="opt-matlab-brand-title">
              ORIENT<span style="color: #f59e0b;">SOL</span> <strong>4.0</strong>
            </div>
          </div>
        </div>

        <!-- 2. Main Two-Column Layout -->
        <div class="opt-graphs-main-layout">
          <div class="opt-graphs-plots-col">
            <div class="matlab-plot-card">
              ${svgTopHtml}
              <div class="matlab-plot-footer">
                <label class="matlab-grid-toggle">
                  <input type="checkbox" id="chk-grid-top-seas" ${gridTopEnabled ? 'checked' : ''} />
                  <span>${isEn ? 'Enable grid' : 'Activar rejilla'}</span>
                </label>
              </div>
            </div>

            <div class="matlab-plot-card">
              ${svgBottomHtml}
              <div class="matlab-plot-footer">
                <label class="matlab-grid-toggle">
                  <input type="checkbox" id="chk-grid-bottom-seas" ${gridBottomEnabled ? 'checked' : ''} />
                  <span>${isEn ? 'Enable grid' : 'Activar rejilla'}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="opt-graphs-side-col">
            <div class="matlab-comp-picker-box">
              <label for="select-comp-graphs-seas" class="matlab-picker-label">
                ${isEn ? 'Select a component:' : 'Seleccione una componente:'}
              </label>
              <select id="select-comp-graphs-seas" class="matlab-picker-select">
                <option value="all" ${selectedComponent === 'all' ? 'selected' : ''}>${isEn ? 'All' : 'Todas'}</option>
                <option value="global" ${selectedComponent === 'global' ? 'selected' : ''}>${isEn ? 'Global' : 'Global'}</option>
                <option value="beam" ${selectedComponent === 'beam' ? 'selected' : ''}>${isEn ? 'Direct' : 'Directa'}</option>
                <option value="diffuse" ${selectedComponent === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse' : 'Difusa'}</option>
                <option value="albedo" ${selectedComponent === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo' : 'Albedo'}</option>
              </select>

              <div class="seasonal-angles-badge-list" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
                <div style="background: rgba(2, 132, 199, 0.15); border: 1px solid #0284c7; padding: 4px 6px; border-radius: 4px; font-size: 0.8rem; color: #38bdf8;">
                  <strong>Inv:</strong> ${winterDeg}°
                </div>
                <div style="background: rgba(22, 163, 74, 0.15); border: 1px solid #16a34a; padding: 4px 6px; border-radius: 4px; font-size: 0.8rem; color: #4ade80;">
                  <strong>Pri:</strong> ${springDeg}°
                </div>
                <div style="background: rgba(202, 138, 4, 0.15); border: 1px solid #ca8a04; padding: 4px 6px; border-radius: 4px; font-size: 0.8rem; color: #facc15;">
                  <strong>Ver:</strong> ${summerDeg}°
                </div>
                <div style="background: rgba(234, 88, 12, 0.15); border: 1px solid #ea580c; padding: 4px 6px; border-radius: 4px; font-size: 0.8rem; color: #fb923c;">
                  <strong>Oto:</strong> ${autumnDeg}°
                </div>
              </div>
            </div>

            <div class="matlab-stat-boxes-container">
              <div class="matlab-stat-frame frame-opt">
                <div class="stat-frame-title title-opt">${isEn ? 'Seasonal optimal tilt' : 'Inclinación óptima estacional'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${maxVal(radSeas).toFixed(2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${minVal(radSeas).toFixed(2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${meanVal(radSeas).toFixed(2)}</strong>
                </div>
              </div>

              <div class="matlab-stat-frame frame-horiz">
                <div class="stat-frame-title title-horiz">${isEn ? 'Horizontal surface (0°)' : 'Superficie horizontal (0°)'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${maxVal(rad0).toFixed(2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${minVal(rad0).toFixed(2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${meanVal(rad0).toFixed(2)}</strong>
                </div>
              </div>

              <div class="matlab-stat-frame frame-gain">
                <div class="stat-frame-title title-gain">${isEn ? 'Gain vs 0° (%)' : 'Ganancia vs 0° (%)'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${isAlbedo ? '-' : `${maxVal(gainsVs0).toFixed(2)} %`}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${isAlbedo ? '-' : `${minVal(gainsVs0).toFixed(2)} %`}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${isAlbedo ? '-' : `${meanVal(gainsVs0).toFixed(2)} %`}</strong>
                </div>
              </div>

              <div class="matlab-stat-frame" style="border: 1px solid #10b981; background: rgba(16, 185, 129, 0.08); border-radius: 4px; padding: 6px 10px;">
                <div class="stat-frame-title" style="color: #34d399; font-weight: 700; font-size: 0.85rem; margin-bottom: 4px;">${isEn ? 'Gain vs Annual Opt (%)' : 'Ganancia vs Ópt. Anual (%)'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${isAlbedo && optTiltAnnual === 0 ? '-' : `${maxVal(gainsVsAnu).toFixed(2)} %`}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${isAlbedo && optTiltAnnual === 0 ? '-' : `${minVal(gainsVsAnu).toFixed(2)} %`}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${isAlbedo && optTiltAnnual === 0 ? '-' : `${meanVal(gainsVsAnu).toFixed(2)} %`}</strong>
                </div>
              </div>
            </div>

            <div class="matlab-graphs-actions-row">
              <button id="btn-seas-graphs-volver" class="matlab-btn-default flex-1" type="button">
                ${isEn ? 'Back' : 'Volver'}
              </button>
              <button id="btn-seas-graphs-salir" class="matlab-btn-default flex-1" type="button">
                ${isEn ? 'Exit' : 'Salir'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelector<HTMLSelectElement>('#select-comp-graphs-seas')?.addEventListener('change', (e) => {
      selectedComponent = (e.target as HTMLSelectElement).value as SeasonalGraphComponentChoice;
      if (selectedComponent === 'albedo') {
        showAlbedoWarningModal(isEn);
      }
      renderInternal();
    });

    container.querySelector<HTMLInputElement>('#chk-grid-top-seas')?.addEventListener('change', (e) => {
      gridTopEnabled = (e.target as HTMLInputElement).checked;
      renderInternal();
    });

    container.querySelector<HTMLInputElement>('#chk-grid-bottom-seas')?.addEventListener('change', (e) => {
      gridBottomEnabled = (e.target as HTMLInputElement).checked;
      renderInternal();
    });

    container.querySelector<HTMLButtonElement>('#btn-seas-graphs-volver')?.addEventListener('click', () => {
      if (onBack) onBack();
    });

    container.querySelector<HTMLButtonElement>('#btn-seas-graphs-salir')?.addEventListener('click', () => {
      if (onExit) onExit();
    });
  }

  renderInternal();
  return container;
}
