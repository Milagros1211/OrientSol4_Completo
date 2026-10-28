import type { SolarBridgeSimulationResult } from '@/services/bridge/solarCalculationBridge';
import { getSurfaceDisplayName, getCategoryBadge } from '@/i18n/surfaceTranslations';
import { sanitizeForSpreadsheet } from '@/utils/security';
import { formatNum, formatInt, formatPercent } from '@/utils/formatters';

const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Generates and downloads a structured UTF-8 CSV report with BOM
 * for instant Excel compatibility.
 */
export function exportToCSV(
  res: SolarBridgeSimulationResult,
  options?: { peakPowerKw?: number; performanceRatio?: number; isEn?: boolean }
): void {
  const isEn = options?.isEn ?? false;
  const peakKw = options?.peakPowerKw ?? 5.0;
  const pr = options?.performanceRatio ?? 0.80;
  const months = isEn ? MONTH_NAMES_EN : MONTH_NAMES_ES;

  const lines: string[] = [];

  // UTF-8 BOM
  const BOM = '\uFEFF';

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const downloadDateFormatted = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const fileTimestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  // 1. Header Metadata
  lines.push('======================================================================');
  lines.push(`ORIENTSOL 4.0 - ${isEn ? 'SOLAR ENERGY SIMULATION REPORT' : 'INFORME DE SIMULACIÓN ENERGÉTICA SOLAR'}`);
  lines.push('======================================================================');
  lines.push(`${isEn ? 'Download Date & Time' : 'Fecha y Hora de Descarga'};${downloadDateFormatted}`);
  lines.push(`${isEn ? 'ISO Timestamp' : 'Marca Temporal ISO'};${now.toISOString()}`);
  lines.push(`${isEn ? 'Location' : 'Localidad'};${sanitizeForSpreadsheet(res.locationName)}`);
  lines.push(`${isEn ? 'Latitude' : 'Latitud'};${formatNum(res.latitude, 4)}°`);
  lines.push(`${isEn ? 'Longitude' : 'Longitud'};${formatNum(res.longitude, 4)}°`);
  lines.push(`${isEn ? 'Data Source' : 'Fuente de Datos'};${sanitizeForSpreadsheet(res.source.toUpperCase())}`);
  lines.push(`${isEn ? 'PV Peak Power' : 'Potencia Pico FV'};${formatNum(peakKw, 2)} kWp`);
  lines.push(`Performance Ratio (PR);${formatPercent(pr * 100, 1)}`);
  lines.push(`${isEn ? 'Execution Engine' : 'Motor de Simulación'};Python 3.14 (Pyodide Python WASM)`);
  lines.push(`${isEn ? 'Calculation Time' : 'Tiempo de Motor'};${res.executionTimeMs} ms`);
  lines.push('');

  // 2. Executive Annual Totals
  lines.push('----------------------------------------------------------------------');
  lines.push(isEn ? 'ANNUAL ENERGY BALANCE & THERMAL DERATING' : 'BALANCE ENERGÉTICO ANUAL Y COMPORTAMIENTO TÉRMICO');
  lines.push('----------------------------------------------------------------------');
  lines.push(`${isEn ? 'Estimated Collector Area' : 'Superficie Captadora Estimada'};${formatNum(res.energyYield.collectorAreaM2, 1)} m²`);
  lines.push(`${isEn ? 'Total Solar Radiation Received' : 'Energía Solar Recibida Total'};${formatInt(res.energyYield.recibida.annualTotalKwh)} ${isEn ? 'kWh/yr' : 'kWh/año'} (${formatNum(res.energyYield.recibida.annualKwhM2, 1)} ${isEn ? 'kWh/m²·yr' : 'kWh/m²·año'})`);
  lines.push(`${isEn ? 'PV Energy Yield (Osterwald)' : 'Energía FV Producida (Osterwald)'};${formatInt(res.energyYield.producida.osterwald.annualKwh)} ${isEn ? 'kWh/yr' : 'kWh/año'}`);
  lines.push(`${isEn ? 'PV Energy Yield (Simplified PR)' : 'Energía FV Producida (Simplificado)'};${formatInt(res.energyYield.producida.simplified.annualKwh)} ${isEn ? 'kWh/yr' : 'kWh/año'}`);
  lines.push(`${isEn ? 'Specific Yield' : 'Productividad Específica'};${formatInt(res.energyYield.producida.osterwald.specificYieldKwhKwp)} kWh/kWp`);
  lines.push(`${isEn ? 'Cell Thermal Losses vs STC' : 'Pérdidas Térmicas por Temperatura de Célula'};-${formatInt(Math.abs(res.energyYield.producida.osterwald.thermalLossKwh))} kWh (-${formatNum(Math.abs(res.energyYield.producida.osterwald.thermalLossPct), 2)} %)`);
  lines.push(`${isEn ? 'Mean Operating Cell Temperature' : 'Temperatura Media de Célula Operativa'};${formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1)} °C (${isEn ? 'Max' : 'Máx'}: ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)} °C)`);
  lines.push('');

  // 3. Monthly Breakdown Table
  lines.push('----------------------------------------------------------------------');
  lines.push(isEn ? 'MONTHLY SOLAR & ENERGY BREAKDOWN' : 'DESGLOSE MENSUAL DE RADIACIÓN, TEMPERATURA Y PRODUCCIÓN FV');
  lines.push('----------------------------------------------------------------------');
  lines.push(
    [
      isEn ? 'Month' : 'Mes',
      isEn ? 'Horiz Rad (kWh/m2/d)' : 'Rad Horiz Gdm0 (kWh/m2/d)',
      isEn ? 'Fixed Opt Rad (kWh/m2/d)' : 'Rad Fijo Opt (kWh/m2/d)',
      isEn ? 'Monthly Opt Rad (kWh/m2/d)' : 'Rad Opt Mensual (kWh/m2/d)',
      isEn ? 'Monthly Opt Tilt (deg)' : 'Angulo Opt Mensual (grados)',
      isEn ? 'Ambient Temp T_amb (C)' : 'Temp Ambiente T_amb (C)',
      isEn ? 'Cell Temp T_C (C)' : 'Temp Celula T_C (C)',
      isEn ? 'Osterwald Yield (kWh)' : 'Prod FV Osterwald (kWh)',
      isEn ? 'Simplified Yield (kWh)' : 'Prod FV Simplificada (kWh)',
    ].join(';')
  );

  for (let i = 0; i < 12; i++) {
    lines.push(
      [
        months[i],
        res.horizontal.gdm0[i] !== undefined ? formatNum(res.horizontal.gdm0[i], 3) : '',
        res.optimalAnnual.monthlyDailyKwh[i] !== undefined ? formatNum(res.optimalAnnual.monthlyDailyKwh[i], 3) : '',
        res.monthlyOptimum12.monthlyDailyKwh[i] !== undefined ? formatNum(res.monthlyOptimum12.monthlyDailyKwh[i], 3) : '',
        String(res.monthlyOptimum12.optimalTiltsDeg[i] ?? ''),
        res.temperatures.ambient.monthlyMeanC[i] !== undefined ? formatNum(res.temperatures.ambient.monthlyMeanC[i], 1) : '',
        res.temperatures.cellOperating.monthlyCellTempOptimalC[i] !== undefined ? formatNum(res.temperatures.cellOperating.monthlyCellTempOptimalC[i], 1) : '',
        formatInt(res.energyYield.producida.osterwald.monthlyKwh[i] ?? 0),
        formatInt(res.energyYield.producida.simplified.monthlyKwh[i] ?? 0),
      ].join(';')
    );
  }
  lines.push('');

  // 4. 8 Surfaces Benchmark Comparison Table
  lines.push('----------------------------------------------------------------------');
  lines.push(isEn ? 'ALL 8 SOLAR COLLECTOR TOPOLOGIES BENCHMARK' : 'COMPARATIVA GLOBAL DE LAS 8 TOPOLOGÍAS DE CAPTACIÓN');
  lines.push('----------------------------------------------------------------------');
  lines.push(
    [
      isEn ? 'Topology' : 'Superficie / Topología',
      isEn ? 'Type' : 'Tipo',
      isEn ? 'Daily Mean Rad (kWh/m2/d)' : 'Rad Media Diaria (kWh/m2/d)',
      isEn ? 'Annual Irradiation (kWh/m2/yr)' : 'Irradiacion Anual (kWh/m2/año)',
      isEn ? 'Gain over Horiz (%)' : 'Ganancia s/ Horiz (%)',
      isEn ? 'Gain over Fixed Opt (%)' : 'Ganancia s/ Fijo Opt (%)',
      isEn ? 'PV Yield Osterwald (kWh/yr)' : 'Prod FV Osterwald (kWh/año)',
      isEn ? 'Mean Cell Temp (C)' : 'Temp Media Celula (C)',
    ].join(';')
  );

  for (const surf of res.surfaceComparison) {
    lines.push(
      [
        getSurfaceDisplayName(surf, isEn),
        getCategoryBadge(surf.category, isEn),
        surf.meanDailyKwhM2 !== null ? formatNum(surf.meanDailyKwhM2, 3) : '',
        formatInt(Math.round(surf.annualRadiationKwhM2)),
        formatPercent(surf.gainOverHorizontalPct, 2),
        formatPercent(surf.gainOverAnnualFixedPct, 2),
        formatInt(Math.round(surf.energyProducedOsterwaldKwhYear)),
        formatNum(surf.meanCellTempDegC, 1),
      ].join(';')
    );
  }
  lines.push('');

  // 5. CTE DB-HE4 Compliance Summary
  lines.push('----------------------------------------------------------------------');
  lines.push(isEn ? 'CTE DB-HE4 CAPTURE LOSS MATRIX SUMMARY' : 'RESUMEN DEL MAPA DE PÉRDIDAS CTE DB-HE4');
  lines.push('----------------------------------------------------------------------');
  lines.push(`${isEn ? 'Absolute Optimal Point' : 'Punto Óptimo Absoluto'};${isEn ? 'Tilt Beta' : 'Inclinación Beta'} = ${formatNum(res.captureLossMap.optimalPoint.betaDeg, 1)}° | ${isEn ? 'Azimuth Alpha' : 'Azimut Alpha'} = ${formatNum(res.captureLossMap.optimalPoint.alphaDeg, 1)}°`);
  lines.push(`${isEn ? 'Optimal Radiation' : 'Radiación Óptima'};${formatNum(res.captureLossMap.optimalPoint.maxDailyRadiationKwh, 3)} ${isEn ? 'kWh/m²/day' : 'kWh/m²/día'} (${formatInt(Math.round(res.captureLossMap.optimalPoint.maxAnnualRadiationKwhM2))} ${isEn ? 'kWh/m²·yr' : 'kWh/m²·año'})`);
  lines.push(`${isEn ? 'CTE General Limit (<=10% loss)' : 'Límite General CTE (Pérdida <= 10%)'};${formatPercent(res.captureLossMap.cteZones.generalPctCompliant, 1)} ${isEn ? 'of map' : 'del mapa'}`);
  lines.push(`${isEn ? 'CTE Superposition Limit (<=20% loss)' : 'Superposición CTE (Pérdida <= 20%)'};${formatPercent(res.captureLossMap.cteZones.superpositionPctCompliant, 1)} ${isEn ? 'of map' : 'del mapa'}`);
  lines.push(`${isEn ? 'CTE Integration Limit (<=40% loss)' : 'Integración Arquitectónica CTE (Pérdida <= 40%)'};${formatPercent(res.captureLossMap.cteZones.integrationPctCompliant, 1)} ${isEn ? 'of map' : 'del mapa'}`);

  const csvContent = BOM + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanName = res.locationName.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const fileName = `OrientSol_${cleanName}_${fileTimestamp}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Triggers PDF export / technical report printing via browser print dialog.
 */
export function exportToPDF(): void {
  window.print();
}

/**
 * Copies a structured technical summary to the system clipboard.
 */
export async function copyReportToClipboard(
  res: SolarBridgeSimulationResult,
  options?: { peakPowerKw?: number; performanceRatio?: number; isEn?: boolean }
): Promise<boolean> {
  const isEn = options?.isEn ?? false;
  const peakKw = options?.peakPowerKw ?? 5.0;
  const pr = options?.performanceRatio ?? 0.80;

  const text = `
======================================================================
ORIENTSOL 4.0 - ${isEn ? 'TECHNICAL SOLAR SIMULATION SUMMARY' : 'RESUMEN TÉCNICO DE SIMULACIÓN SOLAR'}
======================================================================
${isEn ? 'Location' : 'Localidad'}: ${res.locationName} (${formatNum(res.latitude, 2)}°, ${formatNum(res.longitude, 2)}°)
${isEn ? 'Data Source' : 'Fuente'}: ${res.source.toUpperCase()}
${isEn ? 'PV Peak Power' : 'Potencia Pico'}: ${formatNum(peakKw, 2)} kWp | PR: ${formatPercent(pr * 100, 0)}

1. ${isEn ? 'OPTIMAL FIXED TILT' : 'INCLINACIÓN FIJA ÓPTIMA'}:
   • ${isEn ? 'Annual Optimum' : 'Óptimo Anual'}: ${res.optimalAnnual.optimalTiltDeg}° (+${formatNum(res.optimalAnnual.gainOverHorizontalPct, 1)}% ${isEn ? 'vs Horiz' : 's/ Horizontal'})
   • ${isEn ? 'Daily Resource' : 'Recurso Medio Diario'}: ${formatNum(res.optimalAnnual.annualMeanDailyKwh, 2)} kWh/m²/día (${formatInt(res.optimalAnnual.annualTotalKwh)} kWh/m²·año)

2. ${isEn ? 'ENERGY YIELD BALANCE' : 'BALANCE ENERGÉTICO'}:
   • ${isEn ? 'Received Solar Energy' : 'Energía Solar Recibida'}: ${formatInt(res.energyYield.recibida.annualTotalKwh)} kWh/año
   • ${isEn ? 'Osterwald PV Production' : 'Producción FV Osterwald'}: ${formatInt(res.energyYield.producida.osterwald.annualKwh)} kWh/año
   • ${isEn ? 'Specific Yield' : 'Productividad Específica'}: ${formatInt(res.energyYield.producida.osterwald.specificYieldKwhKwp)} kWh/kWp
   • ${isEn ? 'Thermal Losses vs STC' : 'Pérdidas Térmicas'}: -${formatInt(Math.abs(res.energyYield.producida.osterwald.thermalLossKwh))} kWh (-${formatNum(Math.abs(res.energyYield.producida.osterwald.thermalLossPct), 2)}%)
   • ${isEn ? 'Operating Cell Temp' : 'Temp. Célula Operativa'}: ${formatNum(res.temperatures.cellOperating.meanCellTempOptimalC, 1)} °C (Máx: ${formatNum(res.temperatures.cellOperating.maxCellTempOptimalC, 1)} °C)

3. ${isEn ? 'SURFACES BENCHMARK RANKING' : 'RANKING DE RENDIMIENTO DE SUPERFICIES'}:
${res.surfaceComparison.map((s, idx) => `   ${idx + 1}. ${getSurfaceDisplayName(s, isEn)}: ${formatNum(s.meanDailyKwhM2, 3)} kWh/m²/d (${formatInt(s.annualRadiationKwhM2)} kWh/m²) | +${formatNum(s.gainOverHorizontalPct, 1)}% | Prod: ${formatInt(s.energyProducedOsterwaldKwhYear)} kWh/${isEn ? 'yr' : 'año'}`).join('\n')}

======================================================================
OrientSol 4.0 Web • ${new Date().toLocaleDateString()}
`.trim();

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
