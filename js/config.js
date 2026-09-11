/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - CONFIGURACIÓN (js/config.js)
 * ==============================================================================
 */

(function() {
  const STORAGE_KEY_API_URL = 'uptpc_google_script_url';
  const STORAGE_KEY_ADMIN_KEY = 'uptpc_admin_secret_key';
  const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwEIHa8gnLa-v_NpwfDxNRg72UCHUrltJKP5EE65yWkcGjs9G5LO_53VyS7TaI6nLhX4g/exec';
  const DEFAULT_ADMIN_KEY = 'UPTPC_CYT_SECURE_KEY_2026';
  const PUBLIC_VERIFICATION_BASE_URL = 'https://www.jornaltec.uptpc.edu.ve/p/validador-de-certificados.html';

  const DEFAULT_UPTPC_LOGO_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='46' fill='%230f3460' stroke='%23f39c12' stroke-width='4'/><text x='50' y='57' font-family='Arial,sans-serif' font-size='20' font-weight='bold' fill='%23ffffff' text-anchor='middle'>UPTPC</text></svg>";

  window.config = {
    getApiUrl() {
      return DEFAULT_GOOGLE_SCRIPT_URL;
    },

    setApiUrl(url) {
      // URL is fixed by policy, keep constant
    },

    getAdminKey() {
      return localStorage.getItem(STORAGE_KEY_ADMIN_KEY) || DEFAULT_ADMIN_KEY;
    },

    setAdminKey(key) {
      if (key) {
        localStorage.setItem(STORAGE_KEY_ADMIN_KEY, key.trim());
      } else {
        localStorage.removeItem(STORAGE_KEY_ADMIN_KEY);
      }
    },

    hasApiUrl() {
      return Boolean(this.getApiUrl());
    },

    getVerificationUrl() {
      return PUBLIC_VERIFICATION_BASE_URL;
    },

    getDefaultLogoSvg() {
      return DEFAULT_UPTPC_LOGO_SVG;
    }
  };
})();
