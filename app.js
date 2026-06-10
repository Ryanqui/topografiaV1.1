/* Practicas de Topografia
   Aplicativo web modular para topografía y taquimetría.
   Funciona sin servidor; para PWA/Service Worker usar localhost o HTTPS. */
(() => {
  'use strict';

  const DB_NAME = 'topotaqui_pro_academico_v1';
  const DB_VERSION = 1;
  const STORE = 'projects';
  const AUTOSAVE_MS = 650;

  const modules = [
    { id: 'dashboard', icon: '🏠', label: 'Panel principal' },
    { id: 'datos', icon: '📋', label: 'Datos generales' },
    { id: 'cinta', icon: '📏', label: 'Cinta' },
    { id: 'brujula', icon: '🧭', label: 'Brújula y azimuts' },
    { id: 'poligonal', icon: '🔷', label: 'Poligonal' },
    { id: 'radiacion', icon: '📡', label: 'Radiación' },
    { id: 'nivel_simple', icon: '📐', label: 'Nivelación simple' },
    { id: 'nivel_compuesta', icon: '🏗️', label: 'Nivelación compuesta' },
    { id: 'taquimetria', icon: '🎯', label: 'Taquimetría' },
    { id: 'estacion_total', icon: '⚙️', label: 'Estación total' },
    { id: 'perfil', icon: '📈', label: 'Perfil longitudinal' },
    { id: 'secciones', icon: '↔️', label: 'Secciones' },
    { id: 'replanteo', icon: '📍', label: 'Replanteo' },
    { id: 'herramientas', icon: '🧰', label: 'Herramientas' },
    { id: 'reportes', icon: '🖨️', label: 'Reportes' }
  ];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = () => 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const deepClone = (obj) => {
    try { return structuredClone(obj); }
    catch (_) { return JSON.parse(JSON.stringify(obj)); }
  };
  const nowISO = () => new Date().toISOString();
  const today = () => new Date().toISOString().slice(0, 10);

  const state = {
    db: null,
    projects: [],
    activeId: null,
    module: 'dashboard',
    saveTimer: null,
    theme: localStorage.getItem('topotaqui-theme') || 'light',
    deferredPrompt: null
  };

  function parseNum(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
  function isNum(value) {
    if (value === null || value === undefined || value === '') return false;
    return Number.isFinite(Number(String(value).replace(/\s/g, '').replace(',', '.')));
  }
  function fmt(n, dec = 3) {
    if (!Number.isFinite(n)) return '';
    return Number(n).toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function round(n, dec = 4) {
    if (!Number.isFinite(n)) return 0;
    const f = Math.pow(10, dec);
    return Math.round(n * f) / f;
  }
  function degToRad(d) { return parseNum(d) * Math.PI / 180; }
  function radToDeg(r) { return r * 180 / Math.PI; }
  function normAz(az) {
    let a = parseNum(az) % 360;
    if (a < 0) a += 360;
    return a + 0; // evitar -0 en casos límite
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }
  function download(filename, content, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function openDB() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
  function tx(storeMode = 'readonly') {
    if (!state.db) return null;
    return state.db.transaction(STORE, storeMode).objectStore(STORE);
  }
  function dbGetAll() {
    return new Promise((resolve) => {
      const store = tx();
      if (!store) {
        const raw = localStorage.getItem('topotaqui-projects');
        return resolve(raw ? JSON.parse(raw) : []);
      }
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }
  function dbPut(project) {
    project.updatedAt = nowISO();
    return new Promise((resolve) => {
      const store = tx('readwrite');
      if (!store) {
        const list = state.projects.filter(p => p.id !== project.id).concat(project);
        localStorage.setItem('topotaqui-projects', JSON.stringify(list));
        return resolve();
      }
      const req = store.put(JSON.parse(JSON.stringify(project)));
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }
  function dbDelete(id) {
    return new Promise((resolve) => {
      const store = tx('readwrite');
      if (!store) {
        const list = state.projects.filter(p => p.id !== id);
        localStorage.setItem('topotaqui-projects', JSON.stringify(list));
        return resolve();
      }
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  }

  function defaultProject() {
    return {
      id: uid(),
      name: 'Proyecto topográfico ' + new Date().toLocaleDateString('es-PE'),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      general: {
        tipoObra: 'Edificación', ubicacion: '', departamento: '', provincia: '', distrito: '', coordenadas: '', fecha: today(), hora: '',
        responsable: '', operador: '', apuntador: '', croquista: '', auxiliares: '', equipo: '', equipoMarcaModelo: '', sistema: 'UTM', datum: 'WGS 84', zonaUTM: '', clima: '', observaciones: '', estado: 'Borrador'
      },
      settings: { mode: 'academico' },
      modules: {
        cinta: [
          { puntoInicial: 'A', puntoFinal: 'B', distancia: 25.4, pendiente: 0, observacion: 'Lado de lote' },
          { puntoInicial: 'B', puntoFinal: 'C', distancia: 18.2, pendiente: 0, observacion: 'Lado de lote' }
        ],
        brujula: [
          { estacion: 'A', punto: 'B', rumboDeg: 35, cuadrante: 'NE', distancia: 25, declinacion: 0, observacion: 'Reconocimiento' }
        ],
        poligonal: {
          startE: 500000, startN: 8665000, closed: true, rows: [
            { estacion: 'A', punto: 'B', rumboDeg: 35, cuadrante: 'NE', distancia: 25.4, observacion: 'Lote' },
            { estacion: 'B', punto: 'C', rumboDeg: 55, cuadrante: 'SE', distancia: 18.2, observacion: 'Lote' },
            { estacion: 'C', punto: 'D', rumboDeg: 35, cuadrante: 'SW', distancia: 25.3, observacion: 'Lote' },
            { estacion: 'D', punto: 'A', rumboDeg: 55, cuadrante: 'NW', distancia: 18.1, observacion: 'Cierre' }
          ]
        },
        radiacion: {
          stationE: 500000, stationN: 8665000, rows: [
            { punto: 'P1', azimut: 35, distancia: 12.5, codigo: 'BOR', descripcion: 'Borde de vía' }
          ]
        },
        nivel_simple: {
          cotaInicial: 100, rows: [
            { punto: 'BM-01', atras: 1.245, intermedia: '', adelante: '', observacion: 'Banco de nivel' },
            { punto: 'P1', atras: '', intermedia: 1.865, adelante: '', observacion: 'Terreno' },
            { punto: 'PC-01', atras: '', intermedia: '', adelante: 2.015, observacion: 'Punto de cambio' }
          ]
        },
        nivel_compuesta: {
          cotaInicial: 100, rows: [
            { estacion: 'N1', punto: 'BM-01', atras: 1.245, intermedia: '', adelante: '', observacion: 'Inicio' },
            { estacion: 'N1', punto: 'P1', atras: '', intermedia: 1.865, adelante: '', observacion: 'Terreno' },
            { estacion: 'N1', punto: 'PC-01', atras: '', intermedia: '', adelante: 2.015, observacion: 'Cambio' },
            { estacion: 'N2', punto: 'PC-01', atras: 1.105, intermedia: '', adelante: '', observacion: 'Cambio' },
            { estacion: 'N2', punto: 'P2', atras: '', intermedia: 1.445, adelante: '', observacion: 'Terreno' }
          ]
        },
        taquimetria: [
          { estacion: 'E1', punto: 'P1', cotaEstacion: 100, alturaInstrumento: 1.5, hiloSuperior: 2.675, hiloMedio: 2.3, hiloInferior: 1.925, anguloVertical: 5, k: 100, c: 0, descripcion: 'Borde camino' }
        ],
        estacion_total: [
          { punto: '1', este: 500000, norte: 8665000, cota: 100, codigo: 'BM', descripcion: 'Base' },
          { punto: '2', este: 500025, norte: 8665017, cota: 100.45, codigo: 'BOR', descripcion: 'Borde' }
        ],
        perfil: [
          { progresiva: '0+000', distanciaParcial: 0, cotaTerreno: 100.00, cotaRasante: 100.10, observacion: 'Inicio' },
          { progresiva: '0+020', distanciaParcial: 20, cotaTerreno: 100.32, cotaRasante: 100.30, observacion: 'Eje' },
          { progresiva: '0+040', distanciaParcial: 20, cotaTerreno: 100.80, cotaRasante: 100.50, observacion: 'Corte' }
        ],
        secciones: [
          { progresiva: '0+020', lado: 'Izq.', offset: -5, cotaTerreno: 100.40, cotaProyecto: 100.20, observacion: 'Sección vía' },
          { progresiva: '0+020', lado: 'Eje', offset: 0, cotaTerreno: 100.32, cotaProyecto: 100.30, observacion: 'Eje' },
          { progresiva: '0+020', lado: 'Der.', offset: 5, cotaTerreno: 100.25, cotaProyecto: 100.20, observacion: 'Sección vía' }
        ],
        replanteo: [
          { punto: 'C1', esteDiseno: 500010, norteDiseno: 8665010, cotaDiseno: 100.5, esteCampo: 500010.012, norteCampo: 8665009.991, cotaCampo: 100.505, observacion: 'Eje columna' }
        ]
      }
    };
  }
  function activeProject() { return state.projects.find(p => p.id === state.activeId) || null; }
  function ensureProject() {
    let p = activeProject();
    if (!p) {
      p = defaultProject(); state.projects.push(p); state.activeId = p.id;
    }
    return p;
  }
  function scheduleSave() {
    const p = activeProject();
    if (!p) return;
    $('#saveStatus').textContent = 'Guardando…';
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(async () => {
      await dbPut(p);
      await loadProjects(false);
      $('#saveStatus').textContent = 'Guardado ' + new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      renderProjectSelect();
    }, AUTOSAVE_MS);
  }

  function header(title, subtitle) {
    return `<div class="module-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle || '')}</p></div></div>`;
  }
  function moduleCard(title, subtitle, html) {
    return `<section class="card">${header(title, subtitle)}${html || ''}</section>`;
  }


  function iconSVG(id) {
    const icons = {
      dashboard: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
      datos: '<path d="M7 3h10l3 3v15H4V3h3z"/><path d="M14 3v5h5"/><path d="M7 13h10M7 17h7"/>',
      cinta: '<path d="M4 15h16"/><path d="M6 12v6M10 12v6M14 12v6M18 12v6"/><path d="M5 8a7 7 0 0 1 14 0"/>',
      brujula: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-2 6-6 2 2-6z"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>',
      poligonal: '<path d="M5 17l4-10 6 4 4-6"/><path d="M5 17l7 3 7-5"/><circle cx="5" cy="17" r="1.4"/><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="11" r="1.4"/><circle cx="19" cy="5" r="1.4"/>',
      radiacion: '<circle cx="12" cy="12" r="2"/><path d="M12 12L4 5M12 12l8-6M12 12l7 8M12 12l-8 6"/><circle cx="4" cy="5" r="1.2"/><circle cx="20" cy="6" r="1.2"/><circle cx="19" cy="20" r="1.2"/>',
      nivel_simple: '<path d="M4 15h16"/><path d="M7 15l3-8h4l3 8"/><path d="M9 7h6"/><path d="M6 19h12"/>',
      nivel_compuesta: '<path d="M3 18h18"/><path d="M5 14l3-7h3l3 7"/><path d="M14 14l2-5h3l2 5"/><path d="M4 10h3M17 7h4"/>',
      taquimetria: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/><path d="M8 16l8-8"/><circle cx="12" cy="12" r="2"/>',
      estacion_total: '<path d="M9 8h6l2 3-2 3H9l-2-3z"/><circle cx="12" cy="11" r="2"/><path d="M12 14v7M7 21l5-7 5 7"/>',
      perfil: '<path d="M4 18h16"/><path d="M4 15c4-8 8 3 12-5 2-4 3-4 4-5"/><path d="M4 21h16M7 18v3M12 18v3M17 18v3"/>',
      secciones: '<path d="M4 17h16"/><path d="M5 15c3-8 5 2 8-2s4-4 6-6"/><path d="M12 4v17"/>',
      replanteo: '<path d="M12 21s7-5 7-11a7 7 0 0 0-14 0c0 6 7 11 7 11z"/><circle cx="12" cy="10" r="2"/><path d="M3 21h18"/>',
      herramientas: '<path d="M14 7l3-3 3 3-3 3z"/><path d="M4 20l7-7"/><path d="M7 17l-2-2"/><path d="M3 5h8M3 9h5M16 14h5M16 18h3"/>',
      reportes: '<path d="M6 9V3h12v6"/><path d="M6 17H4v-6h16v6h-2"/><path d="M6 14h12v7H6z"/><path d="M8 17h8"/>'
    };
    return `<span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[id] || icons.dashboard}</svg></span>`;
  }

  function renderNav() {
    const nav = $('#moduleNav');
    nav.innerHTML = modules.map(m => `<button class="nav-btn ${state.module === m.id ? 'active' : ''}" data-module="${m.id}" type="button">${iconSVG(m.id)}${m.label}</button>`).join('');
    if (nav.dataset.bound !== '1') {
      nav.dataset.bound = '1';
      nav.addEventListener('click', e => {
        const btn = e.target.closest('[data-module]');
        if (!btn) return;
        state.module = btn.dataset.module;
        $('#sidebar').classList.remove('open');
        render();
      });
    }
  }
  function renderProjectSelect() {
    const select = $('#projectSelect');
    select.innerHTML = state.projects.map(p => `<option value="${p.id}" ${p.id === state.activeId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
    const p = activeProject();
    $('#activeProjectName').textContent = p ? p.name : 'Sin proyecto activo';
  }
  async function loadProjects(selectFirst = true) {
    const all = await dbGetAll();
    state.projects = all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (selectFirst && state.projects.length && !state.activeId) state.activeId = state.projects[0].id;
  }

  function bindGeneralInputs(root, object, prefix = '') {
    $$('[data-field]', root).forEach(el => {
      const key = el.dataset.field;
      const path = prefix ? prefix + '.' + key : key;
      const value = path.split('.').reduce((o, k) => o?.[k], object);
      if (el.type === 'checkbox') el.checked = Boolean(value); else el.value = value ?? '';
      el.addEventListener('input', () => {
        setByPath(object, path, el.type === 'checkbox' ? el.checked : el.value);
        scheduleSave();
        if (key === 'name') renderProjectSelect();
      });
      el.addEventListener('change', () => {
        setByPath(object, path, el.type === 'checkbox' ? el.checked : el.value);
        scheduleSave();
        renderProjectSelect();
      });
    });
  }
  function setByPath(obj, path, value) {
    const parts = path.split('.');
    let ref = obj;
    while (parts.length > 1) {
      const p = parts.shift();
      if (!ref[p]) ref[p] = {};
      ref = ref[p];
    }
    ref[parts[0]] = value;
  }

  function field(label, name, value = '', type = 'text', extra = '') {
    return `<div class="field"><label>${escapeHtml(label)}</label><input data-field="${escapeHtml(name)}" value="${escapeHtml(value)}" type="${type}" ${extra}></div>`;
  }
  function textarea(label, name, value = '') {
    return `<div class="field"><label>${escapeHtml(label)}</label><textarea data-field="${escapeHtml(name)}">${escapeHtml(value)}</textarea></div>`;
  }
  function selectField(label, name, value, options) {
    return `<div class="field"><label>${escapeHtml(label)}</label><select data-field="${escapeHtml(name)}">${options.map(o => `<option value="${escapeHtml(o)}" ${o === value ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select></div>`;
  }

  function renderEditableTable({ rows, columns, moduleKey, title, subtitle, compute, extrasHtml = '', afterHtml = '', minWidth = 900 }) {
    const computed = compute ? compute(rows) : { rows };
    const cRows = computed.rows || rows;
    const tableId = 'tbl_' + moduleKey;
    return `
      ${extrasHtml}
      <div class="toolbar">
        <button class="btn primary small" data-action="add-row" data-module-key="${moduleKey}" type="button">+ Agregar fila</button>
        <button class="btn small" data-action="export-csv" data-module-key="${moduleKey}" type="button">Exportar CSV</button>
        <button class="btn small" data-action="export-xls" data-module-key="${moduleKey}" type="button">Exportar Excel</button>
        <button class="btn small" data-action="import-csv" data-module-key="${moduleKey}" type="button">Importar CSV/TXT</button>
        <button class="btn small" data-action="print-module" type="button">Imprimir / PDF</button>
      </div>
      <div class="table-wrap"><table id="${tableId}" style="min-width:${minWidth}px">
        <thead><tr>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th class="no-print">Acciones</th></tr></thead>
        <tbody>
        ${cRows.map((r, i) => `<tr>${columns.map(c => renderCell(c, r, i, moduleKey)).join('')}<td class="row-actions no-print">
          <button class="btn small" data-action="insert-above" data-module-key="${moduleKey}" data-index="${i}" title="Insertar arriba" aria-label="Insertar fila arriba">↑</button>
          <button class="btn small" data-action="insert-below" data-module-key="${moduleKey}" data-index="${i}" title="Insertar abajo" aria-label="Insertar fila abajo">↓</button>
          <button class="btn small" data-action="duplicate-row" data-module-key="${moduleKey}" data-index="${i}" title="Duplicar" aria-label="Duplicar fila">⧉</button>
          <button class="btn small danger" data-action="delete-row" data-module-key="${moduleKey}" data-index="${i}" title="Eliminar" aria-label="Eliminar fila">🗑</button>
        </td></tr>`).join('')}
        </tbody>
      </table></div>
      ${computed.summary ? `<div class="calc-box" data-sum="${moduleKey}">${computed.summary}</div>` : ''}
      <div data-chart-wrap="${moduleKey}">${renderModuleChart(moduleKey, cRows, computed)}</div>
      ${afterHtml}`;
  }
  function renderCell(c, row, i, moduleKey) {
    const val = row[c.key] ?? '';
    // data-ro permite actualizar solo celdas calculadas sin re-render completo
    if (c.readonly) return `<td class="readonly" data-ro="${escapeHtml(moduleKey)}|${i}|${escapeHtml(c.key)}">${escapeHtml(String(c.format ? c.format(val, row, i) : val))}</td>`;
    if (c.type === 'select') {
      return `<td><select data-table-input data-module-key="${moduleKey}" data-index="${i}" data-key="${c.key}">${c.options.map(o => `<option value="${escapeHtml(o)}" ${String(o) === String(val) ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select></td>`;
    }
    return `<td><input data-table-input data-module-key="${moduleKey}" data-index="${i}" data-key="${c.key}" type="${c.type || 'text'}" value="${escapeHtml(val)}" ${c.step ? `step="${c.step}"` : ''}></td>`;
  }

  const moduleRows = (p, key) => {
    const val = p.modules[key];
    if (Array.isArray(val)) return val;
    if (val && Array.isArray(val.rows)) return val.rows;
    return [];
  };
  function mutateRows(moduleKey, fn) {
    const p = ensureProject();
    const container = p.modules[moduleKey];
    let rows = Array.isArray(container) ? container : container.rows;
    fn(rows, container);
    scheduleSave();
    render();
  }
  function emptyRow(columns) {
    const row = {};
    columns.forEach(c => { if (!c.readonly) row[c.key] = c.default ?? ''; });
    return row;
  }
  function columnsFor(moduleKey) { return tableConfigs[moduleKey]?.columns || []; }

  const tableConfigs = {};

  function attachTableHandlers(root) {
    if (root.dataset.tableHandlersBound === '1') return;
    root.dataset.tableHandlersBound = '1';
    root.addEventListener('change', e => {
      const inp = e.target.closest('[data-table-input]');
      if (!inp) return;
      const p = ensureProject();
      const key = inp.dataset.moduleKey;
      const rows = moduleRows(p, key);
      const index = Number(inp.dataset.index);
      const field = inp.dataset.key;
      if (rows[index]) rows[index][field] = inp.value;
      scheduleSave();
      updateReadonlyCells(key); // actualización quirúrgica: solo celdas calculadas
    });
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const key = btn.dataset.moduleKey;
      const index = Number(btn.dataset.index);
      if (['add-row', 'insert-above', 'insert-below', 'duplicate-row', 'delete-row'].includes(action)) {
        const cols = columnsFor(key);
        mutateRows(key, (rows) => {
          if (action === 'add-row') rows.push(emptyRow(cols));
          if (action === 'insert-above') rows.splice(index, 0, emptyRow(cols));
          if (action === 'insert-below') rows.splice(index + 1, 0, emptyRow(cols));
          if (action === 'duplicate-row') rows.splice(index + 1, 0, deepClone(rows[index] || emptyRow(cols)));
          if (action === 'delete-row' && confirm('¿Eliminar esta fila?')) rows.splice(index, 1);
        });
      }
      if (action === 'export-csv') exportModuleCSV(key);
      if (action === 'export-xls') exportModuleXLS(key);
      if (action === 'import-csv') importModuleCSV(key);
      if (action === 'print-module') printCurrentModule();
    });
  }

  function rowsToCSV(rows, columns) {
    const cols = columns.filter(c => !c.noExport);
    const head = cols.map(c => c.label).join(';');
    const body = rows.map(r => cols.map(c => csvCell(r[c.key] ?? '')).join(';')).join('\n');
    return head + '\n' + body;
  }
  function csvCell(v) { return '"' + String(v ?? '').replace(/"/g, '""') + '"'; }
  function exportModuleCSV(key) {
    const p = ensureProject();
    const rows = computeForExport(key);
    const cols = exportColumnsFor(key);
    download(`${safeName(p.name)}_${key}.csv`, rowsToCSV(rows, cols), 'text/csv;charset=utf-8');
  }
  function exportModuleXLS(key) {
    const p = ensureProject();
    const rows = computeForExport(key);
    const cols = exportColumnsFor(key);
    const sheetName = (modules.find(m => m.id === key)?.label || key).slice(0, 31);
    const xlsx = buildXLSX(sheetName, cols, rows);
    download(`${safeName(p.name)}_${key}.xlsx`, xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  function xmlEscape(v) { return String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function buildXLSX(sheetName, cols, rows) {
    const safeSheet = xmlEscape(sheetName || 'Datos');
    const data = [cols.map(c => c.label)].concat(rows.map(r => cols.map(c => r[c.key] ?? '')));
    const sheetRows = data.map((row, ri) => `<row r="${ri + 1}">${row.map((v, ci) => {
      const ref = `${colName(ci + 1)}${ri + 1}`;
      const raw = String(v ?? '').replace(',', '.');
      const numeric = raw !== '' && Number.isFinite(Number(raw)) && !String(v).match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/);
      if (numeric) return `<c r="${ref}"><v>${Number(raw)}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
    const content = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
    return zipStore({ '[Content_Types].xml': content, '_rels/.rels': rels, 'xl/workbook.xml': workbookXml, 'xl/_rels/workbook.xml.rels': wbRels, 'xl/worksheets/sheet1.xml': sheetXml });
  }
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  function concatBytes(parts) { const len = parts.reduce((a, b) => a + b.length, 0); const out = new Uint8Array(len); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; }
  function zipStore(files) {
    const enc = new TextEncoder(); let offset = 0; const locals = [], centrals = [];
    Object.entries(files).forEach(([name, text]) => {
      const nameBytes = enc.encode(name); const data = enc.encode(text); const crc = crc32(data);
      const local = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)]);
      locals.push(local, nameBytes, data);
      const central = new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]);
      centrals.push(central, nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    const centralStart = offset; const centralBytes = concatBytes(centrals); const centralSize = centralBytes.length; const count = Object.keys(files).length;
    const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(centralSize), ...u32(centralStart), ...u16(0)]);
    return concatBytes([...locals, centralBytes, end]);
  }
  function safeName(s) { return String(s || 'proyecto').replace(/[^\w\-áéíóúñ]+/gi, '_').slice(0, 60); }
  function parseDelimited(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    const sample = lines[0] || '';
    const delimiters = [';', ',', '\t'];
    let delim = delimiters.sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
    if (sample.split(delim).length < 2) delim = /\s+/;
    return lines.map(line => String(line).split(delim).map(v => v.trim().replace(/^"|"$/g, '')));
  }
  function importModuleCSV(key) {
    const input = $('#fileInput');
    input.accept = '.csv,.txt';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const text = await file.text();
      const data = parseDelimited(text);
      const cols = columnsFor(key).filter(c => !c.readonly);
      const first = data[0] || [];
      const hasHeader = first.some(v => cols.some(c => normalize(v).includes(normalize(c.key)) || normalize(v).includes(normalize(c.label))));
      const rowsRaw = hasHeader ? data.slice(1) : data;
      mutateRows(key, (rows) => {
        rows.length = 0;
        rowsRaw.forEach(arr => {
          const obj = emptyRow(cols);
          cols.forEach((c, i) => { obj[c.key] = arr[i] ?? ''; });
          rows.push(obj);
        });
      });
      input.value = '';
    };
    input.click();
  }
  function normalize(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }

  function calcCinta(rows) {
    let sum = 0;
    const out = rows.map(r => {
      const d = parseNum(r.distancia);
      const p = parseNum(r.pendiente);
      const dh = d / Math.sqrt(1 + Math.pow(p / 100, 2));
      sum += dh;
      return { ...r, distanciaHorizontal: round(dh, 4) };
    });
    return { rows: out, summary: `<strong>Perímetro/sumatoria horizontal:</strong> ${fmt(sum)} m. <span class="formula">DH = D / √(1 + (p/100)²)</span>` };
  }
  tableConfigs.cinta = {
    columns: [
      { key: 'puntoInicial', label: 'Punto inicial' }, { key: 'puntoFinal', label: 'Punto final' }, { key: 'distancia', label: 'Distancia medida (m)', type: 'number', step: '0.001' }, { key: 'pendiente', label: 'Pendiente %', type: 'number', step: '0.001', default: 0 }, { key: 'distanciaHorizontal', label: 'Dist. horizontal (m)', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
    ], compute: calcCinta
  };

  function rumboToAz(rumboDeg, cuadrante) {
    const a = parseNum(rumboDeg);
    if (cuadrante === 'NE') return normAz(a);
    if (cuadrante === 'SE') return normAz(180 - a);
    if (cuadrante === 'SW') return normAz(180 + a);
    if (cuadrante === 'NW') return normAz(360 - a);
    return normAz(a);
  }
  function azToRumbo(az) {
    const a = normAz(az);
    if (a >= 0 && a <= 90) return { q: 'NE', deg: a };
    if (a > 90 && a <= 180) return { q: 'SE', deg: 180 - a };
    if (a > 180 && a <= 270) return { q: 'SW', deg: a - 180 };
    return { q: 'NW', deg: 360 - a };
  }
  function calcBrujula(rows) {
    const out = rows.map(r => {
      const az = rumboToAz(r.rumboDeg, r.cuadrante);
      const azc = normAz(az + parseNum(r.declinacion));
      const d = parseNum(r.distancia);
      return { ...r, azimut: round(az, 6), azimutCorregido: round(azc, 6), deltaE: round(d * Math.sin(degToRad(azc)), 4), deltaN: round(d * Math.cos(degToRad(azc)), 4) };
    });
    return { rows: out, summary: `<strong>Convención usada:</strong> declinación Este positiva. <span class="formula">Az verdadero = Az magnético + declinación</span>. Revise interferencias por atracción local.` };
  }
  tableConfigs.brujula = {
    columns: [
      { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto visado' }, { key: 'rumboDeg', label: 'Rumbo (°)', type: 'number', step: '0.0001' }, { key: 'cuadrante', label: 'Cuadrante', type: 'select', options: ['NE', 'SE', 'SW', 'NW'], default: 'NE' }, { key: 'distancia', label: 'Distancia (m)', type: 'number', step: '0.001' }, { key: 'declinacion', label: 'Declinación (°)', type: 'number', step: '0.0001', default: 0 }, { key: 'azimut', label: 'Azimut (°)', readonly: true, format: v => fmt(parseNum(v), 4) }, { key: 'azimutCorregido', label: 'Az. corregido (°)', readonly: true, format: v => fmt(parseNum(v), 4) }, { key: 'deltaE', label: 'ΔE (m)', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN (m)', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
    ], compute: calcBrujula
  };

  function calcPoligonalStruct(poly) {
    let e = parseNum(poly.startE), n = parseNum(poly.startN);
    let sumE = 0, sumN = 0, total = 0;
    const out = (poly.rows || []).map(r => {
      const az = rumboToAz(r.rumboDeg, r.cuadrante);
      const d = parseNum(r.distancia);
      const de = d * Math.sin(degToRad(az));
      const dn = d * Math.cos(degToRad(az));
      sumE += de; sumN += dn; total += d;
      e += de; n += dn;
      return { ...r, azimut: round(az, 6), deltaE: round(de, 4), deltaN: round(dn, 4), esteCalc: round(e, 4), norteCalc: round(n, 4) };
    });
    const elc = Math.sqrt(sumE * sumE + sumN * sumN);
    const precision = elc > 0 ? total / elc : Infinity;
    return { rows: out, sumE, sumN, total, elc, precision };
  }
  tableConfigs.poligonal = {
    columns: [
      { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto adelante' }, { key: 'rumboDeg', label: 'Rumbo (°)', type: 'number', step: '0.0001' }, { key: 'cuadrante', label: 'Cuadrante', type: 'select', options: ['NE', 'SE', 'SW', 'NW'], default: 'NE' }, { key: 'distancia', label: 'Distancia (m)', type: 'number', step: '0.001' }, { key: 'azimut', label: 'Azimut (°)', readonly: true, format: v => fmt(parseNum(v), 4) }, { key: 'deltaE', label: 'ΔE', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'esteCalc', label: 'Este calc.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'norteCalc', label: 'Norte calc.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
    ]
  };

  function calcRadiacionStruct(rad) {
    const se = parseNum(rad.stationE), sn = parseNum(rad.stationN);
    const out = (rad.rows || []).map(r => {
      const az = normAz(r.azimut);
      const d = parseNum(r.distancia);
      const de = d * Math.sin(degToRad(az));
      const dn = d * Math.cos(degToRad(az));
      return { ...r, deltaE: round(de, 4), deltaN: round(dn, 4), este: round(se + de, 4), norte: round(sn + dn, 4) };
    });
    return { rows: out };
  }
  tableConfigs.radiacion = {
    columns: [
      { key: 'punto', label: 'Punto' }, { key: 'azimut', label: 'Azimut (°)', type: 'number', step: '0.0001' }, { key: 'distancia', label: 'Distancia (m)', type: 'number', step: '0.001' }, { key: 'deltaE', label: 'ΔE', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'este', label: 'Este', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'norte', label: 'Norte', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'codigo', label: 'Código' }, { key: 'descripcion', label: 'Descripción' }
    ]
  };

  function calcNivelSimpleStruct(mod) {
    const cotaInicial = parseNum(mod.cotaInicial);
    let ai = null;
    let lastCota = cotaInicial; // Cota del último punto de vuelta (adelante)
    const out = (mod.rows || []).map((r) => {
      // Recalcular AI cada vez que aparece una nueva lectura atrás válida
      if (isNum(r.atras)) ai = lastCota + parseNum(r.atras);
      if (ai === null) ai = cotaInicial;
      const lectura = isNum(r.intermedia) ? parseNum(r.intermedia)
        : isNum(r.adelante) ? parseNum(r.adelante)
          : isNum(r.atras) ? parseNum(r.atras) : 0;
      const cota = round(ai - lectura, 4);
      if (isNum(r.adelante)) lastCota = cota; // Actualizar cota de referencia en puntos de cambio
      return { ...r, ai: round(ai, 4), cota };
    });
    return { rows: out, ai };
  }
  tableConfigs.nivel_simple = {
    columns: [
      { key: 'punto', label: 'Punto' }, { key: 'atras', label: 'Lect. atrás', type: 'number', step: '0.001' }, { key: 'intermedia', label: 'Lect. intermedia', type: 'number', step: '0.001' }, { key: 'adelante', label: 'Lect. adelante', type: 'number', step: '0.001' }, { key: 'ai', label: 'AI', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'cota', label: 'Cota', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
    ]
  };

  function calcNivelCompuestaStruct(mod) {
    let currentCota = parseNum(mod.cotaInicial);
    let ai = null, lastFinal = currentCota;
    const out = (mod.rows || []).map((r) => {
      if (isNum(r.atras)) ai = currentCota + parseNum(r.atras);
      let cota = '';
      if (ai !== null) {
        if (isNum(r.intermedia)) cota = ai - parseNum(r.intermedia);
        if (isNum(r.adelante)) { cota = ai - parseNum(r.adelante); currentCota = cota; lastFinal = cota; }
        if (isNum(r.atras) && !isNum(r.intermedia) && !isNum(r.adelante)) cota = currentCota;
      }
      return { ...r, ai: ai === null ? '' : round(ai, 4), cota: cota === '' ? '' : round(cota, 4) };
    });
    return { rows: out, cierre: lastFinal - parseNum(mod.cotaInicial) };
  }
  tableConfigs.nivel_compuesta = {
    columns: [
      { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto' }, { key: 'atras', label: 'Lect. atrás', type: 'number', step: '0.001' }, { key: 'intermedia', label: 'Lect. intermedia', type: 'number', step: '0.001' }, { key: 'adelante', label: 'Lect. adelante', type: 'number', step: '0.001' }, { key: 'ai', label: 'AI', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v)) }, { key: 'cota', label: 'Cota', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
    ]
  };

  function calcTaquimetria(rows) {
    const out = rows.map(r => {
      const hs = parseNum(r.hiloSuperior), hm = parseNum(r.hiloMedio), hi = parseNum(r.hiloInferior), k = parseNum(r.k, 100), c = parseNum(r.c), theta = degToRad(r.anguloVertical);
      const s = hs - hi;
      const dh = k * s * Math.pow(Math.cos(theta), 2) + c * Math.cos(theta);
      const v = (k * s / 2) * Math.sin(2 * theta) + c * Math.sin(theta);
      const cota = parseNum(r.cotaEstacion) + parseNum(r.alturaInstrumento) + v - hm;
      return { ...r, intervalo: round(s, 4), distanciaHorizontal: round(dh, 4), desnivel: round(v, 4), cotaPunto: round(cota, 4) };
    });
    return { rows: out, summary: `<span class="formula">s = HS - HI</span> · <span class="formula">DH = K·s·cos²θ + C·cosθ</span> · <span class="formula">CotaP = CotaE + HI + V - HM</span>` };
  }
  tableConfigs.taquimetria = {
    columns: [
      { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto' }, { key: 'cotaEstacion', label: 'Cota estación', type: 'number', step: '0.001' }, { key: 'alturaInstrumento', label: 'Alt. instrumento', type: 'number', step: '0.001' }, { key: 'hiloSuperior', label: 'Hilo superior', type: 'number', step: '0.001' }, { key: 'hiloMedio', label: 'Hilo medio', type: 'number', step: '0.001' }, { key: 'hiloInferior', label: 'Hilo inferior', type: 'number', step: '0.001' }, { key: 'anguloVertical', label: 'Ángulo vertical (°)', type: 'number', step: '0.0001' }, { key: 'k', label: 'K', type: 'number', step: '0.001', default: 100 }, { key: 'c', label: 'C', type: 'number', step: '0.001', default: 0 }, { key: 'intervalo', label: 's', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'distanciaHorizontal', label: 'DH', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'desnivel', label: 'V', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'cotaPunto', label: 'Cota punto', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'descripcion', label: 'Descripción' }
    ], compute: calcTaquimetria, minWidth: 1300
  };

  function calcEstacion(rows) {
    let prev = null;
    const out = rows.map(r => {
      let dist = '', az = '', pend = '';
      if (prev) {
        const de = parseNum(r.este) - parseNum(prev.este), dn = parseNum(r.norte) - parseNum(prev.norte), dz = parseNum(r.cota) - parseNum(prev.cota);
        dist = Math.sqrt(de * de + dn * dn);
        az = normAz(radToDeg(Math.atan2(de, dn)));
        pend = dist ? dz / dist * 100 : 0;
      }
      prev = r;
      return { ...r, distanciaPrev: dist === '' ? '' : round(dist, 4), azimutPrev: az === '' ? '' : round(az, 6), pendientePrev: pend === '' ? '' : round(pend, 4) };
    });
    return { rows: out, summary: `<strong>Importación:</strong> admite CSV/TXT. Orden recomendado: punto, Este, Norte, Cota, código, descripción. También puede editarse manualmente.` };
  }
  tableConfigs.estacion_total = {
    columns: [
      { key: 'punto', label: 'Punto' }, { key: 'este', label: 'Este', type: 'number', step: '0.001' }, { key: 'norte', label: 'Norte', type: 'number', step: '0.001' }, { key: 'cota', label: 'Cota', type: 'number', step: '0.001' }, { key: 'codigo', label: 'Código' }, { key: 'descripcion', label: 'Descripción' }, { key: 'distanciaPrev', label: 'Dist. a anterior', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v)) }, { key: 'azimutPrev', label: 'Az. a anterior', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v), 4) }, { key: 'pendientePrev', label: 'Pendiente %', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v), 3) }
    ], compute: calcEstacion
  };

  function calcPerfil(rows) {
    let acc = 0;
    let prevCota = null;
    const out = rows.map((r, i) => {
      acc += parseNum(r.distanciaParcial);
      const dif = parseNum(r.cotaTerreno) - parseNum(r.cotaRasante);
      const pend = i && parseNum(r.distanciaParcial) ? (parseNum(r.cotaTerreno) - prevCota) / parseNum(r.distanciaParcial) * 100 : 0;
      prevCota = parseNum(r.cotaTerreno);
      return { ...r, distanciaAcumulada: round(acc, 4), diferencia: round(dif, 4), pendiente: round(pend, 4), estado: dif > 0 ? 'Corte' : dif < 0 ? 'Relleno' : 'A nivel' };
    });
    return { rows: out };
  }
  tableConfigs.perfil = {
    columns: [
      { key: 'progresiva', label: 'Progresiva' }, { key: 'distanciaParcial', label: 'Dist. parcial', type: 'number', step: '0.001' }, { key: 'distanciaAcumulada', label: 'Dist. acum.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'cotaTerreno', label: 'Cota terreno', type: 'number', step: '0.001' }, { key: 'cotaRasante', label: 'Cota rasante', type: 'number', step: '0.001' }, { key: 'diferencia', label: 'Dif.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'pendiente', label: 'Pendiente %', readonly: true, format: v => fmt(parseNum(v), 3) }, { key: 'estado', label: 'Estado', readonly: true }, { key: 'observacion', label: 'Observación' }
    ], compute: calcPerfil
  };

  function calcSecciones(rows) {
    const out = rows.map(r => {
      const dif = parseNum(r.cotaTerreno) - parseNum(r.cotaProyecto);
      return { ...r, diferencia: round(dif, 4), estado: dif > 0 ? 'Corte' : dif < 0 ? 'Relleno' : 'A nivel' };
    });
    return { rows: out };
  }
  tableConfigs.secciones = {
    columns: [
      { key: 'progresiva', label: 'Progresiva' }, { key: 'lado', label: 'Lado' }, { key: 'offset', label: 'Offset (m)', type: 'number', step: '0.001' }, { key: 'cotaTerreno', label: 'Cota terreno', type: 'number', step: '0.001' }, { key: 'cotaProyecto', label: 'Cota proyecto', type: 'number', step: '0.001' }, { key: 'diferencia', label: 'Dif.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'estado', label: 'Estado', readonly: true }, { key: 'observacion', label: 'Observación' }
    ], compute: calcSecciones
  };

  function calcReplanteo(rows) {
    const out = rows.map(r => {
      const de = parseNum(r.esteCampo) - parseNum(r.esteDiseno), dn = parseNum(r.norteCampo) - parseNum(r.norteDiseno), dz = parseNum(r.cotaCampo) - parseNum(r.cotaDiseno);
      return { ...r, deltaE: round(de, 4), deltaN: round(dn, 4), deltaZ: round(dz, 4), distanciaError: round(Math.sqrt(de * de + dn * dn), 4), estado: 'Verificar tolerancia del expediente' };
    });
    return { rows: out, summary: `<strong>Advertencia:</strong> las tolerancias de replanteo deben tomarse del expediente técnico, norma aplicable o entidad contratante.` };
  }
  tableConfigs.replanteo = {
    columns: [
      { key: 'punto', label: 'Punto' }, { key: 'esteDiseno', label: 'Este diseño', type: 'number', step: '0.001' }, { key: 'norteDiseno', label: 'Norte diseño', type: 'number', step: '0.001' }, { key: 'cotaDiseno', label: 'Cota diseño', type: 'number', step: '0.001' }, { key: 'esteCampo', label: 'Este campo', type: 'number', step: '0.001' }, { key: 'norteCampo', label: 'Norte campo', type: 'number', step: '0.001' }, { key: 'cotaCampo', label: 'Cota campo', type: 'number', step: '0.001' }, { key: 'deltaE', label: 'ΔE', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaZ', label: 'ΔZ', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'distanciaError', label: 'Error H', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'estado', label: 'Estado', readonly: true }, { key: 'observacion', label: 'Observación' }
    ], compute: calcReplanteo, minWidth: 1200
  };

  /** Centraliza el cálculo de cualquier módulo y devuelve {rows, summary, ...} */
  function getComputedModule(moduleKey, p) {
    if (moduleKey === 'poligonal') return calcPoligonalStruct(p.modules.poligonal);
    if (moduleKey === 'radiacion') return calcRadiacionStruct(p.modules.radiacion);
    if (moduleKey === 'nivel_simple') return calcNivelSimpleStruct(p.modules.nivel_simple);
    if (moduleKey === 'nivel_compuesta') return calcNivelCompuestaStruct(p.modules.nivel_compuesta);
    const cfg = tableConfigs[moduleKey];
    const rows = moduleRows(p, moduleKey);
    return cfg?.compute ? cfg.compute(rows) : { rows };
  }

  /**
   * Actualiza solo las celdas readonly y los resúmenes del módulo activo
   * sin reconstruir todo el DOM (evita pérdida de foco y parpadeo).
   */
  function updateReadonlyCells(moduleKey) {
    const p = activeProject();
    if (!p) return;
    const computed = getComputedModule(moduleKey, p);
    const cRows = computed.rows || [];
    const cols = (tableConfigs[moduleKey]?.columns || []).filter(c => c.readonly);
    const content = $('#content');

    // Actualizar cada celda calculada de la tabla por su selector único
    cRows.forEach((row, i) => {
      cols.forEach(col => {
        const td = content.querySelector(`td[data-ro="${moduleKey}|${i}|${col.key}"]`);
        if (!td) return;
        const val = row[col.key] ?? '';
        td.textContent = col.format ? col.format(val, row, i) : String(val);
      });
    });

    // Actualizar el resumen genérico (calc-box con data-sum)
    const sumEl = content.querySelector(`[data-sum="${moduleKey}"]`);
    if (sumEl) sumEl.innerHTML = computed.summary || '';

    // Actualizar el gráfico del módulo en su contenedor
    const chartWrap = content.querySelector(`[data-chart-wrap="${moduleKey}"]`);
    if (chartWrap) chartWrap.innerHTML = renderModuleChart(moduleKey, cRows, computed);

    // Resúmenes específicos que viven fuera de la tabla (extras)
    if (moduleKey === 'poligonal') {
      const polySum = content.querySelector('[data-poly-sum]');
      if (polySum) polySum.innerHTML =
        `<strong>ΣΔE:</strong> ${fmt(computed.sumE)} m · <strong>ΣΔN:</strong> ${fmt(computed.sumN)} m · ` +
        `<strong>Error lineal:</strong> ${fmt(computed.elc)} m · <strong>Perímetro:</strong> ${fmt(computed.total)} m · ` +
        `<strong>Precisión relativa referencial:</strong> 1/${Number.isFinite(computed.precision) ? fmt(computed.precision, 0) : '∞'}` +
        `<br><span class="formula">ELC = √((ΣΔE)² + (ΣΔN)²)</span>`;
    }
    if (moduleKey === 'nivel_simple') {
      const nsEl = content.querySelector('[data-nivel-simple-ai]');
      if (nsEl) nsEl.innerHTML =
        `<strong>Altura de instrumento:</strong> ${fmt(computed.ai || 0)} m. ` +
        `<span class="formula">AI = Cota conocida + Lectura atrás</span>`;
    }
    if (moduleKey === 'nivel_compuesta') {
      const ncEl = content.querySelector('[data-nivel-compuesta-cierre]');
      if (ncEl) ncEl.innerHTML =
        `<strong>Diferencia acumulada desde BM:</strong> ${fmt(computed.cierre || 0)} m. ` +
        `<span class="formula">Cota = AI - lectura</span>`;
    }
  }

  /** Usa getComputedModule para simplificar la exportación */
  function computeForExport(key) {
    const p = ensureProject();
    return getComputedModule(key, p).rows;
  }
  function exportColumnsFor(key) { return tableConfigs[key]?.columns || []; }

  function render() {
    document.documentElement.dataset.theme = state.theme;
    const p = ensureProject();
    renderNav();
    renderProjectSelect();
    $('#content').innerHTML = renderModule(p, state.module);
    attachDynamicHandlers($('#content'));
  }
  function renderModule(p, id) {
    switch (id) {
      case 'dashboard': return renderDashboard(p);
      case 'datos': return renderDatos(p);
      case 'cinta': return renderTableModule('cinta', 'Levantamiento con cinta', 'Registra distancias, pendientes y distancias horizontales.', tableConfigs.cinta.compute);
      case 'brujula': return renderTableModule('brujula', 'Brújula, rumbos y azimuts', 'Convierte rumbos, aplica declinación y calcula proyecciones básicas.', tableConfigs.brujula.compute);
      case 'poligonal': return renderPoligonal(p);
      case 'radiacion': return renderRadiacion(p);
      case 'nivel_simple': return renderNivelSimple(p);
      case 'nivel_compuesta': return renderNivelCompuesta(p);
      case 'taquimetria': return renderTableModule('taquimetria', 'Taquimetría', 'Calcula intervalo estadimétrico, distancia horizontal, desnivel y cota del punto.', tableConfigs.taquimetria.compute);
      case 'estacion_total': return renderTableModule('estacion_total', 'Estación total', 'Ingreso manual o importación CSV/TXT de puntos con coordenadas.', tableConfigs.estacion_total.compute);
      case 'perfil': return renderPerfil(p);
      case 'secciones': return renderTableModule('secciones', 'Secciones transversales', 'Compara terreno y proyecto por progresiva y offset.', tableConfigs.secciones.compute);
      case 'replanteo': return renderTableModule('replanteo', 'Replanteo', 'Compara puntos de diseño y puntos replanteados en campo.', tableConfigs.replanteo.compute);
      case 'herramientas': return renderHerramientas(p);
      case 'reportes': return renderReportes(p);
      default: return renderDashboard(p);
    }
  }
  function renderDashboard(p) {
    const modCounts = Object.entries(p.modules).map(([k, v]) => [k, Array.isArray(v) ? v.length : Array.isArray(v.rows) ? v.rows.length : 0]);
    return moduleCard('Panel principal', 'Administra proyectos, respaldos e ingreso a módulos técnicos.', `
      <section class="institutional-cover">
        <div>
          <h3>Practicas de Topografia</h3>
          <p>Aplicativo institucional de campo y gabinete para topografía, taquimetría y cálculo técnico.</p>
          <div class="cover-author">Responsable: <strong>Jesus Alfonso Barrante Flores</strong></div>
          <div class="cover-tags"><span>Cinta</span><span>Brújula</span><span>Nivelación</span><span>Estación total</span><span>Perfil tipo guitarra</span></div>
        </div>
        <div class="cover-logo"><img src="assets/logo.svg" alt="Logo Practicas de Topografia"></div>
      </section>
      <div class="kpi-grid">
        <div class="kpi"><span>Proyecto activo</span><strong>${escapeHtml(p.name)}</strong></div>
        <div class="kpi"><span>Tipo de obra</span><strong>${escapeHtml(p.general.tipoObra || 'No definido')}</strong></div>
        <div class="kpi"><span>Última modificación</span><strong>${new Date(p.updatedAt).toLocaleDateString('es-PE')}</strong></div>
        <div class="kpi"><span>Módulos con datos</span><strong>${modCounts.filter(([, c]) => c > 0).length}</strong></div>
      </div>
      <div class="toolbar">
        <button class="btn primary" data-main-action="new-project" type="button">+ Nuevo proyecto</button>
        <button class="btn" data-main-action="duplicate-project" type="button">Duplicar proyecto</button>
        <button class="btn" data-main-action="export-project" type="button">Exportar JSON</button>
        <button class="btn" data-main-action="import-project" type="button">Importar JSON</button>
        <button class="btn danger" data-main-action="delete-project" type="button">Eliminar proyecto</button>
      </div>
      <h3>Proyectos guardados</h3>
      <div class="project-list">${state.projects.map(pr => `<article class="project-card"><h3>${escapeHtml(pr.name)}</h3><p>${escapeHtml(pr.general?.tipoObra || '')} · ${escapeHtml(pr.general?.distrito || pr.general?.ubicacion || 'Sin ubicación')}</p><p>Modificado: ${new Date(pr.updatedAt).toLocaleString('es-PE')}</p><div class="project-actions"><button class="btn small primary" data-open-project="${pr.id}">Abrir</button><button class="btn small" data-duplicate-project="${pr.id}">Duplicar</button><button class="btn small" data-export-project="${pr.id}">Exportar</button></div></article>`).join('') || '<div class="empty">No hay proyectos guardados.</div>'}</div>
      ${renderDashboardChart(modCounts)}
      <div class="alert"><strong>Versión funcional final:</strong> se incorporó portada institucional, logotipo, PWA offline, iconos técnicos y exportación directa a Excel por módulo.</div>
    `);
  }

  function renderDashboardChart(modCounts) {
    const rows = modCounts.filter(([, c]) => c > 0).map(([k, c]) => ({ label: modules.find(m => m.id === k)?.label || k, value: c }));
    if (!rows.length) return '';
    return `<div class="chart-panel dashboard-chart"><div class="chart-title"><strong>Resumen gráfico del proyecto</strong><span>Registros por módulo con datos.</span></div>${barChart(rows, 'Cantidad de registros por módulo', 'registros')}</div>`;
  }

  function renderDatos(p) {
    return moduleCard('Datos generales del trabajo', 'Registra ubicación, equipo, brigada, sistema de coordenadas y observaciones.', `
      <div class="grid cols-3">
        ${field('Nombre del proyecto', 'name', p.name)}
        ${selectField('Tipo de obra', 'general.tipoObra', p.general.tipoObra, ['Edificación', 'Vía', 'Saneamiento', 'Canal', 'Drenaje', 'Catastro', 'Otro'])}
        ${selectField('Estado', 'general.estado', p.general.estado, ['Borrador', 'En campo', 'En gabinete', 'Finalizado'])}
        ${field('Ubicación', 'general.ubicacion', p.general.ubicacion)}
        ${field('Departamento', 'general.departamento', p.general.departamento)}
        ${field('Provincia', 'general.provincia', p.general.provincia)}
        ${field('Distrito', 'general.distrito', p.general.distrito)}
        ${field('Coordenadas aproximadas', 'general.coordenadas', p.general.coordenadas)}
        ${field('Fecha', 'general.fecha', p.general.fecha, 'date')}
        ${field('Hora', 'general.hora', p.general.hora, 'time')}
        ${field('Responsable', 'general.responsable', p.general.responsable)}
        ${field('Operador', 'general.operador', p.general.operador)}
        ${field('Apuntador', 'general.apuntador', p.general.apuntador)}
        ${field('Croquista', 'general.croquista', p.general.croquista)}
        ${field('Auxiliares', 'general.auxiliares', p.general.auxiliares)}
        ${field('Equipo utilizado', 'general.equipo', p.general.equipo)}
        ${field('Marca/modelo', 'general.equipoMarcaModelo', p.general.equipoMarcaModelo)}
        ${field('Sistema de coordenadas', 'general.sistema', p.general.sistema)}
        ${field('Datum', 'general.datum', p.general.datum)}
        ${field('Zona UTM', 'general.zonaUTM', p.general.zonaUTM)}
        ${field('Clima', 'general.clima', p.general.clima)}
      </div>
      ${textarea('Observaciones generales', 'general.observaciones', p.general.observaciones)}
      <div class="toolbar"><button class="btn primary" data-main-action="save-now" type="button">Guardar datos generales</button><button class="btn" data-main-action="print-project" type="button">Imprimir ficha</button></div>
    `);
  }
  function renderTableModule(key, title, subtitle, compute) {
    const p = ensureProject();
    const cfg = tableConfigs[key];
    return moduleCard(title, subtitle, renderEditableTable({ rows: moduleRows(p, key), columns: cfg.columns, moduleKey: key, compute: compute || cfg.compute, minWidth: cfg.minWidth || 900 }) + academicBoxFor(key));
  }
  function renderPoligonal(p) {
    const poly = p.modules.poligonal;
    const comp = calcPoligonalStruct(poly);
    const extras = `<div class="grid cols-3"><div class="field"><label>Este inicial</label><input data-module-extra="poligonal.startE" type="number" step="0.001" value="${escapeHtml(poly.startE)}"></div><div class="field"><label>Norte inicial</label><input data-module-extra="poligonal.startN" type="number" step="0.001" value="${escapeHtml(poly.startN)}"></div><div class="field"><label>Tipo</label><select data-module-extra="poligonal.closed"><option value="true" ${poly.closed ? 'selected' : ''}>Cerrada / verificar cierre</option><option value="false" ${!poly.closed ? 'selected' : ''}>Abierta</option></select></div></div>`;
    const summary = `<div class="calc-box" data-poly-sum><strong>ΣΔE:</strong> ${fmt(comp.sumE)} m · <strong>ΣΔN:</strong> ${fmt(comp.sumN)} m · <strong>Error lineal:</strong> ${fmt(comp.elc)} m · <strong>Perímetro:</strong> ${fmt(comp.total)} m · <strong>Precisión relativa referencial:</strong> 1/${Number.isFinite(comp.precision) ? fmt(comp.precision, 0) : '∞'}<br><span class="formula">ELC = √((ΣΔE)² + (ΣΔN)²)</span></div>`;
    return moduleCard('Poligonal con brújula y cinta', 'Calcula proyecciones, coordenadas acumuladas y cierre básico.', renderEditableTable({ rows: comp.rows, columns: tableConfigs.poligonal.columns, moduleKey: 'poligonal', extrasHtml: extras, afterHtml: summary }) + academicBoxFor('poligonal'));
  }
  function renderRadiacion(p) {
    const rad = p.modules.radiacion;
    const comp = calcRadiacionStruct(rad);
    const extras = `<div class="grid cols-2"><div class="field"><label>Este estación</label><input data-module-extra="radiacion.stationE" type="number" step="0.001" value="${escapeHtml(rad.stationE)}"></div><div class="field"><label>Norte estación</label><input data-module-extra="radiacion.stationN" type="number" step="0.001" value="${escapeHtml(rad.stationN)}"></div></div>`;
    return moduleCard('Radiación topográfica', 'Calcula coordenadas de puntos observados desde una estación conocida.', renderEditableTable({ rows: comp.rows, columns: tableConfigs.radiacion.columns, moduleKey: 'radiacion', extrasHtml: extras }) + academicBoxFor('radiacion'));
  }
  function renderNivelSimple(p) {
    const mod = p.modules.nivel_simple;
    const comp = calcNivelSimpleStruct(mod);
    const extras = `<div class="grid cols-2"><div class="field"><label>Cota inicial / BM</label><input data-module-extra="nivel_simple.cotaInicial" type="number" step="0.001" value="${escapeHtml(mod.cotaInicial)}"></div><div class="calc-box" data-nivel-simple-ai><strong>Altura de instrumento:</strong> ${fmt(comp.ai || 0)} m. <span class="formula">AI = Cota conocida + Lectura atrás</span></div></div>`;
    return moduleCard('Nivelación geométrica simple', 'Calcula altura de instrumento y cotas desde un banco de nivel.', renderEditableTable({ rows: comp.rows, columns: tableConfigs.nivel_simple.columns, moduleKey: 'nivel_simple', extrasHtml: extras }) + academicBoxFor('nivel_simple'));
  }
  function renderNivelCompuesta(p) {
    const mod = p.modules.nivel_compuesta;
    const comp = calcNivelCompuestaStruct(mod);
    const extras = `<div class="grid cols-2"><div class="field"><label>Cota inicial / BM</label><input data-module-extra="nivel_compuesta.cotaInicial" type="number" step="0.001" value="${escapeHtml(mod.cotaInicial)}"></div><div class="calc-box" data-nivel-compuesta-cierre><strong>Diferencia acumulada desde BM:</strong> ${fmt(comp.cierre || 0)} m. <span class="formula">Cota = AI - lectura</span></div></div>`;
    return moduleCard('Nivelación geométrica compuesta', 'Gestiona puntos de cambio, alturas de instrumento sucesivas y cotas.', renderEditableTable({ rows: comp.rows, columns: tableConfigs.nivel_compuesta.columns, moduleKey: 'nivel_compuesta', extrasHtml: extras }) + academicBoxFor('nivel_compuesta'));
  }
  function renderPerfil(p) {
    return moduleCard('Perfil longitudinal', 'Calcula distancia acumulada, pendiente y corte/relleno básico.', renderEditableTable({ rows: moduleRows(p, 'perfil'), columns: tableConfigs.perfil.columns, moduleKey: 'perfil', compute: tableConfigs.perfil.compute }) + academicBoxFor('perfil'));
  }
  function renderProfileChart(rows) {
    const max = Math.max(...rows.map(r => parseNum(r.cotaTerreno)), ...rows.map(r => parseNum(r.cotaRasante)), 1);
    const min = Math.min(...rows.map(r => parseNum(r.cotaTerreno)), ...rows.map(r => parseNum(r.cotaRasante)), 0);
    const w = 900, h = 230, pad = 35;
    const lastX = Math.max(...rows.map(r => parseNum(r.distanciaAcumulada)), 1);
    const y = v => h - pad - ((v - min) / Math.max(max - min, 0.001)) * (h - pad * 2);
    const x = v => pad + (v / lastX) * (w - pad * 2);
    const ptsT = rows.map(r => `${x(parseNum(r.distanciaAcumulada))},${y(parseNum(r.cotaTerreno))}`).join(' ');
    const ptsR = rows.map(r => `${x(parseNum(r.distanciaAcumulada))},${y(parseNum(r.cotaRasante))}`).join(' ');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Perfil longitudinal"><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="currentColor" opacity=".4"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="currentColor" opacity=".4"/><polyline points="${ptsT}" fill="none" stroke="#174d80" stroke-width="3"/><polyline points="${ptsR}" fill="none" stroke="#d99a28" stroke-width="3" stroke-dasharray="8 5"/><text x="${pad}" y="22" fill="currentColor">Terreno (azul) · Rasante (dorado)</text></svg></div>`;
  }

  function renderModuleChart(key, rows, computed = {}) {
    if (!Array.isArray(rows) || rows.length === 0 || key === 'herramientas' || key === 'reportes') return '';
    const chartMap = {
      cinta: () => barChart(rows.map((r, i) => ({ label: `${r.puntoInicial || i + 1}-${r.puntoFinal || ''}`, value: parseNum(r.distanciaHorizontal || r.distancia) })), 'Gráfico de distancias horizontales por tramo', 'm'),
      brujula: () => barChart(rows.map((r, i) => ({ label: `${r.estacion || i + 1}-${r.punto || ''}`, value: parseNum(r.distancia) })), 'Gráfico de distancias observadas con brújula', 'm'),
      poligonal: () => xyChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), x: parseNum(r.esteCalc), y: parseNum(r.norteCalc) })), 'Croquis XY de poligonal calculada'),
      radiacion: () => xyChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), x: parseNum(r.este), y: parseNum(r.norte) })), 'Croquis XY de puntos radiados'),
      nivel_simple: () => lineChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), y: parseNum(r.cota) })), 'Gráfico de cotas por nivelación simple', 'm'),
      nivel_compuesta: () => lineChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), y: parseNum(r.cota) })).filter(d => Number.isFinite(d.y)), 'Gráfico de cotas por nivelación compuesta', 'm'),
      taquimetria: () => barChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), value: parseNum(r.distanciaHorizontal) })), 'Gráfico de distancias horizontales taquimétricas', 'm'),
      estacion_total: () => xyChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), x: parseNum(r.este), y: parseNum(r.norte) })), 'Croquis XY de puntos importados o ingresados'),
      perfil: () => profileChart(rows, 'Gráfico de perfil longitudinal'),
      secciones: () => sectionChart(rows, 'Gráfico de sección transversal'),
      replanteo: () => barChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), value: parseNum(r.distanciaError) })), 'Gráfico de error horizontal de replanteo', 'm')
    };
    const svg = chartMap[key] ? chartMap[key]() : '';
    if (!svg) return '';
    return `<div class="chart-panel"><div class="chart-title"><strong>Gráfico del módulo</strong><span>Se actualiza con los datos de la tabla.</span></div>${svg}</div>`;
  }
  function scaleLinear(value, min, max, outMin, outMax) {
    if (!Number.isFinite(value)) return outMin;
    if (Math.abs(max - min) < 1e-9) return (outMin + outMax) / 2;
    return outMin + ((value - min) / (max - min)) * (outMax - outMin);
  }
  function svgLabel(text, x, y, size = 11) {
    return `<text x="${x}" y="${y}" font-size="${size}" fill="currentColor">${escapeHtml(String(text).slice(0, 14))}</text>`;
  }
  function barChart(items, title, unit = '') {
    const data = items.filter(d => Number.isFinite(d.value));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 260, padL = 46, padR = 18, padT = 28, padB = 48;
    const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
    const barGap = 8;
    const bw = Math.max(16, (w - padL - padR - barGap * (data.length - 1)) / data.length);
    const bars = data.map((d, i) => {
      const x = padL + i * (bw + barGap);
      const bh = Math.max(1, Math.abs(d.value) / max * (h - padT - padB));
      const y = h - padB - bh;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="6" class="chart-bar"/><text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" font-size="10" fill="currentColor">${fmt(d.value, 2)}</text><text x="${x + bw / 2}" y="${h - 20}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(d.label)}</text>`;
    }).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${padL}" y="18" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)} ${unit ? '(' + unit + ')' : ''}</text><line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" class="chart-axis"/><line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" class="chart-axis"/>${bars}</svg></div>`;
  }
  function lineChart(items, title, unit = '') {
    const data = items.filter(d => Number.isFinite(d.y));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 260, pad = 42;
    const minY = Math.min(...data.map(d => d.y));
    const maxY = Math.max(...data.map(d => d.y));
    const pts = data.map((d, i) => {
      const x = scaleLinear(i, 0, Math.max(data.length - 1, 1), pad, w - pad);
      const y = scaleLinear(d.y, minY, maxY, h - pad, pad);
      return { ...d, x, y };
    });
    const poly = pts.map(p => `${p.x},${p.y}`).join(' ');
    const circles = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-point"/><text x="${p.x}" y="${p.y - 9}" text-anchor="middle" font-size="10" fill="currentColor">${fmt(p.y, 2)}</text>`).join('');
    const labels = pts.map((p, i) => (i % Math.ceil(pts.length / 6) === 0 || i === pts.length - 1) ? `<text x="${p.x}" y="${h - 16}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text>` : '').join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="20" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)} ${unit ? '(' + unit + ')' : ''}</text><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="chart-axis"/><polyline points="${poly}" fill="none" class="chart-line"/>${circles}${labels}</svg></div>`;
  }
  function xyChart(items, title) {
    const data = items.filter(d => Number.isFinite(d.x) && Number.isFinite(d.y));
    if (!data.length) return `<div class="empty-chart">No hay coordenadas suficientes para graficar.</div>`;
    const w = 920, h = 300, pad = 48;
    let minX = Math.min(...data.map(d => d.x)), maxX = Math.max(...data.map(d => d.x));
    let minY = Math.min(...data.map(d => d.y)), maxY = Math.max(...data.map(d => d.y));
    const mx = Math.max((maxX - minX) * 0.08, 1), my = Math.max((maxY - minY) * 0.08, 1);
    minX -= mx; maxX += mx; minY -= my; maxY += my;
    const pts = data.map(d => ({ ...d, sx: scaleLinear(d.x, minX, maxX, pad, w - pad), sy: scaleLinear(d.y, minY, maxY, h - pad, pad) }));
    const poly = pts.map(p => `${p.sx},${p.sy}`).join(' ');
    const nodes = pts.map(p => `<circle cx="${p.sx}" cy="${p.sy}" r="4.5" class="chart-point"/><text x="${p.sx + 7}" y="${p.sy - 7}" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="chart-axis"/><polyline points="${poly}" fill="none" class="chart-line"/>${nodes}<text x="${pad}" y="${h - 12}" font-size="10" fill="currentColor">Este</text><text x="8" y="${pad}" font-size="10" fill="currentColor">Norte</text></svg></div>`;
  }
  function profileChart(rows, title) {
    const data = rows.map((r, i) => ({ label: r.progresiva || String(i + 1), x: parseNum(r.distanciaAcumulada), terreno: parseNum(r.cotaTerreno), rasante: parseNum(r.cotaRasante) })).filter(d => Number.isFinite(d.terreno) || Number.isFinite(d.rasante));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 280, pad = 46;
    const minY = Math.min(...data.flatMap(d => [d.terreno, d.rasante]).filter(Number.isFinite));
    const maxY = Math.max(...data.flatMap(d => [d.terreno, d.rasante]).filter(Number.isFinite));
    const maxX = Math.max(...data.map(d => d.x), 1);
    const makePts = key => data.map(d => `${scaleLinear(d.x, 0, maxX, pad, w - pad)},${scaleLinear(d[key], minY, maxY, h - pad, pad)}`).join(' ');
    const labels = data.map((d, i) => (i % Math.ceil(data.length / 6) === 0 || i === data.length - 1) ? `<text x="${scaleLinear(d.x, 0, maxX, pad, w - pad)}" y="${h - 14}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(d.label)}</text>` : '').join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="chart-axis"/><polyline points="${makePts('terreno')}" fill="none" class="chart-line"/><polyline points="${makePts('rasante')}" fill="none" class="chart-line accent" stroke-dasharray="8 6"/>${labels}<text x="${w - pad - 170}" y="24" font-size="11" fill="currentColor">Terreno: azul · Rasante: dorado</text></svg></div>`;
  }
  function sectionChart(rows, title) {
    const data = rows.map((r, i) => ({ label: r.lado || String(i + 1), x: parseNum(r.offset), y: parseNum(r.cotaTerreno), yp: parseNum(r.cotaProyecto) })).filter(d => Number.isFinite(d.x) && Number.isFinite(d.y));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    data.sort((a, b) => a.x - b.x);
    const w = 920, h = 280, pad = 46;
    const minX = Math.min(...data.map(d => d.x)), maxX = Math.max(...data.map(d => d.x));
    const valuesY = data.flatMap(d => [d.y, d.yp]).filter(Number.isFinite);
    const minY = Math.min(...valuesY), maxY = Math.max(...valuesY);
    const p1 = data.map(d => `${scaleLinear(d.x, minX, maxX, pad, w - pad)},${scaleLinear(d.y, minY, maxY, h - pad, pad)}`).join(' ');
    const p2 = data.map(d => `${scaleLinear(d.x, minX, maxX, pad, w - pad)},${scaleLinear(d.yp, minY, maxY, h - pad, pad)}`).join(' ');
    const labels = data.map(d => `<text x="${scaleLinear(d.x, minX, maxX, pad, w - pad)}" y="${h - 14}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(d.label)}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" class="chart-axis"/><polyline points="${p1}" fill="none" class="chart-line"/><polyline points="${p2}" fill="none" class="chart-line accent" stroke-dasharray="8 6"/>${labels}<text x="${w - pad - 190}" y="24" font-size="11" fill="currentColor">Terreno: azul · Proyecto: dorado</text></svg></div>`;
  }

  function academicBoxFor(key) {
    const map = {
      cinta: 'Revise si la distancia medida es inclinada. Para trabajo profesional, aplique correcciones según equipo y especificación.',
      brujula: 'Evite cercanía a metales, vehículos, líneas eléctricas y estructuras que produzcan atracción local.',
      poligonal: 'La corrección de cierre aquí es académica. Las tolerancias reales dependen del expediente y precisión requerida.',
      radiacion: 'Verifique orientación de estación y azimut inicial antes de radiar puntos.',
      nivel_simple: 'Mantenga distancias de visual equilibradas cuando la precisión lo requiera.',
      nivel_compuesta: 'Todo punto de cambio debe ser estable y claramente identificado en campo.',
      taquimetria: 'Configure la calculadora en grados. Verifique K y C del instrumento.',
      estacion_total: 'Los formatos importados varían por marca. Revise el orden Este/Norte antes de usar resultados.',
      perfil: 'El perfil es referencial. Para diseño final debe contrastarse con expediente y software técnico.',
      secciones: 'Las áreas de corte/relleno deben calcularse con el método y precisión exigidos por el proyecto.',
      replanteo: 'No se aplican tolerancias automáticas porque deben venir del expediente técnico o norma aplicable.'
    };
    return `<div class="alert"><strong>Nota didáctica:</strong> ${map[key] || 'Revise datos, fórmulas y resultados antes de usar en campo.'}</div>`;
  }
  function renderHerramientas() {
    return moduleCard('Herramientas rápidas de campo', 'Conversores y calculadoras auxiliares para celular o escritorio.', `
      <div class="grid cols-3">
        <div class="card compact"><h3>Rumbo → Azimut</h3><div class="grid"><input id="toolRumbo" type="number" step="0.0001" placeholder="Ángulo de rumbo"><select id="toolCuadrante"><option>NE</option><option>SE</option><option>SW</option><option>NW</option></select><button class="btn primary" data-tool="rumboAz">Calcular</button><div id="toolRumboOut" class="calc-box"></div></div></div>
        <div class="card compact"><h3>Azimut → Rumbo</h3><div class="grid"><input id="toolAz" type="number" step="0.0001" placeholder="Azimut en grados"><button class="btn primary" data-tool="azRumbo">Calcular</button><div id="toolAzOut" class="calc-box"></div></div></div>
        <div class="card compact"><h3>Pendiente</h3><div class="grid"><input id="toolDz" type="number" step="0.001" placeholder="Desnivel"><input id="toolDh" type="number" step="0.001" placeholder="Distancia horizontal"><button class="btn primary" data-tool="pendiente">Calcular</button><div id="toolPendOut" class="calc-box"></div></div></div>
        <div class="card compact"><h3>Distancia y azimut entre coordenadas</h3><div class="grid"><input id="e1" type="number" placeholder="E1"><input id="n1" type="number" placeholder="N1"><input id="e2" type="number" placeholder="E2"><input id="n2" type="number" placeholder="N2"><button class="btn primary" data-tool="coord">Calcular</button><div id="toolCoordOut" class="calc-box"></div></div></div>
        <div class="card compact"><h3>Área por coordenadas</h3><p>Ingrese pares E,N separados por línea. Ej.: 500000,8665000</p><textarea id="toolArea" placeholder="E,N&#10;E,N&#10;E,N"></textarea><button class="btn primary" data-tool="area">Calcular área</button><div id="toolAreaOut" class="calc-box"></div></div>
        <div class="card compact"><h3>DMS ↔ Decimal</h3><div class="grid"><input id="deg" type="number" placeholder="Grados"><input id="min" type="number" placeholder="Minutos"><input id="sec" type="number" placeholder="Segundos"><button class="btn primary" data-tool="dms">A decimal</button><input id="decDeg" type="number" placeholder="Decimal"><button class="btn" data-tool="decimalDms">A DMS</button><div id="toolDmsOut" class="calc-box"></div></div></div>
      </div>`);
  }
  function renderReportes(p) {
    return moduleCard('Reportes y respaldos', 'Genera reportes imprimibles y exporta respaldos completos.', `
      <div class="grid cols-3">
        <button class="btn primary" data-main-action="print-project" type="button">Reporte completo / PDF</button>
        <button class="btn" data-main-action="export-project" type="button">Exportar respaldo JSON</button>
        <button class="btn" data-main-action="import-project" type="button">Importar respaldo JSON</button>
      </div>
      <div class="alert"><strong>Recomendación:</strong> exporte un respaldo JSON al terminar cada jornada de campo. Para PDF use el botón imprimir y seleccione “Guardar como PDF”.</div>
      <h3>Resumen del proyecto</h3>
      <div class="table-wrap"><table><tbody>${Object.entries(p.general).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table></div>`);
  }

  function attachDynamicHandlers(root) {
    bindGeneralInputs(root, activeProject(), '');
    attachTableHandlers(root);
    if (root.dataset.dynamicHandlersBound === '1') return;
    root.dataset.dynamicHandlersBound = '1';
    root.addEventListener('input', e => {
      const extra = e.target.closest('[data-module-extra]');
      if (!extra) return;
      const extraPath = extra.dataset.moduleExtra;
      setModuleExtra(extraPath, extra.value);
      updateReadonlyCells(extraPath.split('.')[0]); // actualización en vivo al teclear
    });
    root.addEventListener('change', e => {
      const extra = e.target.closest('[data-module-extra]');
      if (!extra) return;
      const extraPath = extra.dataset.moduleExtra;
      const extraModuleKey = extraPath.split('.')[0];
      setModuleExtra(extraPath, extra.value === 'true' ? true : extra.value === 'false' ? false : extra.value);
      updateReadonlyCells(extraModuleKey); // sin re-render completo
    });
    root.addEventListener('click', async e => {
      const main = e.target.closest('[data-main-action]');
      if (main) handleMainAction(main.dataset.mainAction);
      const open = e.target.closest('[data-open-project]');
      if (open) { state.activeId = open.dataset.openProject; state.module = 'datos'; render(); }
      const dup = e.target.closest('[data-duplicate-project]');
      if (dup) duplicateProject(dup.dataset.duplicateProject);
      const exp = e.target.closest('[data-export-project]');
      if (exp) exportProject(exp.dataset.exportProject);
      const tool = e.target.closest('[data-tool]');
      if (tool) handleTool(tool.dataset.tool);
    });
  }
  function setModuleExtra(path, value) {
    const p = activeProject(); if (!p) return;
    const parts = path.split('.');
    let ref = p.modules;
    while (parts.length > 1) {
      const part = parts.shift();
      if (!ref[part] || typeof ref[part] !== 'object') ref[part] = {}; // guard para paths inexistentes
      ref = ref[part];
    }
    ref[parts[0]] = value;
    scheduleSave();
  }

  async function duplicateProject(projectId = state.activeId) {
    const src = state.projects.find(x => x.id === projectId) || activeProject();
    if (!src) {
      alert('No hay un proyecto activo para duplicar.');
      return;
    }
    const copy = deepClone(src);
    copy.id = uid();
    copy.name = `${src.name || 'Proyecto'} - copia`;
    copy.createdAt = nowISO();
    copy.updatedAt = nowISO();
    state.projects = state.projects.filter(x => x.id !== copy.id);
    state.projects.unshift(copy);
    state.activeId = copy.id;
    await dbPut(copy);
    await loadProjects(false);
    state.activeId = copy.id;
    $('#saveStatus').textContent = 'Proyecto duplicado';
    render();
  }

  async function handleMainAction(action) {
    if (action === 'new-project') {
      // Crear proyecto con nombre predeterminado y navegar a Datos para que el usuario lo renombre
      const p = defaultProject();
      state.projects.push(p);
      state.activeId = p.id;
      state.module = 'datos';
      await dbPut(p);
      render();
      // Enfocar el campo nombre para renombrado inmediato (sin prompt() bloqueante)
      setTimeout(() => {
        const nameField = document.querySelector('[data-field="name"]');
        if (nameField) { nameField.select(); nameField.focus(); }
      }, 80);
    }
    if (action === 'duplicate-project') await duplicateProject();
    if (action === 'delete-project') { const p = activeProject(); if (p && confirm('¿Eliminar el proyecto activo?')) { await dbDelete(p.id); state.projects = state.projects.filter(x => x.id !== p.id); state.activeId = state.projects[0]?.id || null; render(); } }
    if (action === 'export-project') exportProject(activeProject()?.id);
    if (action === 'import-project') importProjectJSON();
    if (action === 'save-now') { await dbPut(activeProject()); await loadProjects(false); renderProjectSelect(); $('#saveStatus').textContent = 'Guardado manual'; }
    if (action === 'print-project') printProject();
  }
  function exportProject(id) {
    const p = state.projects.find(x => x.id === id); if (!p) return;
    download(`${safeName(p.name)}_respaldo_practicas_topografia.json`, JSON.stringify(p, null, 2), 'application/json;charset=utf-8');
  }
  function importProjectJSON() {
    const input = $('#fileInput');
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try {
        const p = JSON.parse(await file.text());
        // Validar estructura mínima del respaldo antes de importar
        if (!p || typeof p !== 'object' || !p.modules || !p.general || !p.id) {
          alert('El archivo no parece un respaldo válido de Practicas de Topografia.');
          return;
        }
        p.id = p.id || uid(); p.updatedAt = nowISO(); p.createdAt = p.createdAt || nowISO();
        state.projects = state.projects.filter(x => x.id !== p.id).concat(p); state.activeId = p.id; await dbPut(p); render();
      } catch (err) { alert('No se pudo importar el JSON. Verifique que el archivo no esté dañado.'); }
      input.value = '';
    };
    input.click();
  }
  function handleTool(tool) {
    if (tool === 'rumboAz') { const az = rumboToAz($('#toolRumbo').value, $('#toolCuadrante').value); $('#toolRumboOut').innerHTML = `<strong>Azimut:</strong> ${fmt(az, 4)}°`; }
    if (tool === 'azRumbo') { const r = azToRumbo($('#toolAz').value); $('#toolAzOut').innerHTML = `<strong>Rumbo:</strong> ${fmt(r.deg, 4)}° ${r.q}`; }
    if (tool === 'pendiente') { const dz = parseNum($('#toolDz').value), dh = parseNum($('#toolDh').value); const p = dh ? dz / dh * 100 : 0; $('#toolPendOut').innerHTML = `<strong>Pendiente:</strong> ${fmt(p, 3)} %`; }
    if (tool === 'coord') { const e1 = parseNum($('#e1').value), n1 = parseNum($('#n1').value), e2 = parseNum($('#e2').value), n2 = parseNum($('#n2').value); const de = e2 - e1, dn = n2 - n1, d = Math.sqrt(de * de + dn * dn), az = normAz(radToDeg(Math.atan2(de, dn))); $('#toolCoordOut').innerHTML = `<strong>Distancia:</strong> ${fmt(d)} m<br><strong>Azimut:</strong> ${fmt(az, 4)}°`; }
    if (tool === 'area') { const pts = $('#toolArea').value.trim().split(/\n+/).map(l => l.split(/[;,\s]+/).map(parseNum)).filter(a => a.length >= 2); let s = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - p[1] * q[0]; }); $('#toolAreaOut').innerHTML = `<strong>Área:</strong> ${fmt(Math.abs(s) / 2)} m² · ${fmt(Math.abs(s) / 20000, 4)} ha`; }
    if (tool === 'dms') { const dec = parseNum($('#deg').value) + parseNum($('#min').value) / 60 + parseNum($('#sec').value) / 3600; $('#toolDmsOut').innerHTML = `<strong>Decimal:</strong> ${fmt(dec, 6)}°`; }
    if (tool === 'decimalDms') { const v = parseNum($('#decDeg').value); const d = Math.trunc(v), m = Math.trunc((Math.abs(v - d)) * 60), s = (Math.abs(v - d) * 60 - m) * 60; $('#toolDmsOut').innerHTML = `<strong>DMS:</strong> ${d}° ${m}' ${fmt(s, 2)}"`; }
  }
  function printCurrentModule() { window.print(); }
  function printProject() {
    const p = activeProject(); if (!p) return;
    const win = window.open('', '_blank');
    const css = `<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1,h2{color:#0b2a4a}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #bbb;padding:6px;font-size:12px}th{background:#eef3f8;text-align:left}.note{border-left:4px solid #d99a28;padding:10px;background:#fff7e5}</style>`;
    const sections = Object.keys(tableConfigs).map(key => {
      const rows = computeForExport(key), cols = exportColumnsFor(key);
      return `<h2>${escapeHtml(modules.find(m => m.id === key)?.label || key)}</h2><table><tr>${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`;
    }).join('');
    win.document.write(`<html><head><title>Reporte ${escapeHtml(p.name)}</title>${css}</head><body><h1>${escapeHtml(p.name)}</h1><p class="note">Reporte generado por Practicas de Topografia. Verificar tolerancias con normativa peruana aplicable, expediente técnico y criterio profesional.</p><h2>Datos generales</h2><table>${Object.entries(p.general).map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>${sections}</body></html>`);
    win.document.close(); win.focus(); setTimeout(() => win.print(), 500);
  }

  async function init() {
    state.db = await openDB();
    await loadProjects(true);
    if (!state.projects.length) {
      const p = defaultProject(); state.projects = [p]; state.activeId = p.id; await dbPut(p);
    }
    if (!state.activeId) state.activeId = state.projects[0]?.id;
    document.documentElement.dataset.theme = state.theme;
    bindGlobalEvents();
    render();
    document.getElementById('app').classList.remove('shell-loading');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => { });
  }
  function bindGlobalEvents() {
    $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#projectSelect').addEventListener('change', e => { state.activeId = e.target.value; render(); });
    $('#newProjectBtn').addEventListener('click', () => handleMainAction('new-project'));
    $('#saveBtn').addEventListener('click', () => handleMainAction('save-now'));
    $('#themeToggle').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('topotaqui-theme', state.theme);
      $('#themeToggle').textContent = state.theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
      render();
    });
    // Inicializar label según el tema actual
    $('#themeToggle').textContent = state.theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; $('#installBtn').classList.remove('hidden'); });
    $('#installBtn').addEventListener('click', async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; $('#installBtn').classList.add('hidden'); });
  }
  init();
})();
