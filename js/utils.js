/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE UTILIDADES (js/utils.js)
 * ==============================================================================
 */

(function() {
  function generateCertificateCode(existingCodes = new Set()) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';

    const randomChars = (pool, length) => {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += pool.charAt(Math.floor(Math.random() * pool.length));
      }
      return result;
    };

    let code = '';
    let attempts = 0;

    do {
      const part1 = randomChars(letters, 3);
      const part2 = randomChars(digits, 3);
      const part3 = randomChars(letters, 3);
      code = `${part1}${part2}${part3}`;
      attempts++;
    } while (existingCodes.has(code) && attempts < 2000);

    return code;
  }

  function normalizeCedula(cedula) {
    if (!cedula) return '';
    let c = String(cedula).trim().toUpperCase();
    c = c.replace(/[\s\.]/g, '');
    if (/^[VE]\d{5,8}$/.test(c)) {
      return c.charAt(0) + '-' + c.substring(1);
    }
    return c;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
      return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function formatDateExtended(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
      const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
      return `${d.getDate()} DE ${meses[d.getMonth()]} DE ${d.getFullYear()}`;
    } catch (e) {
      return dateStr;
    }
  }

  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  }

  function compressImage(file, maxWidth = 600, maxHeight = 600, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png', quality));
        };
        img.onerror = error => reject(error);
      };
      reader.onerror = error => reject(error);
    });
  }

  function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toastContainer') || createToastContainer();
    const toastId = 'toast-' + Date.now();
    
    const iconMap = {
      success: 'fa-circle-check text-success',
      danger: 'fa-circle-exclamation text-danger',
      warning: 'fa-triangle-exclamation text-warning',
      info: 'fa-circle-info text-info'
    };

    const bgMap = {
      success: 'border-left-success',
      danger: 'border-left-danger',
      warning: 'border-left-warning',
      info: 'border-left-info'
    };

    const toastHtml = `
      <div id="${toastId}" class="toast align-items-center shadow-lg border-0 ${bgMap[type] || ''}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body d-flex align-items-center">
            <i class="fa-solid ${iconMap[type] || iconMap.info} fa-lg me-3"></i>
            <div>
              ${title ? `<strong>${escapeHtml(title)}</strong><br>` : ''}
              <span>${escapeHtml(message)}</span>
            </div>
          </div>
          <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
      </div>
    `;

    container.insertAdjacentHTML('beforeend', toastHtml);
    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();

    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  }

  function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
  }

  function parseUserImportText(text) {
    if (!text || !text.trim()) return [];
    const lines = text.split(/\r?\n/);
    const users = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parts = trimmed.split(/[,;\t|]/);
      if (parts.length === 1) {
        const match = trimmed.match(/^([VE]?-?\d+)\s+(.+)$/i);
        if (match) {
          parts = [match[1], match[2]];
        }
      }

      if (parts.length >= 2) {
        const rawCedula = parts[0].trim();
        const rawNombre = parts.slice(1).join(' ').trim();
        
        const cedula = normalizeCedula(rawCedula);
        if (cedula && rawNombre) {
          users.push({ cedula, nombre_completo: rawNombre });
        }
      }
    });

    return users;
  }

  window.utils = {
    generateCertificateCode,
    normalizeCedula,
    escapeHtml,
    formatDate,
    formatDateExtended,
    generateUUID,
    fileToBase64,
    compressImage,
    showToast,
    parseUserImportText
  };
})();
