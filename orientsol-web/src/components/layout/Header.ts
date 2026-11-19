import { pyodideService } from '@/services/pyodide';
import { climateDatabaseService } from '@/services/supabase';
import { openSupabaseSyncModal } from '@/components/supabase/SupabaseSyncModal';
import { i18n } from '@/i18n';
import { themeManager } from '@/services/theme/themeManager';
import ujaLogo from '@/assets/uja-logo.png';
import ujaShield from '@/assets/uja-shield.png';

export function renderHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'app-header';

  const t = i18n.t;
  const currentLocale = i18n.getLocale();
  const isEn = currentLocale === 'en';
  const queueCount = climateDatabaseService.getOfflineQueueCount();
  const isConfigured = climateDatabaseService.isConfigured();
  const isOnline = climateDatabaseService.isOnline();
  const isDarkMode = themeManager.isDark();

  header.innerHTML = `
    <div class="header-brand">
      <div class="brand-logo">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      </div>
      <div>
        <h1 class="brand-title">${t.common.appName} <span class="brand-badge">${t.common.versionBadge}</span></h1>
        <p class="brand-subtitle">${t.common.subtitle}</p>
      </div>
      <div class="header-brand-divider"></div>
      <a href="https://www.ujaen.es" target="_blank" rel="noopener noreferrer" class="header-uja-brand" title="${isEn ? 'University of Jaén (UJA) — Official Institutional Portal' : 'Universidad de Jaén (UJA) — Portal Institucional Oficial'}">
        <img src="${ujaLogo}" alt="Universidad de Jaén" class="header-uja-logo" />
        <img src="${ujaShield}" alt="UJA" class="header-uja-shield" />
      </a>
    </div>
    <div class="header-actions">
      <!-- Supabase Connection & Offline Sync Pill -->
      <button id="supabase-sync-pill" class="runtime-pill status-supabase ${isConfigured && isOnline ? 'status-online' : 'status-offline'}" type="button" title="${isEn ? 'Supabase Database: datos_mensuales' : 'Base de Datos Supabase: datos_mensuales'}">
        <span class="status-dot ${isConfigured && isOnline ? 'status-dot-active' : ''}"></span>
        <span id="supabase-status-text">
          ${isConfigured && isOnline ? (isEn ? 'Supabase: Connected' : 'Supabase: Conectado') : (isEn ? 'Supabase: Disconnected' : 'Supabase: Desconectado')}${queueCount > 0 ? ` <span class="pill-badge-counter">${queueCount}</span>` : ''}
        </span>
      </button>

      <!-- Theme Switcher Toggle (Modo Claro / Modo Oscuro) -->
      <button id="header-theme-toggle" class="theme-toggle-pill" type="button" title="${isEn ? 'Switch between Light and Dark mode' : 'Alternar entre Modo Claro y Modo Oscuro'}">
        <span class="theme-icon">${isDarkMode ? '' : ''}</span>
        <span class="theme-text">${isDarkMode ? (isEn ? 'Dark' : 'Oscuro') : (isEn ? 'Light' : 'Claro')}</span>
      </button>

      <!-- Language Switcher Toggle -->
      <div class="lang-switch-group" role="group" aria-label="${t.header.langSelect}">
        <button type="button" class="lang-btn ${currentLocale === 'es' ? 'active' : ''}" data-lang="es" title="${t.header.toggleSpanish}">
          <span>ES</span>
        </button>
        <button type="button" class="lang-btn ${currentLocale === 'en' ? 'active' : ''}" data-lang="en" title="${t.header.toggleEnglish}">
          <span>EN</span>
        </button>
      </div>

      <div id="pyodide-runtime-pill" class="runtime-pill status-loading">
        <span class="status-dot"></span>
        <span id="pyodide-status-text">${t.header.statusLoading.replace('{progress}', '0')}</span>
      </div>
      <a href="https://github.com/Milagros1211/OrientSol4_Completo" target="_blank" rel="noopener noreferrer" class="header-link" title="${t.common.docs} (GitHub)">
        ${t.common.docs}
      </a>
    </div>
  `;

  // Attach Supabase sync modal event
  const supabasePill = header.querySelector<HTMLButtonElement>('#supabase-sync-pill');
  supabasePill?.addEventListener('click', (e) => {
    e.preventDefault();
    openSupabaseSyncModal();
  });

  // Helper to re-render pill state immediately on any network/database change
  function updatePillState() {
    const textEl = header.querySelector('#supabase-status-text');
    const dotEl = header.querySelector('#supabase-sync-pill .status-dot');
    const pillEl = header.querySelector<HTMLButtonElement>('#supabase-sync-pill');
    if (!textEl) return;
    const count = climateDatabaseService.getOfflineQueueCount();
    const configured = climateDatabaseService.isConfigured();
    const online = climateDatabaseService.isOnline();
    const isConn = configured && online;

    if (pillEl) {
      pillEl.className = `runtime-pill status-supabase ${isConn ? 'status-online' : 'status-offline'}`;
      pillEl.title = isConn
        ? (isEn ? 'Supabase Database: Online & Connected' : 'Base de Datos Supabase: Online y Conectada')
        : (isEn ? 'Supabase Database: Offline (Disconnected)' : 'Base de Datos Supabase: Offline (Desconectada)');
    }
    const label = isConn
      ? (isEn ? 'Supabase: Connected' : 'Supabase: Conectado')
      : (isEn ? 'Supabase: Disconnected' : 'Supabase: Desconectado');
    textEl.innerHTML = `${label}${count > 0 ? ` <span class="pill-badge-counter">${count}</span>` : ''}`;
    if (dotEl) {
      dotEl.className = `status-dot ${isConn ? 'status-dot-active' : ''}`;
    }
  }

  // Subscribe to Supabase database state updates & network connectivity transitions
  climateDatabaseService.subscribe(updatePillState);
  window.addEventListener('online', () => {
    climateDatabaseService.setOnline(true);
    updatePillState();
  });
  window.addEventListener('offline', () => {
    climateDatabaseService.setOnline(false);
    updatePillState();
  });
  window.addEventListener('orientsol:network-changed', updatePillState);

  // Attach theme toggle switcher event
  const themeBtn = header.querySelector<HTMLButtonElement>('#header-theme-toggle');
  themeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const newTheme = themeManager.toggleTheme();
    const isDark = newTheme === 'dark';
    const iconEl = themeBtn.querySelector('.theme-icon');
    const textEl = themeBtn.querySelector('.theme-text');
    if (iconEl) iconEl.textContent = isDark ? '' : '';
    if (textEl) textEl.textContent = isDark ? (isEn ? 'Dark' : 'Oscuro') : (isEn ? 'Light' : 'Claro');
  });

  // Attach language switcher events
  header.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetLang = btn.dataset.lang as 'es' | 'en';
      if (targetLang && targetLang !== i18n.getLocale()) {
        i18n.setLocale(targetLang);
      }
    });
  });

  // Subscribe to Pyodide service updates
  pyodideService.subscribe((state) => {
    const pill = header.querySelector('#pyodide-runtime-pill');
    const text = header.querySelector('#pyodide-status-text');
    if (!pill || !text) return;

    pill.className = `runtime-pill status-${state.status}`;
    const currT = i18n.t;
    if (state.status === 'idle') {
      text.textContent = currT.header.statusIdle;
    } else if (state.status === 'loading') {
      text.textContent = currT.header.statusLoading.replace('{progress}', String(state.loadProgress));
    } else if (state.status === 'ready') {
      text.textContent = currT.header.statusReady.replace('{version}', state.pythonVersion || '3.14');
    } else if (state.status === 'error') {
      text.textContent = currT.header.statusError;
    }
  });

  return header;
}
