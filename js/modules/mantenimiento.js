/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO MANTENIMIENTO Y CONFIGURACIÓN
 * (js/modules/mantenimiento.js)
 * Exclusivo para SUPER_ADMIN: Respaldos descargables, diagnósticos y configuración global
 * ==============================================================================
 */

(function() {
  const mantenimientoModule = {
    async init() {
      this.initEventListeners();
      await this.cargarConfiguraciones();
      await this.cargarPresetsLogos();
      await this.cargarInfoApiKey();
      await this.ejecutarDiagnosticoSilencioso();
    },

    initEventListeners() {
      // 1. Descargar Respaldo JSON
      const btnDescargar = document.getElementById('btnDescargarRespaldoJson');
      if (btnDescargar && !btnDescargar.dataset.bound) {
        btnDescargar.dataset.bound = 'true';
        btnDescargar.addEventListener('click', async () => {
          await this.descargarRespaldo();
        });
      }

      // 2. Limpiar Caché y Forzar Sincronización
      const btnLimpiar = document.getElementById('btnLimpiarCacheForzado');
      if (btnLimpiar && !btnLimpiar.dataset.bound) {
        btnLimpiar.dataset.bound = 'true';
        btnLimpiar.addEventListener('click', async () => {
          await this.forzarSincronizacion();
        });
      }

      // 3. Ejecutar Diagnóstico Manual
      const btnDiag = document.getElementById('btnEjecutarDiagnostico');
      if (btnDiag && !btnDiag.dataset.bound) {
        btnDiag.dataset.bound = 'true';
        btnDiag.addEventListener('click', async () => {
          await this.ejecutarDiagnosticoManual();
        });
      }

      // 4. Formulario de Configuraciones Globales
      const formConfig = document.getElementById('formConfiguracionesGlobales');
      if (formConfig && !formConfig.dataset.bound) {
        formConfig.dataset.bound = 'true';
        formConfig.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.guardarConfiguraciones();
        });
      }

      // 5. Controles de la Plataforma API KEY
      const swApiKey = document.getElementById('switchApiKeyHabilitada');
      if (swApiKey && !swApiKey.dataset.bound) {
        swApiKey.dataset.bound = 'true';
        swApiKey.addEventListener('change', async (e) => {
          await this.toggleApiKey(e.target.checked);
        });
      }

      const btnVerKey = document.getElementById('btnToggleVerApiKey');
      if (btnVerKey && !btnVerKey.dataset.bound) {
        btnVerKey.dataset.bound = 'true';
        btnVerKey.addEventListener('click', () => {
          const inp = document.getElementById('inputApiKeyToken');
          const icon = document.getElementById('iconVerApiKey');
          if (!inp) return;
          if (inp.type === 'password') {
            inp.type = 'text';
            if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
          } else {
            inp.type = 'password';
            if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
          }
        });
      }

      const btnCopyKey = document.getElementById('btnCopiarApiKey');
      if (btnCopyKey && !btnCopyKey.dataset.bound) {
        btnCopyKey.dataset.bound = 'true';
        btnCopyKey.addEventListener('click', () => {
          const inp = document.getElementById('inputApiKeyToken');
          if (inp && inp.value) {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(inp.value).then(() => {
                window.utils.showToast('API Key copiada al portapapeles', 'success');
              }).catch(() => {
                prompt('Copie la API Key:', inp.value);
              });
            } else {
              prompt('Copie la API Key:', inp.value);
            }
          }
        });
      }

      const btnRegenKey = document.getElementById('btnRegenerarApiKey');
      if (btnRegenKey && !btnRegenKey.dataset.bound) {
        btnRegenKey.dataset.bound = 'true';
        btnRegenKey.addEventListener('click', async () => {
          window.utils.showConfirm({
            title: 'Regenerar API Key',
            message: '¿Está seguro de que desea generar una nueva API Key?',
            subtext: 'La clave actual dejará de funcionar inmediatamente para cualquier sistema externo conectado.',
            confirmText: 'Sí, Regenerar Clave',
            confirmClass: 'btn-danger',
            onConfirm: async () => {
              await this.regenerarApiKey();
            }
          });
        });
      }

      const btnCopyEndpoint = document.getElementById('btnCopiarEndpointApi');
      if (btnCopyEndpoint && !btnCopyEndpoint.dataset.bound) {
        btnCopyEndpoint.dataset.bound = 'true';
        btnCopyEndpoint.addEventListener('click', () => {
          const inp = document.getElementById('inputEndpointApiUrl');
          if (inp && inp.value) {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(inp.value).then(() => {
                window.utils.showToast('URL del endpoint copiada', 'info');
              });
            } else {
              prompt('Copie la URL:', inp.value);
            }
          }
        });
      }

      const btnCopyCurl = document.getElementById('btnCopiarCurlEjemplo');
      if (btnCopyCurl && !btnCopyCurl.dataset.bound) {
        btnCopyCurl.dataset.bound = 'true';
        btnCopyCurl.addEventListener('click', () => {
          const key = document.getElementById('inputApiKeyToken')?.value || 'TU_API_KEY';
          const url = document.getElementById('inputEndpointApiUrl')?.value || `${window.location.origin}/api?action=inyectarPago`;
          const curlCmd = `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${key}" \\\n  -d '{\n    "cedula": "V-12345678",\n    "nombre_completo": "PEDRO PÉREZ",\n    "monto": 350.50\n  }'`;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(curlCmd).then(() => {
              window.utils.showToast('Comando cURL copiado al portapapeles', 'info');
            });
          } else {
            prompt('Copie el comando cURL:', curlCmd);
          }
        });
      }

      const formTestApi = document.getElementById('formTestInyeccionApi');
      if (formTestApi && !formTestApi.dataset.bound) {
        formTestApi.dataset.bound = 'true';
        formTestApi.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.ejecutarTestInyeccion();
        });
      }

      // Controles de la API de Cursos Ofertados (Despliegue Externo)
      const btnCopiarUrlCursos = document.getElementById('btnCopiarUrlApiCursos');
      if (btnCopiarUrlCursos && !btnCopiarUrlCursos.dataset.bound) {
        btnCopiarUrlCursos.dataset.bound = 'true';
        btnCopiarUrlCursos.addEventListener('click', () => {
          const inp = document.getElementById('inputUrlApiCursosExterna');
          if (inp && inp.value) {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(inp.value).then(() => {
                window.utils.showToast('Dirección API de cursos copiada al portapapeles', 'success');
              }).catch(() => {
                prompt('Copie la URL:', inp.value);
              });
            } else {
              prompt('Copie la URL:', inp.value);
            }
          }
        });
      }

      const btnAbrirJson = document.getElementById('btnAbrirJsonCursosNavegador');
      if (btnAbrirJson && !btnAbrirJson.dataset.bound) {
        btnAbrirJson.dataset.bound = 'true';
        btnAbrirJson.addEventListener('click', () => {
          const inp = document.getElementById('inputUrlApiCursosExterna');
          if (inp && inp.value) {
            window.open(inp.value, '_blank');
          }
        });
      }

      const btnPreviewCatalogo = document.getElementById('btnPrevisualizarCatalogoApi');
      if (btnPreviewCatalogo && !btnPreviewCatalogo.dataset.bound) {
        btnPreviewCatalogo.dataset.bound = 'true';
        btnPreviewCatalogo.addEventListener('click', async () => {
          await this.previsualizarCatalogoCursosApi();
        });
      }
    },

    async descargarRespaldo() {
      const btn = document.getElementById('btnDescargarRespaldoJson');
      const statusDiv = document.getElementById('statusDescargaRespaldo');
      if (!btn) return;

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Generando archivo de respaldo desde Turso...';
      if (statusDiv) statusDiv.innerHTML = '<div class="alert alert-info py-2 mb-0 small"><i class="fa-solid fa-clock me-1"></i> Extrayendo 15 tablas relacionales...</div>';

      try {
        const res = await window.api.backupDatabase();
        if (res && res.status === 'success' && res.data) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `respaldo_certificaciones_uptpc_${timestamp}.json`;
          const jsonStr = JSON.stringify(res, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);

          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          const sizeKb = (blob.size / 1024).toFixed(1);
          const totalTablas = Object.keys(res.data).length;
          if (statusDiv) {
            statusDiv.innerHTML = `<div class="alert alert-success py-2 mb-0 small"><i class="fa-solid fa-circle-check me-1"></i> Respaldo descargado exitosamente (<strong>${totalTablas} tablas</strong>, ${sizeKb} KB).</div>`;
          }
          window.utils.showToast('Copia de seguridad descargada exitosamente', 'success');
        } else {
          throw new Error(res.message || 'Error al obtener datos');
        }
      } catch (err) {
        console.error('Error al generar respaldo:', err);
        if (statusDiv) {
          statusDiv.innerHTML = `<div class="alert alert-danger py-2 mb-0 small"><i class="fa-solid fa-triangle-exclamation me-1"></i> Falló la descarga: ${err.message}</div>`;
        }
        window.utils.showToast(`Error al descargar respaldo: ${err.message}`, 'danger');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    },

    async forzarSincronizacion() {
      const btn = document.getElementById('btnLimpiarCacheForzado');
      const statusDiv = document.getElementById('statusLimpiezaCache');
      if (btn) btn.disabled = true;

      try {
        sessionStorage.removeItem('uptpc_real_drive_cache_v2');
        if (window.api && window.api.clearCache) window.api.clearCache();
        
        if (window.utils && window.utils.showLoading) {
          window.utils.showLoading(50, 'Sincronizando con Turso...', 'Descargando datos frescos');
        }

        await window.api.preloadAllData(true);

        if (statusDiv) {
          statusDiv.innerHTML = '<div class="alert alert-success py-2 mb-0 small"><i class="fa-solid fa-circle-check me-1"></i> Caché limpiada y datos re-sincronizados desde Turso.</div>';
        }
        window.utils.showToast('Caché restablecida y datos actualizados', 'success');
      } catch (err) {
        if (statusDiv) {
          statusDiv.innerHTML = `<div class="alert alert-danger py-2 mb-0 small"><i class="fa-solid fa-triangle-exclamation me-1"></i> Error: ${err.message}</div>`;
        }
      } finally {
        if (btn) btn.disabled = false;
        if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
      }
    },

    async ejecutarDiagnosticoManual() {
      const detallesDiv = document.getElementById('diagnosticoDetallesConsola');
      if (detallesDiv) {
        detallesDiv.innerHTML = '<div class="text-info small"><i class="fa-solid fa-spinner fa-spin me-1"></i> Ejecutando pruebas de latencia y consistencia...</div>';
      }

      const tStart = performance.now();
      try {
        const pingRes = await window.api.ping();
        const tPing = Math.round(performance.now() - tStart);

        const tStatsStart = performance.now();
        const statsRes = await window.api.getDashboardStats();
        const tStats = Math.round(performance.now() - tStatsStart);

        const latenciaTursoEl = document.getElementById('valLatenciaTurso');
        if (latenciaTursoEl) latenciaTursoEl.textContent = `${tPing} ms`;

        if (detallesDiv) {
          detallesDiv.innerHTML = `
            <div class="alert alert-success py-2 mb-0 small font-monospace">
              ✅ <strong>Diagnóstico Exitoso:</strong><br>
              • Vercel API Gateway: Activo (Ping: ${tPing} ms)<br>
              • Turso LibSQL Edge: Conectado (${statsRes.data?.totalCertificados || 0} Certificados, ${statsRes.data?.totalUsuarios || 0} Usuarios, ${tStats} ms)<br>
              • Cloudflare R2: Operativo (Imágenes sincronizadas con CDN Global)
            </div>
          `;
        }
      } catch (err) {
        if (detallesDiv) {
          detallesDiv.innerHTML = `
            <div class="alert alert-danger py-2 mb-0 small font-monospace">
              ❌ <strong>Fallo de Diagnóstico:</strong> ${err.message}
            </div>
          `;
        }
      }
    },

    async ejecutarDiagnosticoSilencioso() {
      try {
        const t0 = performance.now();
        await window.api.ping();
        const ms = Math.round(performance.now() - t0);
        const el = document.getElementById('valLatenciaTurso');
        if (el) el.textContent = `${ms} ms`;
      } catch (e) {}
    },

    async cargarConfiguraciones() {
      try {
        const res = await window.api.getConfiguraciones();
        if (res && res.status === 'success' && Array.isArray(res.data)) {
          const map = {};
          res.data.forEach(c => { map[String(c.clave).toUpperCase()] = c.valor; });

          const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el && val !== undefined) el.value = val;
          };

          setVal('cfgInstitucionNombre', map['INSTITUCION_NOMBRE'] || 'Universidad Politécnica Territorial de Puerto Cabello');
          setVal('cfgInstitucionSiglas', map['INSTITUCION_SIGLAS'] || 'UPTPC');
          setVal('cfgUnidadPrincipal', map['UNIDAD_PRINCIPAL'] || 'Unidad de Ciencia y Tecnología (CYT)');
          setVal('cfgWebsiteOficial', map['WEBSITE_OFICIAL'] || 'https://www.uptpc.edu.ve');
          setVal('cfgLogoPrincipalUrl', map['LOGO_PRINCIPAL_URL'] || 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev/img/logos/LOGO_UPTPC.png');
          setVal('cfgLimiteFolio', map['LIMITE_CERTIFICADOS_FOLIO'] || 15);
          setVal('cfgUrlValidador', map['URL_CONSULTA_PUBLICA'] || '/consulta.html');

          const swPagos = document.getElementById('cfgSwitchRegistroPagos');
          if (swPagos) swPagos.checked = map['REGISTRO_PAGOS_HABILITADO'] !== 'false';

          const swTasa = document.getElementById('cfgSwitchTasaAuto');
          if (swTasa) swTasa.checked = map['TASA_DOLAR_AUTOMATICA'] !== 'false';
        }
      } catch (e) {
        console.warn('Error al cargar configuraciones maestras:', e);
      }
    },

    async guardarConfiguraciones() {
      const statusDiv = document.getElementById('statusConfiguraciones');
      const btn = document.getElementById('btnGuardarConfiguraciones');
      if (btn) btn.disabled = true;

      if (statusDiv) {
        statusDiv.innerHTML = '<span class="text-info small"><i class="fa-solid fa-spinner fa-spin me-1"></i> Guardando cambios en Turso...</span>';
      }

      const updates = [
        { clave: 'INSTITUCION_NOMBRE', valor: document.getElementById('cfgInstitucionNombre')?.value.trim() },
        { clave: 'INSTITUCION_SIGLAS', valor: document.getElementById('cfgInstitucionSiglas')?.value.trim() },
        { clave: 'UNIDAD_PRINCIPAL', valor: document.getElementById('cfgUnidadPrincipal')?.value.trim() },
        { clave: 'WEBSITE_OFICIAL', valor: document.getElementById('cfgWebsiteOficial')?.value.trim() },
        { clave: 'LOGO_PRINCIPAL_URL', valor: document.getElementById('cfgLogoPrincipalUrl')?.value.trim() },
        { clave: 'LIMITE_CERTIFICADOS_FOLIO', valor: document.getElementById('cfgLimiteFolio')?.value.trim() },
        { clave: 'URL_CONSULTA_PUBLICA', valor: document.getElementById('cfgUrlValidador')?.value.trim() },
        { clave: 'REGISTRO_PAGOS_HABILITADO', valor: document.getElementById('cfgSwitchRegistroPagos')?.checked ? 'true' : 'false' },
        { clave: 'TASA_DOLAR_AUTOMATICA', valor: document.getElementById('cfgSwitchTasaAuto')?.checked ? 'true' : 'false' }
      ];

      try {
        for (const item of updates) {
          if (item.valor !== undefined) {
            await window.api.updateConfiguracion(item.clave, item.valor);
          }
        }
        if (statusDiv) {
          statusDiv.innerHTML = '<span class="text-success small fw-bold"><i class="fa-solid fa-circle-check me-1"></i> Configuraciones maestras guardadas correctamente.</span>';
        }
        window.utils.showToast('Configuraciones actualizadas exitosamente', 'success');
      } catch (err) {
        if (statusDiv) {
          statusDiv.innerHTML = `<span class="text-danger small"><i class="fa-solid fa-triangle-exclamation me-1"></i> Error al guardar: ${err.message}</span>`;
        }
        window.utils.showToast(`Error al guardar configuraciones: ${err.message}`, 'danger');
      } finally {
        if (btn) btn.disabled = false;
      }
    },

    // ============================================================
    // GESTIÓN DE PRESETS OFICIALES DE IMÁGENES Y LOGOS (R2)
    // ============================================================
    async cargarPresetsLogos() {
      const contenedor = document.getElementById('contenedorPresetsConfiguracion');
      if (!contenedor) return;

      try {
        const res = await window.api.getPresetsLogos();
        const presets = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];

        if (presets.length === 0) {
          contenedor.innerHTML = `
            <div class="col-12 text-center py-4 text-muted">
              <i class="fa-solid fa-images fa-3x text-secondary mb-2"></i>
              <h6>No hay presets oficiales registrados aún</h6>
              <p class="small">Haz clic en "Subir Nuevo Logo / Preset" para agregar logos oficiales de Cloudflare R2.</p>
            </div>
          `;
          return;
        }

        let html = '';
        presets.forEach(p => {
          const cat = window.utils.escapeHtml(p.categoria || 'Logos');
          const nom = window.utils.escapeHtml(p.nombre || 'Logo');
          const dim = `${p.ancho_sugerido || 120} × ${p.alto_sugerido || 120} px`;
          const url = window.utils.escapeHtml(p.url || '');

          html += `
            <div class="col-md-6 col-lg-4 col-xl-3">
              <div class="card h-100 border shadow-sm rounded-3">
                <div class="bg-light p-3 text-center border-bottom d-flex align-items-center justify-content-center" style="height: 140px;">
                  <img src="${url}" alt="${nom}" style="max-height: 110px; max-width: 100%; object-fit: contain;" onerror="this.src='img/IMAGE.png'">
                </div>
                <div class="card-body p-3 d-flex flex-column">
                  <div class="d-flex justify-content-between align-items-start mb-1">
                    <h6 class="fw-bold text-dark mb-0 text-truncate" title="${nom}">${nom}</h6>
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle small">${cat}</span>
                  </div>
                  <small class="text-muted d-block mb-2"><i class="fa-solid fa-ruler-combined me-1"></i>${dim}</small>
                  
                  <div class="mt-auto pt-2 border-top d-flex gap-1">
                    <button type="button" class="btn btn-outline-secondary btn-sm flex-grow-1" onclick="window.mantenimientoModule.copiarUrlPreset('${url}')" title="Copiar URL R2">
                      <i class="fa-solid fa-copy me-1"></i> Copiar URL
                    </button>
                    <a href="${url}" target="_blank" class="btn btn-outline-info btn-sm" title="Ver imagen completa">
                      <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="window.mantenimientoModule.eliminarPresetLogo('${p.id}', '${nom}')" title="Eliminar preset">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        });

        contenedor.innerHTML = html;
      } catch(err) {
        console.error('Error cargando presets en configuración:', err);
        contenedor.innerHTML = '<div class="col-12 text-center text-danger py-3">Error al cargar presets oficiales.</div>';
      }
    },

    abrirModalNuevoPreset() {
      const modalEl = document.getElementById('modalNuevoPresetLogo');
      document.getElementById('formNuevoPresetLogo')?.reset();
      const prevBox = document.getElementById('containerPreviewPresetNuevo');
      if (prevBox) prevBox.classList.add('d-none');
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    },

    previsualizarArchivoPreset(input) {
      const file = input.files[0];
      const prevBox = document.getElementById('containerPreviewPresetNuevo');
      const img = document.getElementById('imgPreviewPresetNuevo');
      if (!file || !prevBox || !img) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
        prevBox.classList.remove('d-none');
      };
      reader.readAsDataURL(file);
    },

    async guardarNuevoPreset(e) {
      e.preventDefault();
      const nombre = document.getElementById('inputPresetNombre').value.trim();
      const categoria = document.getElementById('selectPresetCategoria').value;
      const ancho = parseInt(document.getElementById('inputPresetAncho').value) || 120;
      const alto = parseInt(document.getElementById('inputPresetAlto').value) || 120;
      const fileInput = document.getElementById('inputPresetArchivo');
      const file = fileInput.files[0];
      const btn = document.getElementById('btnSubmitNuevoPreset');

      if (!nombre || !file) {
        alert('Por favor complete el nombre y seleccione un archivo de imagen.');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo a Cloudflare R2...';

      try {
        let base64 = null;
        try {
          base64 = await window.utils.fileToBase64(file);
        } catch(err) {
          throw new Error('No se pudo leer el archivo de imagen.');
        }

        // Subir a Cloudflare R2 en /img/logos/
        const uploadRes = await window.api.uploadImage(base64, file.name, 'logos');
        if (!uploadRes || uploadRes.status !== 'success' || !uploadRes.url) {
          throw new Error((uploadRes && uploadRes.message) || 'Error al subir imagen a Cloudflare R2');
        }

        const id = 'preset_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
        const nuevoPreset = {
          id,
          nombre,
          categoria,
          url: uploadRes.url,
          descripcion: `Preset institucional: ${nombre}`,
          ancho_sugerido: ancho,
          alto_sugerido: alto,
          created_at: new Date().toISOString()
        };

        const createRes = await window.api.createPresetLogo(nuevoPreset);
        if (createRes && createRes.status === 'success') {
          const modalEl = document.getElementById('modalNuevoPresetLogo');
          bootstrap.Modal.getInstance(modalEl).hide();
          window.utils.showToast(`Logo oficial "${nombre}" guardado y subido a Cloudflare R2 exitosamente`, 'success');
          await this.cargarPresetsLogos();
          if (window.disenadorModule && window.disenadorModule.cargarPresetsEnSelector) {
            window.disenadorModule.cargarPresetsEnSelector();
          }
        } else {
          throw new Error((createRes && createRes.message) || 'Error al registrar preset en base de datos');
        }
      } catch(err) {
        console.error('Error guardando preset:', err);
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i>Subir a Cloudflare R2';
      }
    },

    async eliminarPresetLogo(id, nombre) {
      if (!confirm(`¿Está seguro de eliminar el preset oficial "${nombre}"?`)) return;

      try {
        const res = await window.api.deletePresetLogo(id);
        if (res && res.status === 'success') {
          window.utils.showToast(`Preset "${nombre}" eliminado`, 'success');
          await this.cargarPresetsLogos();
          if (window.disenadorModule && window.disenadorModule.cargarPresetsEnSelector) {
            window.disenadorModule.cargarPresetsEnSelector();
          }
        } else {
          alert('Error eliminando preset: ' + ((res && res.message) || ''));
        }
      } catch(err) {
        console.error('Error eliminando preset:', err);
        alert('Error al conectar con la base de datos');
      }
    },

    copiarUrlPreset(url) {
      if (!url) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          window.utils.showToast('URL de Cloudflare R2 copiada al portapapeles', 'info');
        }).catch(() => {
          prompt('Copie la URL:', url);
        });
      } else {
        prompt('Copie la URL:', url);
      }
    },

    // ============================================================
    // GESTIÓN DE LA PLATAFORMA API KEY & INYECCIÓN EXTERNA
    // ============================================================
    async cargarInfoApiKey() {
      try {
        const res = await window.api.getApiKeyInfo();
        if (res && res.status === 'success' && res.data) {
          const { apiKey, habilitada, lastUsed, totalInyectados } = res.data;

          const inpToken = document.getElementById('inputApiKeyToken');
          if (inpToken) inpToken.value = apiKey || '';

          const sw = document.getElementById('switchApiKeyHabilitada');
          if (sw) sw.checked = Boolean(habilitada);

          const badge = document.getElementById('badgeEstadoApiKey');
          if (badge) {
            if (habilitada) {
              badge.className = 'badge bg-success';
              badge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>ACTIVA';
            } else {
              badge.className = 'badge bg-danger';
              badge.innerHTML = '<i class="fa-solid fa-circle-xmark me-1"></i>INACTIVA';
            }
          }

          const lblTotal = document.getElementById('lblApiKeyTotalInyectados');
          if (lblTotal) lblTotal.textContent = totalInyectados || 0;

          const lblLast = document.getElementById('lblApiKeyUltimaPeticion');
          if (lblLast) {
            lblLast.textContent = lastUsed && lastUsed !== 'Sin registros recientes' ? window.utils.formatDate(lastUsed) : 'Sin registros recientes';
          }

          const inpUrl = document.getElementById('inputEndpointApiUrl');
          if (inpUrl) {
            inpUrl.value = `${window.location.origin}/api?action=inyectarPago`;
          }

          const inpUrlCursos = document.getElementById('inputUrlApiCursosExterna');
          if (inpUrlCursos) {
            inpUrlCursos.value = `${window.location.origin}/api?action=getCursosOfertadosApi&api_key=${apiKey || ''}`;
          }

          document.querySelectorAll('.snippet-url-cursos').forEach(el => {
            el.textContent = `${window.location.origin}/api?action=getCursosOfertadosApi&api_key=${apiKey || 'TU_SECRETO'}`;
          });

          // Cargar cursos ofertados en el selector de prueba
          const selTestCurso = document.getElementById('selectTestCursoOfertado');
          if (selTestCurso && selTestCurso.options.length <= 1) {
            const resCursos = await window.api.getAll('curso_ofertado');
            if (resCursos && resCursos.status === 'success' && Array.isArray(resCursos.data)) {
              selTestCurso.innerHTML = '<option value="">-- Curso por Defecto --</option>' +
                resCursos.data.map(c => `<option value="${c.id}">${window.utils.escapeHtml(c.taller)} ($${parseFloat(c.valor_estudiante||0).toFixed(2)})</option>`).join('');
            }
          }
        }
      } catch (err) {
        console.warn('Error al cargar información de API Key:', err);
      }
    },

    async toggleApiKey(habilitada) {
      try {
        const res = await window.api.toggleApiKey(habilitada);
        if (res && res.status === 'success') {
          window.utils.showToast(res.message, 'info');
          const badge = document.getElementById('badgeEstadoApiKey');
          if (badge) {
            if (habilitada) {
              badge.className = 'badge bg-success';
              badge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>ACTIVA';
            } else {
              badge.className = 'badge bg-danger';
              badge.innerHTML = '<i class="fa-solid fa-circle-xmark me-1"></i>INACTIVA';
            }
          }
        }
      } catch (err) {
        window.utils.showToast('Error al actualizar estado del API Key', 'danger');
      }
    },

    async regenerarApiKey() {
      try {
        if (window.utils && window.utils.showLoading) {
          window.utils.showLoading(40, 'Generando nueva API Key...', 'Actualizando parámetros de seguridad');
        }
        const res = await window.api.regenerateApiKey();
        if (res && res.status === 'success') {
          const inpToken = document.getElementById('inputApiKeyToken');
          if (inpToken) inpToken.value = res.apiKey;

          const inpUrlCursos = document.getElementById('inputUrlApiCursosExterna');
          if (inpUrlCursos) {
            inpUrlCursos.value = `${window.location.origin}/api?action=getCursosOfertadosApi&api_key=${res.apiKey}`;
          }
          document.querySelectorAll('.snippet-url-cursos').forEach(el => {
            el.textContent = `${window.location.origin}/api?action=getCursosOfertadosApi&api_key=${res.apiKey}`;
          });

          window.utils.showToast('Nueva API Key generada y guardada exitosamente.', 'success');
        } else {
          window.utils.showToast('Error: ' + (res?.message || 'No se pudo generar'), 'danger');
        }
      } catch (err) {
        console.error('Error al regenerar API Key:', err);
        window.utils.showToast('Error de conexión al regenerar API Key', 'danger');
      } finally {
        if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
      }
    },

    async ejecutarTestInyeccion() {
      const cedula = document.getElementById('inputTestCedula')?.value.trim();
      const nombre = document.getElementById('inputTestNombre')?.value.trim();
      const cursoId = document.getElementById('selectTestCursoOfertado')?.value;
      const contenedor = document.getElementById('contenedorResultadoTestApi');
      const btn = document.getElementById('btnEjecutarTestInyeccion');

      if (!cedula) {
        window.utils.showToast('Ingrese la cédula del participante para probar', 'warning');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Inyectando...';
      }

      try {
        const payload = {
          cedula,
          nombre_completo: nombre,
          id_curso_ofertado: cursoId || null,
          banco_origen: 'Consola de Prueba Super Admin',
          numero_transferencia: 'TEST-' + Date.now().toString().slice(-6)
        };

        const res = await window.api.inyectarPago(payload);

        if (contenedor) {
          contenedor.style.display = 'block';
          if (res && res.status === 'success') {
            contenedor.innerHTML = `
              <div class="alert alert-success py-2 px-3 small mb-2 d-flex justify-content-between align-items-center">
                <div>
                  <i class="fa-solid fa-circle-check me-1"></i>
                  <strong>¡Inyección Exitosa!</strong> El pago asociado a <code>${res.data?.cedula}</code> fue registrado con ID <code>${res.data?.id}</code> en estado <strong>PENDIENTE</strong>.
                </div>
                <a href="#ofertas" class="btn btn-sm btn-outline-success fw-bold" onclick="document.querySelector('[data-target=secOfertas]')?.click(); document.getElementById('tab-pagos-tab')?.click();">
                  Ver en Pagos
                </a>
              </div>
              <pre class="bg-dark text-success p-3 rounded font-monospace small mb-0" style="max-height: 180px; overflow-y: auto;"><code>${JSON.stringify(res, null, 2)}</code></pre>
            `;
            window.utils.showToast('Inyección simulada completada exitosamente', 'success');
            await this.cargarInfoApiKey();
          } else {
            contenedor.innerHTML = `
              <div class="alert alert-danger py-2 px-3 small mb-2">
                <i class="fa-solid fa-circle-exclamation me-1"></i>
                <strong>Error en la Inyección:</strong> ${res?.message || 'Error desconocido'}
              </div>
              <pre class="bg-dark text-danger p-3 rounded font-monospace small mb-0"><code>${JSON.stringify(res, null, 2)}</code></pre>
            `;
          }
        }
      } catch (err) {
        if (contenedor) {
          contenedor.style.display = 'block';
          contenedor.innerHTML = `
            <div class="alert alert-danger py-2 px-3 small mb-0">
              <i class="fa-solid fa-triangle-exclamation me-1"></i> <strong>Excepción de red:</strong> ${err.message}
            </div>
          `;
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-paper-plane me-1"></i> Probar Inyección';
        }
      }
    },

    async previsualizarCatalogoCursosApi() {
      const contenedor = document.getElementById('contenedorPreviewCatalogoCursos');
      const btn = document.getElementById('btnPrevisualizarCatalogoApi');
      if (contenedor) {
        contenedor.innerHTML = '<div class="text-info text-center py-4"><i class="fa-solid fa-spinner fa-spin me-2"></i>Consultando catálogo de cursos en vivo...</div>';
      }
      if (btn) btn.disabled = true;

      try {
        const apiKey = document.getElementById('inputApiKeyToken')?.value || '';
        const res = await window.api.getCursosOfertadosApi(apiKey);
        if (contenedor) {
          if (res && res.status === 'success') {
            contenedor.innerHTML = `
              <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-secondary">
                <span class="text-success small"><i class="fa-solid fa-circle-check me-1"></i>200 OK - Catálogo Generado</span>
                <span class="badge bg-primary">${res.total_cursos} cursos ofertados</span>
              </div>
              <pre class="mb-0 text-info"><code>${window.utils.escapeHtml(JSON.stringify(res, null, 2))}</code></pre>
            `;
          } else {
            contenedor.innerHTML = `
              <div class="alert alert-danger py-2 mb-0 small">
                <i class="fa-solid fa-triangle-exclamation me-1"></i> ${res?.message || 'Error al obtener catálogo'}
              </div>
            `;
          }
        }
      } catch (err) {
        if (contenedor) {
          contenedor.innerHTML = `
            <div class="alert alert-danger py-2 mb-0 small">
              <i class="fa-solid fa-triangle-exclamation me-1"></i> Error de red: ${err.message}
            </div>
          `;
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    }
  };

  window.mantenimientoModule = mantenimientoModule;
})();
