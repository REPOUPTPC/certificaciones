/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - CONFIGURACIÓN (js/config.js)
 * Arquitectura: Vercel (Node.js) + Turso (LibSQL) + Cloudflare R2 CDN
 * ==============================================================================
 */

(function() {
  const STORAGE_KEY_API_URL = 'uptpc_api_url_v2';
  const DEFAULT_API_URL = '/api';
  const R2_PUBLIC_BASE = 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev';

  const DEFAULT_UPTPC_LOGO = `${R2_PUBLIC_BASE}/img/logos/LOGO_UPTPC.png`;

  window.config = {
    getApiUrl() {
      const stored = localStorage.getItem(STORAGE_KEY_API_URL);
      if (stored && stored.trim()) return stored.trim();
      return DEFAULT_API_URL;
    },

    setApiUrl(url) {
      if (url && url.trim() && url.trim() !== DEFAULT_API_URL) {
        localStorage.setItem(STORAGE_KEY_API_URL, url.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY_API_URL);
      }
    },

    hasApiUrl() {
      return Boolean(this.getApiUrl());
    },

    getVerificationUrl() {
      if (typeof window !== 'undefined' && window.location && window.location.origin) {
        return `${window.location.origin}/consulta.html`;
      }
      return '/consulta.html';
    },

    getR2BaseUrl() {
      return R2_PUBLIC_BASE;
    },

    getDefaultLogoUrl() {
      return DEFAULT_UPTPC_LOGO;
    },

    getDefaultLogoSvg() {
      return DEFAULT_UPTPC_LOGO;
    },

    // Métodos de compatibilidad con versiones previas
    getAdminKey() {
      return '';
    },

    setAdminKey() {}
  };
})();
