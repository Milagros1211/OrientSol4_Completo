/**
 * OrientSol 4.0 - Pedagogical Guide Modal
 * Provides in-depth, didactic explanations and theoretical guidance
 * for all 4 climate ingestion tabs (Official Catalog, Manual Entry, File Import, and Satellite APIs),
 * as well as the Scientific Verification Suite.
 * Uses KaTeX to render all mathematical equations and physical symbols.
 */

import katex from 'katex';
import { themeManager } from '@/services/theme/themeManager';

function renderTex(expr: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return `<code>${expr}</code>`;
  }
}

let activePedagogicalModalEl: HTMLElement | null = null;

export function openPedagogicalGuideModal(
  tabKey: 'historical' | 'manual' | 'upload' | 'api' | 'verification',
  isEn: boolean = false
): void {
  if (activePedagogicalModalEl) {
    activePedagogicalModalEl.remove();
    activePedagogicalModalEl = null;
  }

  const modal = document.createElement('div');
  modal.className = 'modal-backdrop pedagogical-modal-backdrop';
  modal.id = 'pedagogical-guide-modal';
  modal.setAttribute('data-theme', themeManager.getTheme());

  const getContent = () => {
    switch (tabKey) {
      case 'historical':
        return {
          title: isEn
            ? `Pedagogical Guide: Official Catalog & Climate Variables (${renderTex('G_{dm}(0)')}, ${renderTex('T_{\\text{amb}}')})`
            : `Guía Didáctica: Catálogo Oficial (114 Estaciones) y Variables Físicas (${renderTex('G_{dm}(0)')}, ${renderTex('T_{\\text{amb}}')})`,
          subtitle: isEn
            ? 'Scientific methodology, physical meaning, and practical guidance for official meteorological records'
            : 'Metodología científica, significado físico y guía práctica de los registros oficiales',
          badge: isEn ? 'Official Benchmark Catalog' : 'Catálogo Oficial de Referencia',
          sections: [
            {
              heading: isEn ? '1. Key Physical Variables in Each Record' : '1. Variables Físicas Clave en Cada Registro',
              content: isEn
                ? `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>${renderTex('G_{dm}(0)')} [kWh/m²·day]:</strong> Monthly average daily global solar irradiation received on a horizontal surface. It integrates both direct beam sunlight (${renderTex('B_{dm}(0)')}) and atmospheric diffuse radiation (${renderTex('D_{dm}(0)')}): ${renderTex('G_{dm}(0) = B_{dm}(0) + D_{dm}(0)')}.</li>
                    <li><strong>${renderTex('T_{\\text{amb}}')} [°C]:</strong> Monthly average 24-hour ambient dry-bulb temperature in shade, used by the PV temperature derating model (NOCT / TONC).</li>
                    <li><strong>Latitude (${renderTex('\\phi')}) & Longitude (${renderTex('\\lambda')}) [°]:</strong> Precise geographic coordinates necessary for extraterrestrial solar geometry (declination ${renderTex('\\delta')}, sunset hour angle ${renderTex('\\omega_s')}, extraterrestrial radiation ${renderTex('G_{0d}')}).</li>
                  </ul>`
                : `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>${renderTex('G_{dm}(0)')} [kWh/m²·día]:</strong> Irradiación solar global media diaria sobre superficie horizontal para cada mes del año. Integra la radiación directa del disco solar (${renderTex('B_{dm}(0)')}) y la difusa dispersada por la atmósfera (${renderTex('D_{dm}(0)')}): ${renderTex('G_{dm}(0) = B_{dm}(0) + D_{dm}(0)')}.</li>
                    <li><strong>${renderTex('T_{\\text{amb}}')} [°C]:</strong> Temperatura media mensual del aire en sombra, fundamental para calcular las pérdidas térmicas en los módulos fotovoltaicos mediante el modelo TONC/NOCT.</li>
                    <li><strong>Latitud (${renderTex('\\phi')}) y Longitud (${renderTex('\\lambda')}) [°]:</strong> Coordenadas geográficas imprescindibles para la trigonometría astronómica: declinación solar (${renderTex('\\delta')}), ángulo horario de puesta del sol (${renderTex('\\omega_s')}) e irradiación extraterrestre diaria (${renderTex('G_{0d}')}).</li>
                  </ul>`,
            },
            {
              heading: isEn ? '2. Understanding Tags: [ORIENTSOL] vs [LOCAL CACHE]' : '2. Significado de las Etiquetas: [ORIENTSOL] vs [CACHÉ LOCAL]',
              content: isEn
                ? `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong style="color: #0284c7;">[ORIENTSOL]:</strong> Stations hosted in the official cloud database (Supabase) or compiled in the core canonical catalog. Fully verified and shared.</li>
                    <li><strong style="color: #d97706;">[LOCAL CACHE]:</strong> Custom user-uploaded files or offline records stored in your browser's private local storage. They remain fully available for calculation even without internet connection.</li>
                  </ul>`
                : `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong style="color: #0284c7;">[ORIENTSOL]:</strong> Emplazamientos oficiales verificados alojados en la nube (Supabase) o en el catálogo canónico del sistema. Son públicos y accesibles por cualquier usuario.</li>
                    <li><strong style="color: #d97706;">[CACHÉ LOCAL]:</strong> Emplazamientos importados por ti o guardados mientras no tenías conexión a Internet. Se almacenan de forma segura en tu navegador y están listos para calcular en cualquier momento.</li>
                  </ul>`,
            },
            {
              heading: isEn ? '3. Step-by-Step Simulation Flow' : '3. Flujo Didáctico para Simular',
              content: isEn
                ? 'Type your city name in the search box, click on the dropdown match or press "Select Station". The 12-month table updates instantly below. Then, adjust your system parameters (Peak Power, PR, Albedo) and click <strong>"Run Calculation Engine"</strong> to compute the optimal tilt and monthly energy yield.'
                : 'Escribe el nombre de tu ciudad en el buscador asistido, selecciona el resultado en la lista desplegable o pulsa «Seleccionar Estación». La tabla de 12 meses se actualizará de inmediato. Ajusta los parámetros del generador fotovoltaico (Potencia Pico, PR, Albedo) y haz clic en <strong>«Ejecutar Motor de Cálculo»</strong> para obtener la inclinación óptima y la energía producida.',
            },
          ],
        };

      case 'manual':
        return {
          title: isEn
            ? `Guía Didáctica: Entrada Manual, Geometría Solar y Física del Albedo (${renderTex('\\rho_g')})`
            : `Guía Didáctica: Entrada Manual, Geometría Solar y Física del Albedo (${renderTex('\\rho_g')})`,
          subtitle: isEn
            ? 'Understanding custom input parameters, ground reflectance, and physical validation ranges'
            : 'Fundamento teórico de los parámetros introducidos, reflectividad del terreno y límites físicos',
          badge: isEn ? 'Solar Geometry & Physics' : 'Física y Geometría Solar',
          sections: [
            {
              heading: isEn
                ? `1. Why are Geographic Coordinates (${renderTex('\\phi')}, ${renderTex('\\lambda')}) Essential?`
                : `1. ¿Por qué son indispensables las Coordenadas Geográficas (${renderTex('\\phi')}, ${renderTex('\\lambda')})?`,
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">Solar irradiation on an inclined collector depends directly on the position of the sun in the celestial dome. Knowing the exact Latitude (${renderTex('\\phi')}) and Longitude (${renderTex('\\lambda')}) allows OrientSol to compute the solar hour angle (${renderTex('\\omega_s')}), solar declination (${renderTex('\\delta')}), solar noon zenith angle, and extraterrestrial daily radiation (${renderTex('G_{0d}')}) through astronomical algorithms:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">${isEn ? 'Solar Declination (Cooper Model):' : 'Declinación Solar (Modelo de Cooper):'}</div>
                    ${renderTex('\\delta = 23{,}45^\\circ \\cdot \\sin\\left( \\frac{360^\\circ}{365}\\,(284 + n) \\right)', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin: 0.4rem 0 0.2rem 0;">${isEn ? 'Sunset Hour Angle & Astronomical Day Length:' : 'Ángulo Horario de Puesta y Duración del Día Solar:'}</div>
                    ${renderTex('\\cos\\omega_s = -\\tan\\phi \\cdot \\tan\\delta \\implies S_0 = \\frac{2\\,\\omega_s}{15^\\circ}', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin: 0.4rem 0 0.2rem 0;">${isEn ? 'Daily Extraterrestrial Horizontal Irradiation:' : 'Irradiación Extraterrestre Diaria sobre Plano Horizontal:'}</div>
                    ${renderTex('G_{0d} = \\frac{24}{\\pi}\\,I_{sc}\\left[1 + 0{,}033\\cos\\left(\\frac{360^\\circ n}{365}\\right)\\right]\\left(\\cos\\phi\\cos\\delta\\sin\\omega_s + \\frac{\\pi\\omega_s}{180^\\circ}\\sin\\phi\\sin\\delta\\right)', true)}
                  </div>`
                : `<p style="margin: 0 0 0.5rem 0;">La irradiación solar recibida por un colector inclinado depende directamente de la trayectoria astronómica del Sol en la bóveda celeste. Conocer la Latitud (${renderTex('\\phi')}) y Longitud (${renderTex('\\lambda')}) exactas permite a OrientSol calcular matemáticamente la declinación solar (${renderTex('\\delta')}), la hora de salida y puesta del sol (${renderTex('\\omega_s')}), el ángulo cenital y la radiación extraterrestre diaria (${renderTex('G_{0d}')}) para cada día medio mensual según la metodología de Liu-Jordan y Klein:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Declinación Solar (Modelo de Cooper):</div>
                    ${renderTex('\\delta = 23{,}45^\\circ \\cdot \\sin\\left( \\frac{360^\\circ}{365}\\,(284 + n) \\right)', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin: 0.4rem 0 0.2rem 0;">Ángulo Horario de Puesta y Duración del Día Solar:</div>
                    ${renderTex('\\cos\\omega_s = -\\tan\\phi \\cdot \\tan\\delta \\implies S_0 = \\frac{2\\,\\omega_s}{15^\\circ}', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin: 0.4rem 0 0.2rem 0;">Irradiación Extraterrestre Diaria sobre Plano Horizontal:</div>
                    ${renderTex('G_{0d} = \\frac{24}{\\pi}\\,I_{sc}\\left[1 + 0{,}033\\cos\\left(\\frac{360^\\circ n}{365}\\right)\\right]\\left(\\cos\\phi\\cos\\delta\\sin\\omega_s + \\frac{\\pi\\omega_s}{180^\\circ}\\sin\\phi\\sin\\delta\\right)', true)}
                  </div>`,
            },
            {
              heading: isEn
                ? `2. What is Ground Albedo (${renderTex('\\rho_g')}) and Which Value to Choose?`
                : `2. ¿Qué es el Albedo del Terreno (${renderTex('\\rho_g')}) y qué valor asignar?`,
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">The ground albedo (${renderTex('\\rho_g')}) is the dimensionless reflectance coefficient measuring the fraction of global solar radiation reflected by the surrounding terrain towards the tilted surface of the photovoltaic collector:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #059669; margin-bottom: 0.2rem;">Ground-Reflected Radiation on Tilted Plane (Liu-Jordan Model):</div>
                    ${renderTex('R_r(\\beta) = G_{dm}(0) \\cdot \\rho_g \\cdot \\left( \\frac{1 - \\cos\\beta}{2} \\right)', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin: 0.45rem 0 0.2rem 0;">Total Isotropic Transposition to Tilted Surface β:</div>
                    ${renderTex('G_{dm}(\\beta) = B_{dm}(0)\\,R_b + D_{dm}(0)\\left( \\frac{1 + \\cos\\beta}{2} \\right) + G_{dm}(0)\\,\\rho_g\\left( \\frac{1 - \\cos\\beta}{2} \\right)', true)}
                    <div style="font-size: 0.70rem; color: var(--text-muted); margin-top: 0.35rem; line-height: 1.45;">
                      Where ${renderTex('F_{\\text{ground}} = \\frac{1 - \\cos\\beta}{2}')} represents the geometric ground view factor. For a horizontal surface (${renderTex('\\beta = 0^\\circ')}), ${renderTex('F = 0')} (it cannot see the ground). When tilted vertically at ${renderTex('\\beta = 90^\\circ')} (such as BIPV façades), it views 50% of the terrain (${renderTex('F = 0{,}50')}), making ground albedo (e.g. snow ${renderTex('\\rho_g = 0{,}80')}) a major contributor to energy yield.
                    </div>
                  </div>
                  <div style="max-height: 290px; overflow-x: auto; overflow-y: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-top: 0.45rem;">
                    <table class="albedo-solargis-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                      <thead>
                        <tr>
                          <th style="padding: 0.35rem 0.65rem; text-align: left;">Surface type</th>
                          <th style="padding: 0.35rem 0.65rem; text-align: right;">Typical value (${renderTex('\\rho_g')})</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Fresh asphalt</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.03 – 0.04</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Open ocean</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.06</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Conifer forest (summer)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.08 – 0.15</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Worn asphalt</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.12</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Deciduous trees</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.15 – 0.18</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Sand</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.15 – 0.45</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Tundra</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.18 – 0.25</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Agricultural crops</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.18 – 0.25</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Bare soil</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.17</td></tr>
                        <tr style="background: rgba(2, 132, 199, 0.08);"><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);"><strong>Green grass (OrientSol default ${renderTex('\\rho_g = 0{,}20')})</strong></td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: 800; font-family: var(--font-mono); color: #0284c7; border-bottom: 1px solid var(--border-subtle);">0.20 – 0.25</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Desert sand</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.30 – 0.40</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Snow</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.40 – 0.90</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Ocean ice</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0.50 – 0.70</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem;">Fresh snow</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono);">0.80 – 0.90</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div style="margin-top: 0.55rem; font-size: 0.74rem; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                    <span style="opacity: 0.85;">Reference link:</span>
                    <a href="https://solargis.com/resources/blog/product-updates/surface-albedo-most-frequent-questions" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: underline; font-weight: 700;">Surface Albedo – most frequent questions | Solargis</a>
                  </div>`
                : `<p style="margin: 0 0 0.5rem 0;">El albedo del terreno (${renderTex('\\rho_g')}) es el coeficiente adimensional que mide la fracción de radiación solar global reflejada por el entorno hacia la superficie inclinada del panel fotovoltaico:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #059669; margin-bottom: 0.2rem;">Componente Reflejada del Suelo (Modelo de Liu-Jordan):</div>
                    ${renderTex('R_r(\\beta) = G_{dm}(0) \\cdot \\rho_g \\cdot \\left( \\frac{1 - \\cos\\beta}{2} \\right)', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin: 0.45rem 0 0.2rem 0;">Ecuación Global de Transposición a Superficie Inclinada β:</div>
                    ${renderTex('G_{dm}(\\beta) = B_{dm}(0)\\,R_b + D_{dm}(0)\\left( \\frac{1 + \\cos\\beta}{2} \\right) + G_{dm}(0)\\,\\rho_g\\left( \\frac{1 - \\cos\\beta}{2} \\right)', true)}
                    <div style="font-size: 0.70rem; color: var(--text-muted); margin-top: 0.35rem; line-height: 1.45;">
                      Donde ${renderTex('F_{\\text{suelo}} = \\frac{1 - \\cos\\beta}{2}')} representa el factor de vista del terreno. En colector horizontal (${renderTex('\\beta = 0^\\circ')}), ${renderTex('F = 0')} (el panel solo mira al cielo). En colector vertical (${renderTex('\\beta = 90^\\circ')} o fachada BIPV), el factor de vista alcanza el 50% (${renderTex('F = 0{,}50')}), por lo que sobre nieve (${renderTex('\\rho_g = 0{,}80')}) la radiación reflejada aporta más del 30% de la energía incidente total.
                    </div>
                  </div>
                  <div style="max-height: 290px; overflow-x: auto; overflow-y: auto; -webkit-overflow-scrolling: touch; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-top: 0.45rem;">
                    <table class="albedo-solargis-table" style="width: 100%; border-collapse: collapse; text-align: left;">
                      <thead>
                        <tr>
                          <th style="padding: 0.35rem 0.65rem; text-align: left;">Tipo de superficie / terreno</th>
                          <th style="padding: 0.35rem 0.65rem; text-align: right;">Valor típico (${renderTex('\\rho_g')})</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Asfalto fresco (<em>Fresh asphalt</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,03 – 0,04</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Océano abierto (<em>Open ocean</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,06</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Bosque de coníferas en verano (<em>Conifer forest</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,08 – 0,15</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Asfalto desgastado (<em>Worn asphalt</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,12</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Árboles caducifolios (<em>Deciduous trees</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,15 – 0,18</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Arena (<em>Sand</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,15 – 0,45</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Tundra (<em>Tundra</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,18 – 0,25</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Cultivos agrícolas (<em>Agricultural crops</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,18 – 0,25</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Suelo desnudo (<em>Bare soil</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,17</td></tr>
                        <tr style="background: rgba(2, 132, 199, 0.08);"><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);"><strong>Césped verde / Hierba (Estándar OrientSol ${renderTex('\\rho_g = 0{,}20')})</strong></td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: 800; font-family: var(--font-mono); color: #0284c7; border-bottom: 1px solid var(--border-subtle);">0,20 – 0,25</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Arena del desierto (<em>Desert sand</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,30 – 0,40</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Nieve (<em>Snow</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,40 – 0,90</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem; border-bottom: 1px solid var(--border-subtle);">Hielo oceánico (<em>Ocean ice</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono); border-bottom: 1px solid var(--border-subtle);">0,50 – 0,70</td></tr>
                        <tr><td style="padding: 0.28rem 0.65rem;">Nieve fresca (<em>Fresh snow</em>)</td><td style="padding: 0.28rem 0.65rem; text-align: right; font-weight: bold; font-family: var(--font-mono);">0,80 – 0,90</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div style="margin-top: 0.55rem; font-size: 0.74rem; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
                    <span style="opacity: 0.85;">Fuente de referencia:</span>
                    <a href="https://solargis.com/resources/blog/product-updates/surface-albedo-most-frequent-questions" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: underline; font-weight: 700;">Surface Albedo – most frequent questions | Solargis</a>
                  </div>`,
            },
            {
              heading: isEn ? '3. Audited Physical Plausibility Ranges' : '3. Rangos de Coherencia Física Auditados',
              content: isEn
                ? `To ensure scientific validity and protect against calculation errors, OrientSol enforces strict bounds:
                  <ul style="margin: 0.35rem 0 0 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>Horizontal Solar Irradiation:</strong> ${renderTex('G_{dm}(0) \\in [0{,}05, \\; 14{,}0]\\text{ kWh/m}^2\\cdot\\text{d}')} and cannot exceed the physical extraterrestrial ceiling: ${renderTex('G_{dm}(0) \\le G_{0d} + 0{,}05\\text{ kWh/m}^2\\cdot\\text{d}')}.</li>
                    <li><strong>Ambient Temperature:</strong> ${renderTex('T_{\\text{amb}} \\in [-50^\\circ\\text{C}, \\; +65^\\circ\\text{C}')}.</li>
                    <li><strong>Ground Albedo:</strong> ${renderTex('\\rho_g \\in [0{,}00, \\; 1{,}00]')}.</li>
                  </ul>`
                : `Para garantizar la validez científica y evitar errores de simulación, OrientSol verifica en tiempo real que:
                  <ul style="margin: 0.35rem 0 0 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>Irradiación Horizontal:</strong> ${renderTex('G_{dm}(0) \\in [0{,}05, \\; 14{,}0]\\text{ kWh/m}^2\\cdot\\text{día}')} y nunca puede superar el techo físico extraterrestre: ${renderTex('G_{dm}(0) \\le G_{0d} + 0{,}05\\text{ kWh/m}^2\\cdot\\text{d}')}.</li>
                    <li><strong>Temperatura Ambiente:</strong> ${renderTex('T_{\\text{amb}} \\in [-50^\\circ\\text{C}, \\; +65^\\circ\\text{C}')}.</li>
                    <li><strong>Albedo del Suelo:</strong> ${renderTex('\\rho_g \\in [0{,}00, \\; 1{,}00]')}.</li>
                  </ul>`,
            },
            {
              heading: isEn ? '4. Dual Saving Action: Local vs Cloud' : '4. Acciones de Guardado: Aplicar vs Guardar en Supabase',
              content: isEn
                ? 'Clicking <strong>"Apply Manual Data"</strong> loads the dataset directly into the local calculation engine memory. If you click <strong>"Save to Supabase"</strong>, the station is permanently registered in the official database (datos_mensuales) and will become available in the catalog under [ORIENTSOL].'
                : 'Al pulsar <strong>«Aplicar Datos Manuales»</strong> los datos se inyectan de inmediato en la tarjeta activa para simular con el motor de cálculo. Si pulsas <strong>«Guardar en Supabase»</strong>, el emplazamiento se registra de forma persistente en la nube (tabla datos_mensuales) y pasará a formar parte del catálogo general bajo la etiqueta [ORIENTSOL].',
            },
          ],
        };

      case 'upload':
        return {
          title: isEn
            ? 'Pedagogical Guide: Digital File Import, Formats & Dual Sync'
            : 'Guía Didáctica: Importación Digital CSV/JSON y Sincronización Dual',
          subtitle: isEn
            ? 'File formatting rules, multi-station batch structure, and direct in-place calculation'
            : 'Estructura de archivos, procesamiento de lotes multi-estación y cálculo directo in situ',
          badge: isEn ? 'Standard Digital Formats' : 'Formatos Digitales Normalizados',
          sections: [
            {
              heading: isEn ? '1. Supported File Formats (CSV & JSON)' : '1. Formatos Compatibles (CSV y JSON)',
              content: isEn
                ? 'You can import solar measurements using standard UTF-8 text files (.csv, .json, .txt). Both decimal points (.) and decimal commas (,) are automatically recognized. You can download pre-formatted single-station or multi-station batch templates directly using the buttons above the dropzone.'
                : 'Puedes importar tus mediciones solares mediante archivos de texto estándar UTF-8 (.csv, .json, .txt). El analizador automático detecta tanto puntos decimales (.) como comas decimales (,). Recomendamos descargar las plantillas de ejemplo (individual o lote multi-estación) mediante los botones situados sobre la zona de arrastre.',
            },
            {
              heading: isEn ? '2. Required File Structure' : '2. Estructura Requerida de las Mediciones',
              content: isEn
                ? `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>Location Name:</strong> Name of the facility, city, or year (e.g. <em>Lima2025</em>).</li>
                    <li><strong>Coordinates:</strong> Latitude (${renderTex('\\phi')}) and Longitude (${renderTex('\\lambda')}) in decimal degrees.</li>
                    <li><strong>12 Monthly ${renderTex('G_{dm}(0)')} values:</strong> January through December in kWh/m²·day.</li>
                    <li><strong>12 Monthly ${renderTex('T_{\\text{amb}}')} values:</strong> Ambient temperature in °C.</li>
                  </ul>`
                : `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>Nombre del Emplazamiento:</strong> Identificador de la estación, localidad o año de medición (ej. <em>Lima2025</em>, <em>Sevilla</em>).</li>
                    <li><strong>Coordenadas Geográficas:</strong> Latitud (${renderTex('\\phi')}) y Longitud (${renderTex('\\lambda')}) en grados decimales.</li>
                    <li><strong>12 Valores de ${renderTex('G_{dm}(0)')}:</strong> Irradiación diaria de Enero a Diciembre en kWh/m²·día.</li>
                    <li><strong>12 Valores de ${renderTex('T_{\\text{amb}}')}:</strong> Temperatura ambiente media mensual en °C.</li>
                  </ul>`,
            },
            {
              heading: isEn ? '3. Multi-Station Batch Processing' : '3. Procesamiento de Lotes Multi-Estación',
              content: isEn
                ? 'If your file contains multiple stations (e.g. Arequipa, Cusco, Piura), OrientSol will read and validate all of them simultaneously. Clickable station pills will appear immediately below, allowing you to switch between stations with a single click.'
                : 'Si tu archivo contiene múltiples emplazamientos en un solo documento (ej. un lote con Arequipa, Cusco y Piura), OrientSol los procesará y validará todos en bloque. Aparecerán botones (pills) de selección rápida para alternar entre estaciones con un solo clic.',
            },
            {
              heading: isEn ? '4. Instant Direct Selection & Simulation' : '4. Selección Inmediata y Simulación Directa In Situ',
              content: isEn
                ? 'No need to leave this section to calculate! The station selector and interactive quick-pills appear directly below the dropzone. Selecting any station instantly updates the active dataset, allowing you to run the calculation engine on the spot.'
                : '¡Puedes calcular directamente sin necesidad de cambiar de sección! Inmediatamente tras cargar o sincronizar tu archivo, el selector de texto y las píldoras interactivas aparecen aquí mismo. Al elegir cualquier emplazamiento, se actualiza la tarjeta activa y puedes pulsar directamente «Ejecutar Motor de Cálculo» en la barra inferior.',
            },
          ],
        };

      case 'api':
        return {
          title: isEn
            ? 'Pedagogical Guide: Satellite Solar Databases (PVGIS, NASA & Open-Meteo)'
            : 'Guía Didáctica: Redes Satelitales y Reanálisis (PVGIS, NASA y Open-Meteo)',
          subtitle: isEn
            ? 'Atmospheric radiative transfer models, orbital sensors, and global solar exploration'
            : 'Modelos de transferencia radiativa, sensores orbitales y exploración solar global',
          badge: isEn ? 'Global Satellite Networks' : 'Redes Satelitales Globales',
          sections: [
            {
              heading: isEn ? '1. Understanding Satellite Radiometric Networks' : '1. Fundamento de las Redes Satelitales Disponibles',
              content: isEn
                ? `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>PVGIS 5.3 (EU Joint Research Centre):</strong> Highly accurate solar radiation database for Europe, Africa, parts of Asia and the Americas, primarily based on geostationary Meteosat SARAH2/SARAH3 and CMSAF sensors.</li>
                    <li><strong>NASA POWER:</strong> Global coverage from the NASA Langley Research Center, combining satellite observations (CERES, MODIS) with Goddard Earth Observing System (GEOS) models.</li>
                    <li><strong>Open-Meteo (ECMWF ERA5):</strong> State-of-the-art climate reanalysis combining atmospheric physics with millions of worldwide observations, providing continuous hourly and monthly means.</li>
                  </ul>`
                : `<ul style="margin: 0; padding-left: 1.15rem; line-height: 1.6;">
                    <li><strong>PVGIS 5.3 (Comisión Europea - JRC):</strong> Estándar europeo de referencia para energía solar. Emplea las bases satelitales SARAH/SARAH2 y modelos CMSAF sobre satélites geoestacionarios Meteosat, con altísima fidelidad en Europa, África y América.</li>
                    <li><strong>NASA POWER (NASA Langley Research Center):</strong> Cobertura global integral basada en sensores orbitales (CERES, MODIS) combinados con modelos de asimilación atmosférica GEOS de la NASA.</li>
                    <li><strong>Open-Meteo (ECMWF ERA5 Reanálisis):</strong> El reanálisis meteorológico más avanzado del Centro Europeo de Previsiones Meteorológicas, con malla global física continua.</li>
                  </ul>`,
            },
            {
              heading: isEn ? '2. How Satellites Measure Ground Radiation' : '2. ¿Cómo miden la radiación solar los satélites espaciales?',
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">Geostationary satellites do not carry pyranometers on the ground; instead, optical and infrared radiometers measure the solar reflectance (albedo) of clouds and aerosols. Radiative transfer algorithms compute atmospheric absorption and cloud optical depth to calculate the exact global horizontal irradiance ${renderTex('G_{dm}(0)')} reaching ground level:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.55rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Heliosat Atmospheric Attenuation & Clearness Index:</div>
                    ${renderTex('K_t = \\frac{G_{dm}(0)}{G_{0d}} \\implies G_{dm}(0) = K_t \\cdot G_{0d}', true)}
                  </div>`
                : `<p style="margin: 0 0 0.5rem 0;">Los satélites geoestacionarios no disponen de piranómetros en la superficie; en su lugar, sus radiómetros ópticos e infrarrojos miden la reflectividad de las nubes y aerosoles en el tope de la atmósfera. Mediante modelos matemáticos de transferencia radiativa (como el modelo Heliosat), el sistema deduce la atenuación de la luz y calcula con precisión la radiación global en plano horizontal ${renderTex('G_{dm}(0)')} que alcanza el suelo:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.55rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Atenuación Atmosférica Heliosat e Índice de Claridad:</div>
                    ${renderTex('K_t = \\frac{G_{dm}(0)}{G_{0d}} \\implies G_{dm}(0) = K_t \\cdot G_{0d}', true)}
                  </div>`,
            },
            {
              heading: isEn ? '3. Step-by-Step Satellite Query Flow' : '3. Flujo Práctico de Consulta e Ingesta',
              content: isEn
                ? 'Select your preferred data source, pick a preset city or enter custom Latitude and Longitude. Press <strong>"Fetch Satellite Climate"</strong> to download the 12-month series through our secure edge proxy. The results immediately feed the active table for calculations. Press <strong>"Save to Supabase"</strong> to store it in the cloud catalog under [ORIENTSOL].'
                : 'Selecciona el proveedor satelital deseado, elige una ciudad predefinida o introduce las coordenadas exactas de tu proyecto. Pulsa <strong>«Consultar Climatología»</strong> para descargar la serie mensual mediante el proxy seguro. Los datos alimentan de inmediato la tarjeta activa para simular con el motor de cálculo. Pulsa <strong>«Guardar en Supabase»</strong> para conservarlo en la nube bajo la etiqueta [ORIENTSOL].',
            },
            {
              heading: isEn ? '4. Connectivity & Operational Limits' : '4. Conexión a Internet y Seguridad de Acceso',
              content: isEn
                ? 'Satellite API queries require an active Internet connection to contact European and American space servers. When working offline, use the Official Catalog, the Manual Form, or previously cached files.'
                : 'La consulta satelital requiere conexión a Internet para enlazar con los centros de datos de la Comisión Europea y la NASA. Si estás en campo sin cobertura, puedes utilizar el Catálogo Oficial, la Entrada Manual o tus archivos locales previamente guardados.',
            },
          ],
        };

      case 'verification':
        return {
          title: isEn
            ? 'Pedagogical Guide: Scientific Verification & Mathematical Engines'
            : 'Guía Didáctica: Verificación Científica y Motores Matemáticos',
          subtitle: isEn
            ? 'Theoretical validation procedure, analytical equations, temporal symmetry, and WMO-No. 8 calibration'
            : 'Procedimiento de validación teórica, ecuaciones analíticas, simetría temporal y calibración OMM / PVGIS',
          badge: isEn ? 'Scientific Engine Validation' : 'Validación Científica & OMM',
          sections: [
            {
              heading: isEn
                ? `1. Solar Celestial Sphere & Temporal Mirror Symmetry`
                : `1. Trigonometría de la Esfera Celeste y Ley Física de Simetría Temporal`,
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">OrientSol computes the astronomical solar vector at every hour of the day. The position of the Sun is defined by its Solar Altitude (${renderTex('\\alpha_s')}) and Solar Azimuth (${renderTex('\\psi_s')}) relative to the local meridian:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Hourly Solar Altitude & Solar Azimuth:</div>
                    ${renderTex('\\sin\\alpha_s = \\sin\\phi\\sin\\delta + \\cos\\phi\\cos\\delta\\cos\\omega', true)}
                    ${renderTex('\\cos\\psi_s = \\frac{\\sin\\alpha_s\\sin\\phi - \\sin\\delta}{\\cos\\alpha_s\\cos\\phi}', true)}
                  </div>
                  <p style="margin: 0.4rem 0 0 0; line-height: 1.5;"><strong>Universal Law of Solar Symmetry:</strong> Solar noon (12:00 h, ${renderTex('\\omega = 0^\\circ')}) behaves as a perfect astronomical mirror. At hours equidistant from noon (${renderTex('12 - \\Delta t')} vs. ${renderTex('12 + \\Delta t')}), the solar altitude ${renderTex('\\alpha_s')} and dual-axis collector tilt ${renderTex('\\beta = 90^\\circ - \\alpha_s')} are identical, while the azimuth ${renderTex('\\psi_s')} has the exact same angular magnitude with opposite direction (- East in the morning vs. + West in the afternoon).</p>`
                : `<p style="margin: 0 0 0.5rem 0;">OrientSol modela el vector solar instantáneo en cada hora del día mediante trigonometría esférica astronómica. La posición del Sol se define por su Altura Solar (${renderTex('\\alpha_s')}) y su Azimut Solar (${renderTex('\\psi_s')}):</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Altura Solar Horaria y Azimut Solar:</div>
                    ${renderTex('\\sin\\alpha_s = \\sin\\phi\\sin\\delta + \\cos\\phi\\cos\\delta\\cos\\omega', true)}
                    ${renderTex('\\cos\\psi_s = \\frac{\\sin\\alpha_s\\sin\\phi - \\sin\\delta}{\\cos\\alpha_s\\cos\\phi}', true)}
                  </div>
                  <p style="margin: 0.4rem 0 0 0; line-height: 1.5;"><strong>Ley Universal de Simetría Solar:</strong> El mediodía solar (12:00 h, ${renderTex('\\omega = 0^\\circ')}) actúa como un espejo astronómico exacto. A horas equidistantes del mediodía (${renderTex('12 - \\Delta t')} vs. ${renderTex('12 + \\Delta t')}), la altura solar ${renderTex('\\alpha_s')} y la inclinación del seguidor a 2 ejes ${renderTex('\\beta = 90^\\circ - \\alpha_s')} son rigurosamente idénticas, y el azimut ${renderTex('\\psi_s')} tiene la misma apertura angular con signo reflejado (- Este por la mañana vs. + Oeste por la tarde).</p>`,
            },
            {
              heading: isEn
                ? `2. Klein (1977) Characteristic Intermediate Days (12-Month Baseline)`
                : `2. Metodología de Días Medios de Klein (1977) y Línea Base de 12 Meses`,
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">Simulating 8,760 hours individually across 365 days is computationally heavy. S. A. Klein (1977) proved that computing the solar geometry on one specific characteristic day (${renderTex('n_m')}) per month accurately reproduces the integrated monthly extraterrestrial radiation (${renderTex('\\overline{G}_{0d}')}) with under 0.5% error:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.55rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: #059669; margin-bottom: 0.2rem;">Characteristic Days Vector (Klein, 1977):</div>
                    ${renderTex('n_m \\in \\{17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344\\}', true)}
                  </div>`
                : `<p style="margin: 0 0 0.5rem 0;">Simular las 8.760 horas del año día a día resulta computacionalmente pesado en ingeniería solar. S. A. Klein (1977) demostró que calcular la geometría solar sobre un día medio característico (${renderTex('n_m')}) en cada mes reproduce la irradiación extraterrestre acumulada mensual (${renderTex('\\overline{G}_{0d}')}) con un error inferior al 0,5%:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.55rem 0.75rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.72rem; font-weight: 700; color: #059669; margin-bottom: 0.2rem;">Vector de Días Medios Característicos (Klein, 1977):</div>
                    ${renderTex('n_m \\in \\{17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344\\}', true)}
                  </div>`,
            },
            {
              heading: isEn
                ? `3. Liu-Jordan Radiative Decomposition & WMO-No. 8 Validation`
                : `3. Descomposición Radiativa de Liu-Jordan y Calibración según Norma OMM Nº 8`,
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">OrientSol separates horizontal global radiation into direct beam (${renderTex('B_{dm}(0)')}) and diffuse (${renderTex('D_{dm}(0)')}) components, transposes them to slope ${renderTex('\\beta')}, and benchmarks against European Commission PVGIS satellite data under World Meteorological Organization (WMO) standards:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Liu-Jordan Decomposition:</div>
                    ${renderTex('K_t = \\frac{G_{dm}(0)}{G_{0d}}, \\quad K_d = 1{,}0 - 1{,}13\\,K_t \\implies D_{dm} = K_d \\cdot G_{dm}(0), \\quad B_{dm} = G_{dm}(0) - D_{dm}', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #059669; margin: 0.4rem 0 0.2rem 0;">WMO-No. 8 Relative Percentage Deviation Audit:</div>
                    ${renderTex('\\text{Dev}(\\%) = \\frac{|G_{dm}^{\\text{OS}}(\\beta_{opt}) - G_{dm}^{\\text{PVGIS}}(\\beta_{opt})|}{G_{dm}^{\\text{PVGIS}}(\\beta_{opt})} \\times 100', true)}
                  </div>`
                : `<p style="margin: 0 0 0.5rem 0;">OrientSol descompone la radiación horizontal en directa (${renderTex('B_{dm}(0)')}) y difusa (${renderTex('D_{dm}(0)}')}), las transpone a la inclinación ${renderTex('\\beta')} y las audita frente a los registros satelitales de PVGIS bajo los criterios de la Organización Meteorológica Mundial (OMM):</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #0284c7; margin-bottom: 0.2rem;">Descomposición de Liu-Jordan:</div>
                    ${renderTex('K_t = \\frac{G_{dm}(0)}{G_{0d}}, \\quad K_d = 1{,}0 - 1{,}13\\,K_t \\implies D_{dm} = K_d \\cdot G_{dm}(0), \\quad B_{dm} = G_{dm}(0) - D_{dm}', true)}
                    <div style="font-size: 0.73rem; font-weight: 700; color: #059669; margin: 0.4rem 0 0.2rem 0;">Auditoría de Desviación Porcentual Relativa OMM Nº 8:</div>
                    ${renderTex('\\text{Desv}(\\%) = \\frac{|G_{dm}^{\\text{OS}}(\\beta_{opt}) - G_{dm}^{\\text{PVGIS}}(\\beta_{opt})|}{G_{dm}^{\\text{PVGIS}}(\\beta_{opt})} \\times 100', true)}
                  </div>`,
            },
            {
              heading: isEn
                ? `4. Tracking Topologies & Osterwald Cell Thermal Derating`
                : `4. Topologías de Seguimiento Solar y Pérdidas Térmicas de Osterwald`,
              content: isEn
                ? `<p style="margin: 0 0 0.5rem 0;">Capturing solar energy with tracking collectors increases annual yield significantly (up to +45% with 2-axis tracking). Meanwhile, photovoltaic cell operating temperature (${renderTex('T_c')}) reduces conversion efficiency according to the Osterwald thermal model:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #2563eb; margin-bottom: 0.2rem;">Osterwald Cell Temperature & Thermal Losses:</div>
                    ${renderTex('T_c = T_{\\text{amb}} + \\left( \\frac{\\text{TONC} - 20^\\circ\\text{C}}{800\\text{ W/m}^2} \\right) \\cdot G_{\\text{eff}}', true)}
                    ${renderTex('P_{\\text{mp}} = P_{\\text{stc}} \\cdot \\frac{G_{\\text{eff}}}{1000} \\cdot \\left[ 1 + \\gamma \\,(T_c - 25^\\circ\\text{C}) \\right], \\quad \\gamma \\approx -0{,}40\\%/^\\circ\\text{C}', true)}
                  </div>`
                : `<p style="margin: 0 0 0.5rem 0;">El seguimiento solar incrementa la captación anual de energía (hasta un +45% a dos ejes). Paralelamente, la temperatura real de operación de la célula fotovoltaica (${renderTex('T_c')}) reduce la potencia entregada según el modelo térmico de Osterwald:</p>
                  <div class="math-formula-box" style="margin: 0.5rem 0; padding: 0.6rem 0.8rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px;">
                    <div style="font-size: 0.73rem; font-weight: 700; color: #2563eb; margin-bottom: 0.2rem;">Temperatura de Célula y Derating Térmico de Osterwald:</div>
                    ${renderTex('T_c = T_{\\text{amb}} + \\left( \\frac{\\text{TONC} - 20^\\circ\\text{C}}{800\\text{ W/m}^2} \\right) \\cdot G_{\\text{eff}}', true)}
                    ${renderTex('P_{\\text{mp}} = P_{\\text{stc}} \\cdot \\frac{G_{\\text{eff}}}{1000} \\cdot \\left[ 1 + \\gamma \\,(T_c - 25^\\circ\\text{C}) \\right], \\quad \\gamma \\approx -0{,}40\\%/^\\circ\\text{C}', true)}
                  </div>`,
            },
          ],
        };
    }
  };

  const data = getContent();

  modal.innerHTML = `
    <div class="modal-dialog pedagogical-dialog" role="dialog" aria-modal="true" aria-labelledby="pedagogical-modal-title" style="max-width: 780px; width: 94%; border-radius: 14px; overflow: hidden; box-shadow: 0 20px 45px rgba(0, 0, 0, 0.35); background: var(--bg-card, #ffffff); border: 1.5px solid var(--border-subtle, #cbd5e1); animation: modalFadeIn 0.25s ease-out;">
      <!-- Header -->
      <div class="modal-header" style="background: linear-gradient(135deg, rgba(2, 132, 199, 0.08), rgba(14, 165, 233, 0.02)); padding: 1.15rem 1.4rem; border-bottom: 1.5px solid var(--border-subtle, #cbd5e1); display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem;">
        <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(2, 132, 199, 0.15); color: #0284c7; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 0.1rem;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <h3 id="pedagogical-modal-title" style="margin: 0; font-size: 1.05rem; font-weight: 800; color: var(--text-main, #0f172a);">
                ${data.title}
              </h3>
              <span class="badge" style="background: rgba(2, 132, 199, 0.15); color: #0284c7; border: 1px solid rgba(2, 132, 199, 0.3); font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 9999px;">
                ${data.badge}
              </span>
            </div>
            <p style="margin: 0.25rem 0 0 0; font-size: 0.76rem; color: var(--text-muted, #64748b); line-height: 1.4;">
              ${data.subtitle}
            </p>
          </div>
        </div>
        <button type="button" class="btn-close-pedagogical" aria-label="${isEn ? 'Close' : 'Cerrar'}" style="background: transparent; border: none; font-size: 1.35rem; color: var(--text-muted, #64748b); cursor: pointer; padding: 0.2rem 0.45rem; line-height: 1; border-radius: 6px; transition: all 0.2s;">
          &times;
        </button>
      </div>

      <!-- Body with rounded pedagogical concept cards -->
      <div class="modal-body" style="padding: 1.25rem 1.4rem; max-height: 68vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem;">
        ${data.sections
          .map(
            (s) => `
            <div class="pedagogical-section-card" style="background: var(--bg-primary, rgba(248, 250, 252, 0.75)); border: 1px solid var(--border-subtle, #e2e8f0); border-left: 3.5px solid #0284c7; border-radius: 10px; padding: 0.85rem 1rem;">
              <h4 style="margin: 0 0 0.35rem 0; font-size: 0.86rem; font-weight: 700; color: #0284c7;">
                ${s.heading}
              </h4>
              <div style="font-size: 0.76rem; color: var(--text-main, #334155); line-height: 1.55;">
                ${s.content}
              </div>
            </div>
          `
          )
          .join('')}
      </div>

      <!-- Footer -->
      <div class="modal-footer" style="padding: 0.85rem 1.4rem; border-top: 1px solid var(--border-subtle, #cbd5e1); background: var(--bg-card, #ffffff); display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-primary btn-close-pedagogical" style="padding: 0.4rem 1.1rem; font-size: 0.82rem; font-weight: 700; border-radius: 8px;">
          ${isEn ? 'Understood' : 'Entendido'}
        </button>
      </div>
    </div>
  `;

  const close = () => {
    modal.classList.add('fade-out');
    setTimeout(() => {
      modal.remove();
      if (activePedagogicalModalEl === modal) activePedagogicalModalEl = null;
    }, 200);
  };

  modal.querySelectorAll('.btn-close-pedagogical').forEach((btn) => {
    btn.addEventListener('click', close);
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKeyDown);
    }
  };
  window.addEventListener('keydown', onKeyDown);

  document.body.appendChild(modal);
  activePedagogicalModalEl = modal;
}
