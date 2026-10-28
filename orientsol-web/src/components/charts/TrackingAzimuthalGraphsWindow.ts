import { i18n } from '@/i18n';
import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { themeManager } from '@/services/theme/themeManager';
import { renderWrappedSvgTitle, computeSvgTitleLayout } from './chartSvgUtils';
import { showAlbedoWarningModal } from '@/components/modals/AlbedoWarningModal';
import { formatNum } from '@/utils/formatters';

export type TrackingGraphComponentChoice = 'global' | 'beam' | 'diffuse' | 'albedo' | 'all';

interface TrackingAzimuthalGraphsProps {
  simulationResult: SolarBridgeSimulationResult;
  locationName: string;
  latitude: number;
  initialComponent?: TrackingGraphComponentChoice;
  onBack?: () => void;
  onExit?: () => void;
}

const MONTH_NAMES_SHORT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export function renderTrackingAzimuthalGraphsWindow(props: TrackingAzimuthalGraphsProps): HTMLElement {
  const { simulationResult: res, locationName, latitude, onBack, onExit } = props;
  const container = document.createElement('div');
  container.className = 'opt-matlab-graphs-window';
  container.id = 'opt-azimuthal-graphs-window';

  let selectedComponent: TrackingGraphComponentChoice = props.initialComponent || 'global';
  let gridTopEnabled: boolean = true;
  let gridBottomEnabled: boolean = false;

  function renderInternal() {
    const isEn = i18n.getLocale() === 'en';
    const isAll = selectedComponent === 'all';
    const isAlbedo = selectedComponent === 'albedo';

    const compKey = isAll ? 'global' : selectedComponent;

    const getHoriz = (k: string) => {
      if (k === 'global') return res.horizontal.gdm0;
      if (k === 'beam') return res.horizontal.bdm0;
      if (k === 'diffuse') return res.horizontal.ddm0;
      return new Array(12).fill(0.0);
    };

    const getAzim = (k: string) => {
      const aComps = res.tracking.azimuthalAxis.components;
      if (aComps && aComps[k as keyof typeof aComps]) {
        return aComps[k as keyof typeof aComps];
      }
      return res.tracking.azimuthalAxis.monthlyDailyKwh;
    };

    const rad0 = getHoriz(compKey);
    const radAzim = getAzim(compKey);
    const radAnn = res.optimalAnnual.monthlyDailyKwh;
    const radSeas = res.seasonal.monthlyDailyKwh;
    const radPolar = res.tracking.polarAxis.monthlyDailyKwh;
    const radHorTrack = res.tracking.horizontalAxis.monthlyDailyKwh;

    const allData = {
      global: { rad0: getHoriz('global'), radAz: getAzim('global') },
      beam: { rad0: getHoriz('beam'), radAz: getAzim('beam') },
      diffuse: { rad0: getHoriz('diffuse'), radAz: getAzim('diffuse') },
      albedo: { rad0: getHoriz('albedo'), radAz: getAzim('albedo') },
    };

    const calcGains = (target: number[], source: number[] = radAzim) =>
      source.map((a, i) => (target[i] > 0 ? ((a - target[i]) / target[i]) * 100 : 0));

    const gainsVs0 = isAlbedo ? new Array(12).fill(0) : calcGains(rad0);
    const gainsVsAnn = calcGains(radAnn);
    const gainsVsSeas = calcGains(radSeas);
    const gainsVsPolar = calcGains(radPolar);
    const gainsVsHorTrack = calcGains(radHorTrack);

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
      ? (isEn ? 'All radiation components (Azimuthal Tracking)' : 'Todas las componentes de la radiación (Seg. Azimutal)')
      : isEn
      ? `${compName.charAt(0).toUpperCase() + compName.slice(1)} radiation (kWh/m²/day)`
      : `Radiación ${compName} (kWh/m²/día)`;

    const bottomPlotTitle = isAll
      ? (isEn ? 'Gains of all components vs horizontal plane (0°) for azimuthal tracking' : 'Ganancias de todas las componentes respecto al plano horizontal (0°) para el seguimiento azimutal')
      : isEn
      ? `Gains of ${compName} radiation vs horizontal plane (0°) and other setups for azimuthal tracking`
      : `Ganancias de radiación ${compName} respecto al plano horizontal (0°) y otros para el seguimiento azimutal`;

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

    const maxRadiationY = isAll ? 10 : Math.ceil(Math.max(...radAzim, ...rad0, 1.0) * 1.15);
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
      const colorAzim =
        selectedComponent === 'beam'
          ? '#ef4444'
          : selectedComponent === 'diffuse'
          ? '#84cc16'
          : selectedComponent === 'albedo'
          ? '#f59e0b'
          : '#f97316';

      const colorZero =
        selectedComponent === 'beam'
          ? '#f87171'
          : selectedComponent === 'diffuse'
          ? '#15803d'
          : selectedComponent === 'albedo'
          ? '#92400e'
          : '#0369a1';

      topSeriesHtml = `
        <path d="${makeLineD(radAzim)}" fill="none" stroke="${colorAzim}" stroke-width="2.8" stroke-linecap="round" />
        <path d="${makeLineD(rad0)}" fill="none" stroke="${colorZero}" stroke-width="2.8" stroke-linecap="round" />
      `;

      topLegendHtml = `
        <g transform="translate(${pad.left + innerW + 10}, ${pad.top + 5})">
          <rect x="0" y="0" width="76" height="42" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <line x1="8" y1="14" x2="26" y2="14" stroke="${colorAzim}" stroke-width="2.5" />
          <text x="32" y="17" fill="${legendText}" font-size="10" font-weight="600">Seg. azi</text>
          <line x1="8" y1="30" x2="26" y2="30" stroke="${colorZero}" stroke-width="2.5" />
          <text x="32" y="33" fill="${legendText}" font-size="10" font-weight="600">0°</text>
        </g>
      `;
    } else {
      topSeriesHtml = `
        <path d="${makeLineD(allData.global.radAz)}" fill="none" stroke="#f97316" stroke-width="2.4" />
        <path d="${makeLineD(allData.global.rad0)}" fill="none" stroke="#0284c7" stroke-width="2.4" />
        <path d="${makeLineD(allData.beam.radAz)}" fill="none" stroke="#ef4444" stroke-width="2.4" />
        <path d="${makeLineD(allData.beam.rad0)}" fill="none" stroke="#b91c1c" stroke-width="2.4" />
        <path d="${makeLineD(allData.diffuse.radAz)}" fill="none" stroke="#84cc16" stroke-width="2.4" />
        <path d="${makeLineD(allData.diffuse.rad0)}" fill="none" stroke="#15803d" stroke-width="2.4" />
        <path d="${makeLineD(allData.albedo.radAz)}" fill="none" stroke="#f59e0b" stroke-width="2.4" />
        <path d="${makeLineD(allData.albedo.rad0)}" fill="none" stroke="#92400e" stroke-width="2.4" />
      `;

      topLegendHtml = `
        <g transform="translate(${pad.left + innerW + 8}, ${pad.top - 12})">
          <rect x="0" y="0" width="80" height="152" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <line x1="6" y1="14" x2="22" y2="14" stroke="#f97316" stroke-width="2.5" />
          <text x="26" y="17" fill="${legendText}" font-size="9.5" font-weight="600">Gdm(azi)</text>
          <line x1="6" y1="32" x2="22" y2="32" stroke="#0284c7" stroke-width="2.5" />
          <text x="26" y="35" fill="${legendText}" font-size="9.5" font-weight="600">Gdm(0°)</text>
          <line x1="6" y1="50" x2="22" y2="50" stroke="#ef4444" stroke-width="2.5" />
          <text x="26" y="53" fill="${legendText}" font-size="9.5" font-weight="600">Bdm(azi)</text>
          <line x1="6" y1="68" x2="22" y2="68" stroke="#b91c1c" stroke-width="2.5" />
          <text x="26" y="71" fill="${legendText}" font-size="9.5" font-weight="600">Bdm(0°)</text>
          <line x1="6" y1="86" x2="22" y2="86" stroke="#84cc16" stroke-width="2.5" />
          <text x="26" y="89" fill="${legendText}" font-size="9.5" font-weight="600">Ddm(azi)</text>
          <line x1="6" y1="104" x2="22" y2="104" stroke="#15803d" stroke-width="2.5" />
          <text x="26" y="107" fill="${legendText}" font-size="9.5" font-weight="600">Ddm(0°)</text>
          <line x1="6" y1="122" x2="22" y2="122" stroke="#f59e0b" stroke-width="2.5" />
          <text x="26" y="125" fill="${legendText}" font-size="9.5" font-weight="600">Rdm(azi)</text>
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

    const allGainsComps = {
      global: calcGains(allData.global.rad0, allData.global.radAz),
      beam: calcGains(allData.beam.rad0, allData.beam.radAz),
      diffuse: calcGains(allData.diffuse.rad0, allData.diffuse.radAz),
      albedo: new Array(12).fill(0),
    };

    const allGainsPool = isAll
      ? [...allGainsComps.global, ...allGainsComps.beam, ...allGainsComps.diffuse]
      : [...gainsVs0, ...gainsVsAnn, ...gainsVsSeas, ...gainsVsPolar, ...gainsVsHorTrack];

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

    const yZero = yBottom(0);

    let gridLinesBottom = '';
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

    const monthSlotW = bInnerW / 12;
    let bottomBarsHtml = '';
    let bottomLegendHtml = '';

    if (isAll) {
      const barW = Math.max(2.8, monthSlotW * 0.18);
      const gap = 1;

      for (let i = 0; i < 12; i++) {
        const slotX = bPad.left + i * monthSlotW + (monthSlotW - (barW * 4 + gap * 3)) / 2;
        const seriesAll = [
          { val: allGainsComps.global[i], color: '#0284c7' },
          { val: allGainsComps.beam[i], color: '#ef4444' },
          { val: allGainsComps.diffuse[i], color: '#84cc16' },
          { val: allGainsComps.albedo[i], color: '#f59e0b' },
        ];

        seriesAll.forEach((s, sIdx) => {
          const bx = slotX + sIdx * (barW + gap);
          const y = yBottom(s.val);
          const barY = Math.min(y, yZero);
          const barH = Math.max(0.5, Math.abs(y - yZero));
          bottomBarsHtml += `<rect x="${bx.toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" fill="${s.color}" stroke="#0f172a" stroke-width="0.3" rx="1" />`;
        });
      }

      bottomLegendHtml = `
        <g transform="translate(${bPad.left + bInnerW + 4}, ${bPad.top + 2})">
          <rect x="0" y="0" width="88" height="96" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <text x="44" y="11" fill="${legendText}" font-size="8" font-weight="700" text-anchor="middle">vs 0°</text>
          <text x="44" y="20" fill="${legendText}" font-size="7" font-weight="500" text-anchor="middle">${isEn ? '(Horiz)' : '(Plano hor.)'}</text>
          <rect x="5" y="26" width="9" height="9" fill="#0284c7" />
          <text x="18" y="34" fill="${legendText}" font-size="8.5" font-weight="600">Gdm (Glob)</text>
          <rect x="5" y="42" width="9" height="9" fill="#ef4444" />
          <text x="18" y="50" fill="${legendText}" font-size="8.5" font-weight="600">Bdm (Dir)</text>
          <rect x="5" y="58" width="9" height="9" fill="#84cc16" />
          <text x="18" y="66" fill="${legendText}" font-size="8.5" font-weight="600">Ddm (Dif)</text>
          <rect x="5" y="74" width="9" height="9" fill="#f59e0b" />
          <text x="18" y="82" fill="${legendText}" font-size="8.5" font-weight="600">Rdm (Alb)</text>
        </g>
      `;
    } else {
      const barW = Math.max(2.5, monthSlotW * 0.16);
      const gap = 1;

      for (let i = 0; i < 12; i++) {
        const slotX = bPad.left + i * monthSlotW + (monthSlotW - (barW * 5 + gap * 4)) / 2;

        const series = [
          { val: gainsVs0[i], color: '#0284c7' },
          { val: gainsVsAnn[i], color: '#10b981' },
          { val: gainsVsSeas[i], color: '#f59e0b' },
          { val: gainsVsPolar[i], color: '#38bdf8' },
          { val: gainsVsHorTrack[i], color: '#ec4899' },
        ];

        series.forEach((s, sIdx) => {
          if (sIdx === 0 && isAlbedo) return; // Rdm(0°)=0 indeterminate
          const bx = slotX + sIdx * (barW + gap);
          const y = yBottom(s.val);
          const barY = Math.min(y, yZero);
          const barH = Math.max(0.5, Math.abs(y - yZero));
          bottomBarsHtml += `<rect x="${bx}" y="${barY}" width="${barW}" height="${barH}" fill="${s.color}" stroke="#0f172a" stroke-width="0.3" rx="1" />`;
        });
      }

      if (isAlbedo) {
        bottomBarsHtml += `
          <g class="albedo-track-note">
            <rect x="${bPad.left + 10}" y="${bPad.top + 6}" width="${bInnerW - 20}" height="22" fill="${isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb'}" stroke="#f59e0b" stroke-width="0.8" rx="3" />
            <text x="${bPad.left + bInnerW / 2}" y="${bPad.top + 20}" fill="${isDark ? '#fbbf24' : '#92400e'}" font-size="9" font-weight="600" text-anchor="middle">
              Rdm(0º) = 0: ${isEn ? 'Gains vs horizontal plane (0°) cannot be calculated' : 'Las ganancias s/ plano horizontal (0°) no se pueden calcular'}
            </text>
          </g>
        `;
      }

      bottomLegendHtml = `
        <g transform="translate(${bPad.left + bInnerW + 2}, ${bPad.top + 2})">
          <rect x="0" y="0" width="92" height="96" fill="${legendBg}" stroke="${legendBorder}" rx="3" />
          <rect x="5" y="8" width="9" height="9" fill="${isAlbedo ? '#94a3b8' : '#0284c7'}" />
          <text x="18" y="16" fill="${isAlbedo ? '#f59e0b' : legendText}" font-size="7.5" font-weight="${isAlbedo ? '700' : '600'}">${isAlbedo ? 'vs 0° (Indet.)' : 'vs 0° (Plano hor.)'}</text>
          <rect x="5" y="24" width="9" height="9" fill="#10b981" />
          <text x="18" y="32" fill="${legendText}" font-size="7.5" font-weight="600">vs Ópt. anu</text>
          <rect x="5" y="40" width="9" height="9" fill="#f59e0b" />
          <text x="18" y="48" fill="${legendText}" font-size="7.5" font-weight="600">vs Ópt. est</text>
          <rect x="5" y="56" width="9" height="9" fill="#38bdf8" />
          <text x="18" y="64" fill="${legendText}" font-size="7.5" font-weight="600">vs Seg. pol</text>
          <rect x="5" y="72" width="9" height="9" fill="#ec4899" />
          <text x="18" y="80" fill="${legendText}" font-size="7.5" font-weight="600">vs Seg. hor</text>
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
        ${gridLinesBottom}

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
        <div class="opt-graphs-header-bar">
          <div class="opt-graphs-header-left">
            <div class="opt-graphs-meta-row">
              <span class="meta-label"><strong>${isEn ? 'City:' : 'Ciudad:'}</strong> ${locationName}</span>
              <span class="meta-label" style="margin-left: 2rem;">
                <strong>${isEn ? 'Latitude (°):' : 'Latitud (°):'}</strong>
                <span style="color: #38bdf8; font-weight: 700;">${formatNum(latitude, 2)}</span>
              </span>
            </div>
            <div class="opt-graphs-study-row">
              <span class="meta-label">
                <strong>${isEn ? 'Study:' : 'Estudio:'}</strong>
                <span style="color: #f97316; font-weight: 600;">${isEn ? 'Single-axis azimuthal tracking' : 'Seguimiento a un eje azimutal'}</span>
              </span>
            </div>
          </div>
          <div class="opt-graphs-header-right">
            <div class="opt-matlab-brand-title">
              ORIENT<span style="color: #f59e0b;">SOL</span> <strong>4.0</strong>
            </div>
          </div>
        </div>

        <div class="opt-graphs-main-layout">
          <div class="opt-graphs-plots-col">
            <div class="matlab-plot-card">
              ${svgTopHtml}
              <div class="matlab-plot-footer">
                <label class="matlab-grid-toggle">
                  <input type="checkbox" id="chk-grid-top-azi" ${gridTopEnabled ? 'checked' : ''} />
                  <span>${isEn ? 'Enable grid' : 'Activar rejilla'}</span>
                </label>
              </div>
            </div>

            <div class="matlab-plot-card">
              ${svgBottomHtml}
              <div class="matlab-plot-footer">
                <label class="matlab-grid-toggle">
                  <input type="checkbox" id="chk-grid-bottom-azi" ${gridBottomEnabled ? 'checked' : ''} />
                  <span>${isEn ? 'Enable grid' : 'Activar rejilla'}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="opt-graphs-side-col">
            <div class="matlab-comp-picker-box">
              <label for="select-comp-graphs-azi" class="matlab-picker-label">
                ${isEn ? 'Select a component:' : 'Seleccione una componente:'}
              </label>
              <select id="select-comp-graphs-azi" class="matlab-picker-select">
                <option value="all" ${selectedComponent === 'all' ? 'selected' : ''}>${isEn ? 'All' : 'Todas'}</option>
                <option value="global" ${selectedComponent === 'global' ? 'selected' : ''}>${isEn ? 'Global' : 'Global'}</option>
                <option value="beam" ${selectedComponent === 'beam' ? 'selected' : ''}>${isEn ? 'Direct' : 'Directa'}</option>
                <option value="diffuse" ${selectedComponent === 'diffuse' ? 'selected' : ''}>${isEn ? 'Diffuse' : 'Difusa'}</option>
                <option value="albedo" ${selectedComponent === 'albedo' ? 'selected' : ''}>${isEn ? 'Albedo' : 'Albedo'}</option>
              </select>
            </div>

            <div class="matlab-stat-boxes-container">
              <div class="matlab-stat-frame frame-opt">
                <div class="stat-frame-title title-opt">${isEn ? 'Azimuthal tracking' : 'Seguimiento azimutal'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${formatNum(maxVal(radAzim), 2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${formatNum(minVal(radAzim), 2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${formatNum(meanVal(radAzim), 2)}</strong>
                </div>
              </div>

              <div class="matlab-stat-frame frame-horiz">
                <div class="stat-frame-title title-horiz">${isEn ? 'Horizontal surface (0°)' : 'Superficie horizontal (0°)'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${formatNum(maxVal(rad0), 2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${formatNum(minVal(rad0), 2)}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${formatNum(meanVal(rad0), 2)}</strong>
                </div>
              </div>

              <div class="matlab-stat-frame frame-gain">
                <div class="stat-frame-title title-gain">${isEn ? 'Gain vs 0° (%)' : 'Ganancia vs 0° (%)'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${isAlbedo ? '-' : `${formatNum(maxVal(gainsVs0), 2)} %`}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${isAlbedo ? '-' : `${formatNum(minVal(gainsVs0), 2)} %`}</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${isAlbedo ? '-' : `${formatNum(meanVal(gainsVs0), 2)} %`}</strong>
                </div>
              </div>

              <div class="matlab-stat-frame" style="border: 1px solid #10b981; background: rgba(16, 185, 129, 0.08); border-radius: 4px; padding: 6px 10px;">
                <div class="stat-frame-title" style="color: #34d399; font-weight: 700; font-size: 0.85rem; margin-bottom: 4px;">${isEn ? 'Gain vs Annual Opt (%)' : 'Ganancia vs Ópt. Anual (%)'}</div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Maximum' : 'Máximo'}</span>
                  <strong>${formatNum(maxVal(gainsVsAnn), 2)} %</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Minimum' : 'Mínimo'}</span>
                  <strong>${formatNum(minVal(gainsVsAnn), 2)} %</strong>
                </div>
                <div class="stat-frame-row">
                  <span>${isEn ? 'Mean' : 'Media'}</span>
                  <strong>${formatNum(meanVal(gainsVsAnn), 2)} %</strong>
                </div>
              </div>
            </div>

            <div class="matlab-graphs-actions-row">
              <button id="btn-azi-graphs-volver" class="matlab-btn-default flex-1" type="button">
                ${isEn ? 'Back' : 'Volver'}
              </button>
              <button id="btn-azi-graphs-salir" class="matlab-btn-default flex-1" type="button">
                ${isEn ? 'Exit' : 'Salir'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelector<HTMLSelectElement>('#select-comp-graphs-azi')?.addEventListener('change', (e) => {
      selectedComponent = (e.target as HTMLSelectElement).value as TrackingGraphComponentChoice;
      if (selectedComponent === 'albedo') {
        showAlbedoWarningModal(isEn);
      }
      renderInternal();
    });

    container.querySelector<HTMLInputElement>('#chk-grid-top-azi')?.addEventListener('change', (e) => {
      gridTopEnabled = (e.target as HTMLInputElement).checked;
      renderInternal();
    });

    container.querySelector<HTMLInputElement>('#chk-grid-bottom-azi')?.addEventListener('change', (e) => {
      gridBottomEnabled = (e.target as HTMLInputElement).checked;
      renderInternal();
    });

    container.querySelector<HTMLButtonElement>('#btn-azi-graphs-volver')?.addEventListener('click', () => {
      if (onBack) onBack();
    });

    container.querySelector<HTMLButtonElement>('#btn-azi-graphs-salir')?.addEventListener('click', () => {
      if (onExit) onExit();
    });
  }

  renderInternal();
  return container;
}
