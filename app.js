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
    return a;
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
        poligonal: { startE: 500000, startN: 8665000, closed: true, rows: [
          { estacion: 'A', punto: 'B', rumboDeg: 35, cuadrante: 'NE', distancia: 25.4, observacion: 'Lote' },
          { estacion: 'B', punto: 'C', rumboDeg: 55, cuadrante: 'SE', distancia: 18.2, observacion: 'Lote' },
          { estacion: 'C', punto: 'D', rumboDeg: 35, cuadrante: 'SW', distancia: 25.3, observacion: 'Lote' },
          { estacion: 'D', punto: 'A', rumboDeg: 55, cuadrante: 'NW', distancia: 18.1, observacion: 'Cierre' }
        ]},
        radiacion: { stationE: 500000, stationN: 8665000, rows: [
          { punto: 'P1', azimut: 35, distancia: 12.5, codigo: 'BOR', descripcion: 'Borde de vía' }
        ]},
        nivel_simple: { cotaInicial: 100, rows: [
          { punto: 'BM-01', atras: 1.245, intermedia: '', adelante: '', observacion: 'Banco de nivel' },
          { punto: 'P1', atras: '', intermedia: 1.865, adelante: '', observacion: 'Terreno' },
          { punto: 'PC-01', atras: '', intermedia: '', adelante: 2.015, observacion: 'Punto de cambio' }
        ]},
        nivel_compuesta: { cotaInicial: 100, rows: [
          { estacion: 'N1', punto: 'BM-01', atras: 1.245, intermedia: '', adelante: '', observacion: 'Inicio' },
          { estacion: 'N1', punto: 'P1', atras: '', intermedia: 1.865, adelante: '', observacion: 'Terreno' },
          { estacion: 'N1', punto: 'PC-01', atras: '', intermedia: '', adelante: 2.015, observacion: 'Cambio' },
          { estacion: 'N2', punto: 'PC-01', atras: 1.105, intermedia: '', adelante: '', observacion: 'Cambio' },
          { estacion: 'N2', punto: 'P2', atras: '', intermedia: 1.445, adelante: '', observacion: 'Terreno' }
        ]},
        taquimetria: [
          { estacion: 'E1', punto: 'P1', cotaEstacion: 100, alturaInstrumento: 1.5, hiloSuperior: 2.675, hiloMedio: 2.3, hiloInferior: 1.925, anguloVertical: 5, k: 100, c: 0, descripcion: 'Borde camino' }
        ],
        estacion_total: [
          { punto: '1', este: 500000, norte: 8665000, cota: 100, codigo: 'BM', descripcion: 'Base' },
          { punto: '2', este: 500025, norte: 8665017, cota: 100.45, codigo: 'BOR', descripcion: 'Borde' }
        ],
        perfil: [
          { progresiva: '0+000', distanciaParcial: 0, cotaTerreno: 100.00, cotaRasante: 100.10, cotaTuberia: 99.40, observacion: 'Inicio' },
          { progresiva: '0+020', distanciaParcial: 20, cotaTerreno: 100.32, cotaRasante: 100.30, cotaTuberia: 99.55, observacion: 'Eje' },
          { progresiva: '0+040', distanciaParcial: 20, cotaTerreno: 100.80, cotaRasante: 100.50, cotaTuberia: 99.70, observacion: 'Corte' }
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

  function renderNav() {
    const nav = $('#moduleNav');
    nav.innerHTML = modules.map(m => `<button class="nav-btn ${state.module === m.id ? 'active' : ''}" data-module="${m.id}" type="button"><span>${m.icon}</span>${m.label}</button>`).join('');
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
          <button class="btn small" data-action="insert-above" data-module-key="${moduleKey}" data-index="${i}" title="Insertar arriba">↑</button>
          <button class="btn small" data-action="insert-below" data-module-key="${moduleKey}" data-index="${i}" title="Insertar abajo">↓</button>
          <button class="btn small" data-action="duplicate-row" data-module-key="${moduleKey}" data-index="${i}" title="Duplicar">⧉</button>
          <button class="btn small danger" data-action="delete-row" data-module-key="${moduleKey}" data-index="${i}" title="Eliminar">🗑</button>
        </td></tr>`).join('')}
        </tbody>
      </table></div>
      ${computed.summary ? `<div class="calc-box">${computed.summary}</div>` : ''}
      ${renderModuleChart(moduleKey, cRows, computed)}
      ${afterHtml}`;
  }
  function renderCell(c, row, i, moduleKey) {
    const val = row[c.key] ?? '';
    if (c.readonly) return `<td class="readonly">${escapeHtml(c.format ? c.format(val, row, i) : val)}</td>`;
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
      render();
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
    const html = `<html><head><meta charset="utf-8"></head><body><table><tr>${cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td>${escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    download(`${safeName(p.name)}_${key}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
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
  tableConfigs.cinta = { columns: [
    { key: 'puntoInicial', label: 'Punto inicial' }, { key: 'puntoFinal', label: 'Punto final' }, { key: 'distancia', label: 'Distancia medida (m)', type: 'number', step: '0.001' }, { key: 'pendiente', label: 'Pendiente %', type: 'number', step: '0.001', default: 0 }, { key: 'distanciaHorizontal', label: 'Dist. horizontal (m)', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
  ], compute: calcCinta };

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
  tableConfigs.brujula = { columns: [
    { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto visado' }, { key: 'rumboDeg', label: 'Rumbo (°)', type: 'number', step: '0.0001' }, { key: 'cuadrante', label: 'Cuadrante', type: 'select', options: ['NE', 'SE', 'SW', 'NW'], default: 'NE' }, { key: 'distancia', label: 'Distancia (m)', type: 'number', step: '0.001' }, { key: 'declinacion', label: 'Declinación (°)', type: 'number', step: '0.0001', default: 0 }, { key: 'azimut', label: 'Azimut (°)', readonly: true, format: v => fmt(parseNum(v), 4) }, { key: 'azimutCorregido', label: 'Az. corregido (°)', readonly: true, format: v => fmt(parseNum(v), 4) }, { key: 'deltaE', label: 'ΔE (m)', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN (m)', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
  ], compute: calcBrujula };

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
  tableConfigs.poligonal = { columns: [
    { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto adelante' }, { key: 'rumboDeg', label: 'Rumbo (°)', type: 'number', step: '0.0001' }, { key: 'cuadrante', label: 'Cuadrante', type: 'select', options: ['NE', 'SE', 'SW', 'NW'], default: 'NE' }, { key: 'distancia', label: 'Distancia (m)', type: 'number', step: '0.001' }, { key: 'azimut', label: 'Azimut (°)', readonly: true, format: v => fmt(parseNum(v), 4) }, { key: 'deltaE', label: 'ΔE', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'esteCalc', label: 'Este calc.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'norteCalc', label: 'Norte calc.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
  ] };

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
  tableConfigs.radiacion = { columns: [
    { key: 'punto', label: 'Punto' }, { key: 'azimut', label: 'Azimut (°)', type: 'number', step: '0.0001' }, { key: 'distancia', label: 'Distancia (m)', type: 'number', step: '0.001' }, { key: 'deltaE', label: 'ΔE', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'este', label: 'Este', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'norte', label: 'Norte', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'codigo', label: 'Código' }, { key: 'descripcion', label: 'Descripción' }
  ] };

  function calcNivelSimpleStruct(mod) {
    const cotaInicial = parseNum(mod.cotaInicial);
    let ai = null;
    const out = (mod.rows || []).map((r, i) => {
      if (i === 0 || ai === null) ai = cotaInicial + parseNum(r.atras);
      const lectura = isNum(r.intermedia) ? parseNum(r.intermedia) : isNum(r.adelante) ? parseNum(r.adelante) : isNum(r.atras) ? parseNum(r.atras) : 0;
      const cota = ai - lectura;
      return { ...r, ai: round(ai, 4), cota: round(cota, 4) };
    });
    return { rows: out, ai };
  }
  tableConfigs.nivel_simple = { columns: [
    { key: 'punto', label: 'Punto' }, { key: 'atras', label: 'Lect. atrás', type: 'number', step: '0.001' }, { key: 'intermedia', label: 'Lect. intermedia', type: 'number', step: '0.001' }, { key: 'adelante', label: 'Lect. adelante', type: 'number', step: '0.001' }, { key: 'ai', label: 'AI', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'cota', label: 'Cota', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
  ] };

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
  tableConfigs.nivel_compuesta = { columns: [
    { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto' }, { key: 'atras', label: 'Lect. atrás', type: 'number', step: '0.001' }, { key: 'intermedia', label: 'Lect. intermedia', type: 'number', step: '0.001' }, { key: 'adelante', label: 'Lect. adelante', type: 'number', step: '0.001' }, { key: 'ai', label: 'AI', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v)) }, { key: 'cota', label: 'Cota', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v)) }, { key: 'observacion', label: 'Observación' }
  ] };

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
  tableConfigs.taquimetria = { columns: [
    { key: 'estacion', label: 'Estación' }, { key: 'punto', label: 'Punto' }, { key: 'cotaEstacion', label: 'Cota estación', type: 'number', step: '0.001' }, { key: 'alturaInstrumento', label: 'Alt. instrumento', type: 'number', step: '0.001' }, { key: 'hiloSuperior', label: 'Hilo superior', type: 'number', step: '0.001' }, { key: 'hiloMedio', label: 'Hilo medio', type: 'number', step: '0.001' }, { key: 'hiloInferior', label: 'Hilo inferior', type: 'number', step: '0.001' }, { key: 'anguloVertical', label: 'Ángulo vertical (°)', type: 'number', step: '0.0001' }, { key: 'k', label: 'K', type: 'number', step: '0.001', default: 100 }, { key: 'c', label: 'C', type: 'number', step: '0.001', default: 0 }, { key: 'intervalo', label: 's', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'distanciaHorizontal', label: 'DH', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'desnivel', label: 'V', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'cotaPunto', label: 'Cota punto', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'descripcion', label: 'Descripción' }
  ], compute: calcTaquimetria, minWidth: 1300 };

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
  tableConfigs.estacion_total = { columns: [
    { key: 'punto', label: 'Punto' }, { key: 'este', label: 'Este', type: 'number', step: '0.001' }, { key: 'norte', label: 'Norte', type: 'number', step: '0.001' }, { key: 'cota', label: 'Cota', type: 'number', step: '0.001' }, { key: 'codigo', label: 'Código' }, { key: 'descripcion', label: 'Descripción' }, { key: 'distanciaPrev', label: 'Dist. a anterior', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v)) }, { key: 'azimutPrev', label: 'Az. a anterior', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v), 4) }, { key: 'pendientePrev', label: 'Pendiente %', readonly: true, format: v => v === '' ? '' : fmt(parseNum(v), 3) }
  ], compute: calcEstacion };

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
  tableConfigs.perfil = { columns: [
    { key: 'progresiva', label: 'Progresiva' }, { key: 'distanciaParcial', label: 'Dist. parcial', type: 'number', step: '0.001' }, { key: 'distanciaAcumulada', label: 'Dist. acum.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'cotaTerreno', label: 'Cota terreno', type: 'number', step: '0.001' }, { key: 'cotaRasante', label: 'Cota rasante', type: 'number', step: '0.001' }, { key: 'cotaTuberia', label: 'Cota tubería', type: 'number', step: '0.001' }, { key: 'diferencia', label: 'Cota roja', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'pendiente', label: 'Pendiente %', readonly: true, format: v => fmt(parseNum(v), 3) }, { key: 'estado', label: 'Estado', readonly: true }, { key: 'observacion', label: 'Observación' }
  ], compute: calcPerfil };

  function calcSecciones(rows) {
    const out = rows.map(r => {
      const dif = parseNum(r.cotaTerreno) - parseNum(r.cotaProyecto);
      return { ...r, diferencia: round(dif, 4), estado: dif > 0 ? 'Corte' : dif < 0 ? 'Relleno' : 'A nivel' };
    });
    return { rows: out };
  }
  tableConfigs.secciones = { columns: [
    { key: 'progresiva', label: 'Progresiva' }, { key: 'lado', label: 'Lado' }, { key: 'offset', label: 'Offset (m)', type: 'number', step: '0.001' }, { key: 'cotaTerreno', label: 'Cota terreno', type: 'number', step: '0.001' }, { key: 'cotaProyecto', label: 'Cota proyecto', type: 'number', step: '0.001' }, { key: 'diferencia', label: 'Dif.', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'estado', label: 'Estado', readonly: true }, { key: 'observacion', label: 'Observación' }
  ], compute: calcSecciones };

  function calcReplanteo(rows) {
    const out = rows.map(r => {
      const de = parseNum(r.esteCampo) - parseNum(r.esteDiseno), dn = parseNum(r.norteCampo) - parseNum(r.norteDiseno), dz = parseNum(r.cotaCampo) - parseNum(r.cotaDiseno);
      return { ...r, deltaE: round(de, 4), deltaN: round(dn, 4), deltaZ: round(dz, 4), distanciaError: round(Math.sqrt(de * de + dn * dn), 4), estado: 'Verificar tolerancia del expediente' };
    });
    return { rows: out, summary: `<strong>Advertencia:</strong> las tolerancias de replanteo deben tomarse del expediente técnico, norma aplicable o entidad contratante.` };
  }
  tableConfigs.replanteo = { columns: [
    { key: 'punto', label: 'Punto' }, { key: 'esteDiseno', label: 'Este diseño', type: 'number', step: '0.001' }, { key: 'norteDiseno', label: 'Norte diseño', type: 'number', step: '0.001' }, { key: 'cotaDiseno', label: 'Cota diseño', type: 'number', step: '0.001' }, { key: 'esteCampo', label: 'Este campo', type: 'number', step: '0.001' }, { key: 'norteCampo', label: 'Norte campo', type: 'number', step: '0.001' }, { key: 'cotaCampo', label: 'Cota campo', type: 'number', step: '0.001' }, { key: 'deltaE', label: 'ΔE', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaN', label: 'ΔN', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'deltaZ', label: 'ΔZ', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'distanciaError', label: 'Error H', readonly: true, format: v => fmt(parseNum(v)) }, { key: 'estado', label: 'Estado', readonly: true }, { key: 'observacion', label: 'Observación' }
  ], compute: calcReplanteo, minWidth: 1200 };

  function computeForExport(key) {
    const p = ensureProject();
    if (key === 'poligonal') return calcPoligonalStruct(p.modules.poligonal).rows;
    if (key === 'radiacion') return calcRadiacionStruct(p.modules.radiacion).rows;
    if (key === 'nivel_simple') return calcNivelSimpleStruct(p.modules.nivel_simple).rows;
    if (key === 'nivel_compuesta') return calcNivelCompuestaStruct(p.modules.nivel_compuesta).rows;
    const cfg = tableConfigs[key];
    const rows = moduleRows(p, key);
    return cfg?.compute ? cfg.compute(rows).rows : rows;
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
      <div class="alert"><strong>Versión funcional final:</strong> se corrigió la duplicación de proyectos y se incorporaron gráficos automáticos en los módulos técnicos. Puede ampliarse a mapas, nube y multiusuario en una segunda fase.</div>
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
        ${selectField('Tipo de obra', 'general.tipoObra', p.general.tipoObra, ['Edificación','Vía','Saneamiento','Canal','Drenaje','Catastro','Otro'])}
        ${selectField('Estado', 'general.estado', p.general.estado, ['Borrador','En campo','En gabinete','Finalizado'])}
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
    const summary = `<div class="calc-box"><strong>ΣΔE:</strong> ${fmt(comp.sumE)} m · <strong>ΣΔN:</strong> ${fmt(comp.sumN)} m · <strong>Error lineal:</strong> ${fmt(comp.elc)} m · <strong>Perímetro:</strong> ${fmt(comp.total)} m · <strong>Precisión relativa referencial:</strong> 1/${Number.isFinite(comp.precision) ? fmt(comp.precision, 0) : '∞'}<br><span class="formula">ELC = √((ΣΔE)² + (ΣΔN)²)</span></div>`;
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
    const extras = `<div class="grid cols-2"><div class="field"><label>Cota inicial / BM</label><input data-module-extra="nivel_simple.cotaInicial" type="number" step="0.001" value="${escapeHtml(mod.cotaInicial)}"></div><div class="calc-box"><strong>Altura de instrumento:</strong> ${fmt(comp.ai || 0)} m. <span class="formula">AI = Cota conocida + Lectura atrás</span></div></div>`;
    return moduleCard('Nivelación geométrica simple', 'Calcula altura de instrumento y cotas desde un banco de nivel.', renderEditableTable({ rows: comp.rows, columns: tableConfigs.nivel_simple.columns, moduleKey: 'nivel_simple', extrasHtml: extras }) + academicBoxFor('nivel_simple'));
  }
  function renderNivelCompuesta(p) {
    const mod = p.modules.nivel_compuesta;
    const comp = calcNivelCompuestaStruct(mod);
    const extras = `<div class="grid cols-2"><div class="field"><label>Cota inicial / BM</label><input data-module-extra="nivel_compuesta.cotaInicial" type="number" step="0.001" value="${escapeHtml(mod.cotaInicial)}"></div><div class="calc-box"><strong>Diferencia acumulada desde BM:</strong> ${fmt(comp.cierre || 0)} m. <span class="formula">Cota = AI - lectura</span></div></div>`;
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
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Perfil longitudinal"><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" stroke="currentColor" opacity=".4"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" stroke="currentColor" opacity=".4"/><polyline points="${ptsT}" fill="none" stroke="#174d80" stroke-width="3"/><polyline points="${ptsR}" fill="none" stroke="#d99a28" stroke-width="3" stroke-dasharray="8 5"/><text x="${pad}" y="22" fill="currentColor">Terreno (azul) · Rasante (dorado)</text></svg></div>`;
  }


  function renderModuleChart(key, rows, computed = {}) {
    if (!Array.isArray(rows) || rows.length === 0 || key === 'herramientas' || key === 'reportes') return '';
    const chartMap = {
      cinta: () => chainageChart(rows, 'Esquema lineal de tramos medidos con cinta'),
      brujula: () => compassChart(rows, 'Diagrama polar de rumbos / azimuts'),
      poligonal: () => xyChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), x: parseNum(r.esteCalc), y: parseNum(r.norteCalc) })), 'Croquis planimétrico de la poligonal', { closeShape: true }),
      radiacion: () => radiationChart(rows, 'Radiación desde estación conocida'),
      nivel_simple: () => levelChart(rows, 'Perfil altimétrico de nivelación simple'),
      nivel_compuesta: () => levelChart(rows.filter(r => isNum(r.cota)), 'Perfil altimétrico de nivelación compuesta'),
      taquimetria: () => taquiChart(rows, 'Perfil taquimétrico (DH acumulada vs cota)'),
      estacion_total: () => xyChart(rows.map((r, i) => ({ label: r.punto || String(i + 1), x: parseNum(r.este), y: parseNum(r.norte) })), 'Planta de puntos de estación total / coordenadas', { closeShape: false }),
      perfil: () => guitarProfileChart(rows, 'Perfil longitudinal tipo guitarra'),
      secciones: () => multiSectionChart(rows, 'Secciones transversales'),
      replanteo: () => replanteoVectorChart(rows, 'Vectores de replanteo: diseño vs campo')
    };
    const svg = chartMap[key] ? chartMap[key]() : '';
    if (!svg) return '';
    return `<div class="chart-panel"><div class="chart-title"><div><strong>Gráfico del módulo</strong><span>Replanteado con criterio topográfico y actualizado según los datos de la tabla.</span></div><div class="chart-actions no-print"><button class="btn small" data-chart-action="png" type="button">Exportar PNG</button><button class="btn small" data-chart-action="pdf" type="button">Exportar PDF</button></div></div>${svg}</div>`;
  }
  function scaleLinear(value, min, max, outMin, outMax) {
    if (!Number.isFinite(value)) return outMin;
    if (Math.abs(max - min) < 1e-9) return (outMin + outMax) / 2;
    return outMin + ((value - min) / (max - min)) * (outMax - outMin);
  }
  function svgLabel(text, x, y, size = 11, anchor = 'start') {
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="currentColor">${escapeHtml(String(text))}</text>`;
  }
  function niceTicks(min, max, count = 5) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
    if (min === max) return [min];
    const span = Math.abs(max - min);
    const raw = span / Math.max(count, 1);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    const step = nice * pow;
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step * 0.5; v += step) ticks.push(round(v, 6));
    return ticks;
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
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${padL}" y="18" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)} ${unit ? '(' + unit + ')' : ''}</text><line x1="${padL}" y1="${h-padB}" x2="${w-padR}" y2="${h-padB}" class="chart-axis"/><line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h-padB}" class="chart-axis"/>${bars}</svg></div>`;
  }
  function chainageChart(rows, title) {
    const data = rows.map((r, i) => ({ label: `${r.puntoInicial || i + 1}-${r.puntoFinal || ''}`.replace(/-$/,''), value: parseNum(r.distanciaHorizontal || r.distancia) })).filter(d => d.value > 0);
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 220, pad = 40;
    const total = data.reduce((a,b)=>a+b.value,0);
    let acc = 0;
    const baselineY = 110;
    const segs = data.map((d, i) => {
      const x1 = scaleLinear(acc, 0, total, pad, w-pad);
      acc += d.value;
      const x2 = scaleLinear(acc, 0, total, pad, w-pad);
      const mid = (x1 + x2) / 2;
      return `<line x1="${x1}" y1="${baselineY}" x2="${x2}" y2="${baselineY}" stroke="#174d80" stroke-width="10" stroke-linecap="round"/><line x1="${x1}" y1="${baselineY-16}" x2="${x1}" y2="${baselineY+16}" class="chart-axis"/><text x="${mid}" y="${baselineY-18}" text-anchor="middle" font-size="11" fill="currentColor">${escapeHtml(d.label)}</text><text x="${mid}" y="${baselineY+30}" text-anchor="middle" font-size="10" fill="currentColor">${fmt(d.value,2)} m</text>`;
    }).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" font-size="13" font-weight="700" fill="currentColor">${escapeHtml(title)}</text>${segs}<line x1="${pad}" y1="${baselineY-16}" x2="${pad}" y2="${baselineY+16}" class="chart-axis"/><line x1="${w-pad}" y1="${baselineY-16}" x2="${w-pad}" y2="${baselineY+16}" class="chart-axis"/><text x="${pad}" y="${h-16}" font-size="11" fill="currentColor">Longitud acumulada total: ${fmt(total,2)} m</text></svg></div>`;
  }
  function compassChart(rows, title) {
    const data = rows.map((r, i) => ({ label: `${r.estacion || 'E'}-${r.punto || i+1}`, az: isNum(r.azimutCorregido) ? parseNum(r.azimutCorregido) : isNum(r.azimut) ? parseNum(r.azimut) : rumboToAz(r.rumboDeg, r.cuadrante), d: parseNum(r.distancia) })).filter(d => Number.isFinite(d.az));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 300, cx = 220, cy = 155, r = 95;
    const maxD = Math.max(...data.map(d => d.d || 1), 1);
    const dirs = [['N',0],['E',90],['S',180],['O',270]];
    const grid = [0.25,0.5,0.75,1].map(f => `<circle cx="${cx}" cy="${cy}" r="${r*f}" fill="none" stroke="currentColor" opacity=".15"/>`).join('');
    const axis = dirs.map(([lab,a])=>{ const rad=degToRad(a); const x=cx + r*Math.sin(rad), y=cy - r*Math.cos(rad); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="chart-axis"/>${svgLabel(lab, cx + (r+18)*Math.sin(rad), cy - (r+18)*Math.cos(rad)+4, 12, 'middle')}`; }).join('');
    const rays = data.map((d, i) => {
      const rr = (d.d/maxD)*r;
      const rad = degToRad(d.az);
      const x = cx + rr*Math.sin(rad);
      const y = cy - rr*Math.cos(rad);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#174d80" stroke-width="2.5" opacity=".9"/><circle cx="${x}" cy="${y}" r="4.5" class="chart-point"/><text x="${x+7}" y="${y-7}" font-size="10" fill="currentColor">${escapeHtml(d.label)} · ${fmt(d.az,1)}°</text>`;
    }).join('');
    const legend = data.slice(0,8).map((d,i)=>`<text x="450" y="${42+i*18}" font-size="10" fill="currentColor">${escapeHtml(d.label)}: ${fmt(d.az,1)}° · ${fmt(d.d,2)} m</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="30" y="24" font-size="13" font-weight="700" fill="currentColor">${escapeHtml(title)}</text>${grid}${axis}${rays}<circle cx="${cx}" cy="${cy}" r="3" fill="#d99a28"/><text x="450" y="24" font-size="11" font-weight="700" fill="currentColor">Lecturas representadas sobre rosa de los vientos</text>${legend}</svg></div>`;
  }
  function levelChart(rows, title) {
    const data = rows.map((r, i) => ({ label: r.punto || `P${i+1}`, cota: parseNum(r.cota), ai: isNum(r.ai) ? parseNum(r.ai) : null })).filter(d => Number.isFinite(d.cota));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 260, pad = 46;
    const allY = data.flatMap(d => [d.cota, d.ai]).filter(Number.isFinite);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const pts = data.map((d, i) => ({ ...d, x: scaleLinear(i, 0, Math.max(data.length - 1, 1), pad, w - pad), y: scaleLinear(d.cota, minY, maxY, h - pad, pad), yAI: d.ai===null?null:scaleLinear(d.ai, minY, maxY, h - pad, pad) }));
    const terrain = pts.map(p => `${p.x},${p.y}`).join(' ');
    const aiLine = pts.filter(p => p.yAI !== null).map(p => `${p.x},${p.yAI}`).join(' ');
    const labels = pts.map(p => `<text x="${p.x}" y="${h-14}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text><text x="${p.x}" y="${p.y-8}" text-anchor="middle" font-size="10" fill="currentColor">${fmt(p.cota,2)}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="chart-axis"/><polyline points="${terrain}" fill="none" class="chart-line"/>${aiLine ? `<polyline points="${aiLine}" fill="none" class="chart-line accent" stroke-dasharray="8 6"/>` : ''}${pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" class="chart-point"/>`).join('')}${labels}<text x="${w-240}" y="24" font-size="11" fill="currentColor">Cota: azul ${aiLine ? '· AI: dorado' : ''}</text></svg></div>`;
  }
  function taquiChart(rows, title) {
    let acc = 0;
    const data = rows.map((r, i) => {
      const dh = parseNum(r.distanciaHorizontal);
      acc += dh;
      return { label: r.punto || `P${i+1}`, x: acc, y: parseNum(r.cotaPunto), dh };
    }).filter(d => Number.isFinite(d.y));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 270, pad = 46;
    const minX = 0, maxX = Math.max(...data.map(d=>d.x), 1), minY = Math.min(...data.map(d=>d.y)), maxY = Math.max(...data.map(d=>d.y));
    const pts = data.map(d => ({ ...d, sx: scaleLinear(d.x, minX, maxX, pad, w-pad), sy: scaleLinear(d.y, minY, maxY, h-pad, pad) }));
    const poly = pts.map(p=>`${p.sx},${p.sy}`).join(' ');
    const stems = pts.map(p=>`<line x1="${p.sx}" y1="${h-pad}" x2="${p.sx}" y2="${p.sy}" stroke="#d99a28" opacity=".55"/>`).join('');
    const labels = pts.map((p,i)=>(i % Math.ceil(pts.length/6)===0 || i===pts.length-1)?`<text x="${p.sx}" y="${h-14}" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text>`:'').join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="chart-axis"/>${stems}<polyline points="${poly}" fill="none" class="chart-line"/>${pts.map(p=>`<circle cx="${p.sx}" cy="${p.sy}" r="4.2" class="chart-point"/><text x="${p.sx}" y="${p.sy-8}" text-anchor="middle" font-size="10" fill="currentColor">${fmt(p.y,2)}</text>`).join('')}${labels}<text x="${w-210}" y="24" font-size="11" fill="currentColor">X: DH acumulada · Y: cota calculada</text></svg></div>`;
  }
  function xyChart(items, title, opts = {}) {
    const data = items.filter(d => Number.isFinite(d.x) && Number.isFinite(d.y));
    if (!data.length) return `<div class="empty-chart">No hay coordenadas suficientes para graficar.</div>`;
    const w = 920, h = 300, pad = 48;
    let minX = Math.min(...data.map(d => d.x)), maxX = Math.max(...data.map(d => d.x));
    let minY = Math.min(...data.map(d => d.y)), maxY = Math.max(...data.map(d => d.y));
    const mx = Math.max((maxX - minX) * 0.08, 1), my = Math.max((maxY - minY) * 0.08, 1);
    minX -= mx; maxX += mx; minY -= my; maxY += my;
    const pts = data.map(d => ({ ...d, sx: scaleLinear(d.x, minX, maxX, pad, w - pad), sy: scaleLinear(d.y, minY, maxY, h - pad, pad) }));
    const polyPoints = pts.map(p => `${p.sx},${p.sy}`).join(' ');
    const poly = `<polyline points="${polyPoints}${opts.closeShape && pts.length > 2 ? ' ' + pts[0].sx + ',' + pts[0].sy : ''}" fill="none" class="chart-line"/>`;
    const nodes = pts.map((p, i) => `<circle cx="${p.sx}" cy="${p.sy}" r="${i===0?5.5:4.5}" fill="${i===0?'#2f855a':'#d99a28'}" stroke="#0b2a4a" stroke-width="1.5"/><text x="${p.sx + 7}" y="${p.sy - 7}" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text>`).join('');
    const xticks = niceTicks(minX, maxX, 4).map(t=>`<line x1="${scaleLinear(t,minX,maxX,pad,w-pad)}" y1="${pad}" x2="${scaleLinear(t,minX,maxX,pad,w-pad)}" y2="${h-pad}" stroke="currentColor" opacity=".07"/><text x="${scaleLinear(t,minX,maxX,pad,w-pad)}" y="${h-10}" text-anchor="middle" font-size="10" fill="currentColor">${fmt(t,0)}</text>`).join('');
    const yticks = niceTicks(minY, maxY, 4).map(t=>`<line x1="${pad}" y1="${scaleLinear(t,minY,maxY,h-pad,pad)}" x2="${w-pad}" y2="${scaleLinear(t,minY,maxY,h-pad,pad)}" stroke="currentColor" opacity=".07"/><text x="${pad-8}" y="${scaleLinear(t,minY,maxY,h-pad,pad)+4}" text-anchor="end" font-size="10" fill="currentColor">${fmt(t,0)}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text>${xticks}${yticks}<line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="chart-axis"/>${poly}${nodes}<text x="${w-120}" y="${h-10}" font-size="10" fill="currentColor">Este</text><text x="12" y="${pad}" font-size="10" fill="currentColor">Norte</text></svg></div>`;
  }
  function radiationChart(rows, title) {
    const data = rows.map((r, i) => ({ label: r.punto || `P${i+1}`, x: parseNum(r.este), y: parseNum(r.norte) })).filter(d => Number.isFinite(d.x) && Number.isFinite(d.y));
    if (!data.length) return `<div class="empty-chart">No hay coordenadas suficientes para graficar.</div>`;
    const stationX = data.reduce((a,b)=>a+b.x,0)/data.length;
    const stationY = data.reduce((a,b)=>a+b.y,0)/data.length;
    const w = 920, h = 300, pad = 48;
    let minX = Math.min(...data.map(d => d.x), stationX), maxX = Math.max(...data.map(d => d.x), stationX);
    let minY = Math.min(...data.map(d => d.y), stationY), maxY = Math.max(...data.map(d => d.y), stationY);
    const mx = Math.max((maxX - minX) * 0.1, 1), my = Math.max((maxY - minY) * 0.1, 1);
    minX -= mx; maxX += mx; minY -= my; maxY += my;
    const sx = scaleLinear(stationX, minX, maxX, pad, w-pad), sy = scaleLinear(stationY, minY, maxY, h-pad, pad);
    const pts = data.map(d => ({ ...d, px: scaleLinear(d.x, minX, maxX, pad, w-pad), py: scaleLinear(d.y, minY, maxY, h-pad, pad) }));
    const rays = pts.map(p=>`<line x1="${sx}" y1="${sy}" x2="${p.px}" y2="${p.py}" stroke="#174d80" opacity=".85" stroke-width="2"/><circle cx="${p.px}" cy="${p.py}" r="4.2" class="chart-point"/><text x="${p.px+7}" y="${p.py-7}" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="chart-axis"/><circle cx="${sx}" cy="${sy}" r="6" fill="#2f855a" stroke="#0b2a4a" stroke-width="1.5"/><text x="${sx+8}" y="${sy-8}" font-size="10" fill="currentColor">Estación</text>${rays}</svg></div>`;
  }
  function guitarProfileChart(rows, title) {
    const data = rows.map((r, i) => ({
      pk: r.progresiva || String(i+1),
      x: parseNum(r.distanciaAcumulada),
      terr: parseNum(r.cotaTerreno),
      ras: parseNum(r.cotaRasante),
      tub: isNum(r.cotaTuberia) ? parseNum(r.cotaTuberia) : null,
      diff: isNum(r.diferencia) ? parseNum(r.diferencia) : parseNum(r.cotaTerreno) - parseNum(r.cotaRasante),
      pend: parseNum(r.pendiente),
      obs: r.observacion || ''
    })).filter(d => Number.isFinite(d.terr) || Number.isFinite(d.ras));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 960, h = 420, padL = 60, padR = 18, top = 34, profH = 210, bandTop = 258, bandBottom = 404;
    const maxX = Math.max(...data.map(d=>d.x), 1);
    const allY = data.flatMap(d => [d.terr, d.ras, d.tub]).filter(Number.isFinite);
    let minY = Math.min(...allY), maxY = Math.max(...allY);
    const marginY = Math.max((maxY - minY) * 0.12, 0.5); minY -= marginY; maxY += marginY;
    const x = v => scaleLinear(v, 0, maxX, padL, w-padR);
    const y = v => scaleLinear(v, minY, maxY, top+profH, top);
    const gridY = niceTicks(minY, maxY, 5).map(t=>`<line x1="${padL}" y1="${y(t)}" x2="${w-padR}" y2="${y(t)}" stroke="currentColor" opacity=".08"/><text x="${padL-8}" y="${y(t)+4}" text-anchor="end" font-size="10" fill="currentColor">${fmt(t,2)}</text>`).join('');
    const terrain = data.map(d=>`${x(d.x)},${y(d.terr)}`).join(' ');
    const rasante = data.map(d=>`${x(d.x)},${y(d.ras)}`).join(' ');
    const tuberia = data.filter(d=>Number.isFinite(d.tub)).map(d=>`${x(d.x)},${y(d.tub)}`).join(' ');
    const fill = terrain + ' ' + data.slice().reverse().map(d=>`${x(d.x)},${y(d.ras)}`).join(' ');
    const verticals = data.map(d=>`<line x1="${x(d.x)}" y1="${top}" x2="${x(d.x)}" y2="${bandBottom}" stroke="currentColor" opacity=".12"/>`).join('');
    const labels = data.map(d=>`<text x="${x(d.x)}" y="${bandTop+18}" text-anchor="middle" font-size="9.5" fill="currentColor">${escapeHtml(d.pk)}</text><text x="${x(d.x)}" y="${bandTop+36}" text-anchor="middle" font-size="9.5" fill="currentColor">${fmt(d.terr,2)}</text><text x="${x(d.x)}" y="${bandTop+54}" text-anchor="middle" font-size="9.5" fill="currentColor">${fmt(d.ras,2)}</text><text x="${x(d.x)}" y="${bandTop+72}" text-anchor="middle" font-size="9.5" fill="currentColor">${Number.isFinite(d.tub) ? fmt(d.tub,2) : '-'}</text><text x="${x(d.x)}" y="${bandTop+90}" text-anchor="middle" font-size="9.5" fill="currentColor">${fmt(d.diff,2)}</text><text x="${x(d.x)}" y="${bandTop+108}" text-anchor="middle" font-size="9.5" fill="currentColor">${fmt(d.pend,2)}</text><text x="${x(d.x)}" y="${bandTop+126}" text-anchor="middle" font-size="9" fill="currentColor">${escapeHtml(String(d.obs).slice(0,12) || '-')}</text>`).join('');
    const bandLines = [0,18,36,54,72,90,108,126,144].map(v=>`<line x1="${padL}" y1="${bandTop+v}" x2="${w-padR}" y2="${bandTop+v}" stroke="currentColor" opacity=".2"/>`).join('');
    const rowNames = [['PK',18],['Terr. nat.',36],['Rasante',54],['Tubería',72],['Cota roja',90],['Pend %',108],['Observ.',126]].map(([lab,yy])=>`<text x="${padL-8}" y="${bandTop+yy}" text-anchor="end" font-size="9.5" font-weight="700" fill="currentColor">${lab}</text>`).join('');
    return `<div class="chart" style="height:420px"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><text x="${padL}" y="20" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text>${gridY}<line x1="${padL}" y1="${top+profH}" x2="${w-padR}" y2="${top+profH}" class="chart-axis"/><line x1="${padL}" y1="${top}" x2="${padL}" y2="${top+profH}" class="chart-axis"/>${verticals}<polygon points="${fill}" fill="#174d80" opacity=".08"/><polyline points="${terrain}" fill="none" class="chart-line"/><polyline points="${rasante}" fill="none" class="chart-line accent" stroke-dasharray="8 6"/>${tuberia ? `<polyline points="${tuberia}" fill="none" stroke="#2f855a" stroke-width="3" stroke-dasharray="5 4"/>` : ''}${data.map(d=>`<circle cx="${x(d.x)}" cy="${y(d.terr)}" r="3.5" fill="#174d80"/><circle cx="${x(d.x)}" cy="${y(d.ras)}" r="3.2" fill="#d99a28"/>${Number.isFinite(d.tub) ? `<circle cx="${x(d.x)}" cy="${y(d.tub)}" r="3.1" fill="#2f855a"/>` : ''}`).join('')}<rect x="${padL}" y="${bandTop}" width="${w-padL-padR}" height="144" fill="none" stroke="currentColor" opacity=".25"/>${bandLines}${rowNames}${labels}<text x="${w-315}" y="20" font-size="10.5" fill="currentColor">Terreno natural: azul · Rasante de proyecto: dorado · Tubería: verde · Formato tipo guitarra</text></svg></div>`;
  }
  function multiSectionChart(rows, title) {
    const groups = {};
    rows.forEach((r, i) => {
      const key = r.progresiva || `Grupo ${i+1}`;
      (groups[key] ||= []).push({ label: r.lado || String(i+1), x: parseNum(r.offset), y: parseNum(r.cotaTerreno), yp: parseNum(r.cotaProyecto) });
    });
    const entries = Object.entries(groups).slice(0,4).map(([pk, arr]) => {
      const data = arr.filter(d => Number.isFinite(d.x) && Number.isFinite(d.y)).sort((a,b)=>a.x-b.x);
      if (!data.length) return '';
      const w = 430, h = 240, pad = 44;
      const valsY = data.flatMap(d=>[d.y,d.yp]).filter(Number.isFinite);
      let minX = Math.min(...data.map(d=>d.x)), maxX = Math.max(...data.map(d=>d.x));
      let minY = Math.min(...valsY), maxY = Math.max(...valsY);
      if (minX === maxX) { minX -= 1; maxX += 1; }
      if (minY === maxY) { minY -= 1; maxY += 1; }
      const p1 = data.map(d=>`${scaleLinear(d.x,minX,maxX,pad,w-pad)},${scaleLinear(d.y,minY,maxY,h-pad,pad)}`).join(' ');
      const p2 = data.map(d=>`${scaleLinear(d.x,minX,maxX,pad,w-pad)},${scaleLinear(d.yp,minY,maxY,h-pad,pad)}`).join(' ');
      const step = Math.max(1, Math.ceil(data.length / 5));
      const labels = data.map((d,i)=> (i % step === 0 || i===data.length-1) ? `<text x="${scaleLinear(d.x,minX,maxX,pad,w-pad)}" y="${h-12}" text-anchor="middle" font-size="9.5" fill="currentColor">${fmt(d.x,1)}</text>` : '').join('');
      return `<div class="chart" style="height:240px"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Sección ${escapeHtml(pk)}"><text x="${pad}" y="20" fill="currentColor" font-size="12" font-weight="700">Prog. ${escapeHtml(pk)}</text><line x1="${pad}" y1="${h-pad}" x2="${w-pad}" y2="${h-pad}" class="chart-axis"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h-pad}" class="chart-axis"/><polyline points="${p1}" fill="none" class="chart-line"/><polyline points="${p2}" fill="none" class="chart-line accent" stroke-dasharray="8 6"/>${labels}<text x="${w-145}" y="20" font-size="10" fill="currentColor">Terreno / Proyecto</text><text x="${w/2}" y="${h-26}" text-anchor="middle" font-size="9.5" fill="currentColor">Offsets (m)</text></svg></div>`;
    }).join('');
    return `<div><div class="chart-title" style="margin-bottom:8px"><strong>${escapeHtml(title)}</strong><span>Se muestran hasta 4 progresivas</span></div><div class="grid cols-2">${entries || '<div class="empty-chart">No hay datos suficientes para graficar.</div>'}</div></div>`;
  }
  function replanteoVectorChart(rows, title) {
    const data = rows.map((r, i) => ({ label: r.punto || `P${i+1}`, de: isNum(r.deltaE) ? parseNum(r.deltaE) : parseNum(r.esteCampo) - parseNum(r.esteDiseno), dn: isNum(r.deltaN) ? parseNum(r.deltaN) : parseNum(r.norteCampo) - parseNum(r.norteDiseno) })).filter(d => Number.isFinite(d.de) && Number.isFinite(d.dn));
    if (!data.length) return `<div class="empty-chart">No hay datos suficientes para graficar.</div>`;
    const w = 920, h = 300, pad = 48;
    const maxAbs = Math.max(...data.flatMap(d => [Math.abs(d.de), Math.abs(d.dn)]), 0.01) * 1.2;
    const x = v => scaleLinear(v, -maxAbs, maxAbs, pad, w-pad);
    const y = v => scaleLinear(v, -maxAbs, maxAbs, h-pad, pad);
    const grid = niceTicks(-maxAbs, maxAbs, 4).map(t=>`<line x1="${x(t)}" y1="${pad}" x2="${x(t)}" y2="${h-pad}" stroke="currentColor" opacity=".08"/><line x1="${pad}" y1="${y(t)}" x2="${w-pad}" y2="${y(t)}" stroke="currentColor" opacity=".08"/>`).join('');
    const originX = x(0), originY = y(0);
    const arrows = data.map(d=>`<line x1="${originX}" y1="${originY}" x2="${x(d.de)}" y2="${y(d.dn)}" stroke="#174d80" stroke-width="2.3" marker-end="url(#arrow)"/><circle cx="${x(d.de)}" cy="${y(d.dn)}" r="4.3" class="chart-point"/><text x="${x(d.de)+7}" y="${y(d.dn)-7}" font-size="10" fill="currentColor">${escapeHtml(d.label)} (${fmt(d.de,3)}, ${fmt(d.dn,3)})</text>`).join('');
    return `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(title)}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#174d80"/></marker></defs><text x="${pad}" y="22" fill="currentColor" font-size="13" font-weight="700">${escapeHtml(title)}</text>${grid}<line x1="${pad}" y1="${originY}" x2="${w-pad}" y2="${originY}" class="chart-axis"/><line x1="${originX}" y1="${pad}" x2="${originX}" y2="${h-pad}" class="chart-axis"/>${arrows}<text x="${w-120}" y="${originY-8}" font-size="10" fill="currentColor">ΔE</text><text x="${originX+6}" y="${pad+10}" font-size="10" fill="currentColor">ΔN</text></svg></div>`;
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
      <div class="table-wrap"><table><tbody>${Object.entries(p.general).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table></div>`);
  }

  function attachDynamicHandlers(root) {
    bindGeneralInputs(root, activeProject(), '');
    attachTableHandlers(root);
    if (root.dataset.dynamicHandlersBound === '1') return;
    root.dataset.dynamicHandlersBound = '1';
    root.addEventListener('input', e => {
      const extra = e.target.closest('[data-module-extra]');
      if (!extra) return;
      setModuleExtra(extra.dataset.moduleExtra, extra.value);
    });
    root.addEventListener('change', e => {
      const extra = e.target.closest('[data-module-extra]');
      if (!extra) return;
      setModuleExtra(extra.dataset.moduleExtra, extra.value === 'true' ? true : extra.value === 'false' ? false : extra.value);
      render();
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
      const chartBtn = e.target.closest('[data-chart-action]');
      if (chartBtn) handleChartAction(chartBtn.dataset.chartAction, chartBtn.closest('.chart-panel'));
    });
  }
  function setModuleExtra(path, value) {
    const p = activeProject(); if (!p) return;
    const parts = path.split('.');
    let ref = p.modules;
    while (parts.length > 1) {
      const part = parts.shift();
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
    if (action === 'new-project') { const p = defaultProject(); p.name = prompt('Nombre del proyecto:', p.name) || p.name; state.projects.push(p); state.activeId = p.id; await dbPut(p); render(); }
    if (action === 'duplicate-project') await duplicateProject();
    if (action === 'delete-project') { const p = activeProject(); if (p && confirm('¿Eliminar el proyecto activo?')) { await dbDelete(p.id); state.projects = state.projects.filter(x => x.id !== p.id); state.activeId = state.projects[0]?.id || null; render(); } }
    if (action === 'export-project') exportProject(activeProject()?.id);
    if (action === 'import-project') importProjectJSON();
    if (action === 'save-now') { await dbPut(activeProject()); await loadProjects(false); renderProjectSelect(); $('#saveStatus').textContent = 'Guardado manual'; }
    if (action === 'print-project') printProject();
  }
  function exportProject(id) {
    const p = state.projects.find(x => x.id === id); if (!p) return;
    download(`${safeName(p.name)}_respaldo_topotaqui.json`, JSON.stringify(p, null, 2), 'application/json;charset=utf-8');
  }
  function importProjectJSON() {
    const input = $('#fileInput');
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try {
        const p = JSON.parse(await file.text());
        p.id = p.id || uid(); p.updatedAt = nowISO(); p.createdAt = p.createdAt || nowISO();
        state.projects = state.projects.filter(x => x.id !== p.id).concat(p); state.activeId = p.id; await dbPut(p); render();
      } catch (err) { alert('No se pudo importar el JSON.'); }
      input.value = '';
    };
    input.click();
  }
  function handleTool(tool) {
    if (tool === 'rumboAz') { const az = rumboToAz($('#toolRumbo').value, $('#toolCuadrante').value); $('#toolRumboOut').innerHTML = `<strong>Azimut:</strong> ${fmt(az,4)}°`; }
    if (tool === 'azRumbo') { const r = azToRumbo($('#toolAz').value); $('#toolAzOut').innerHTML = `<strong>Rumbo:</strong> ${fmt(r.deg,4)}° ${r.q}`; }
    if (tool === 'pendiente') { const dz = parseNum($('#toolDz').value), dh = parseNum($('#toolDh').value); const p = dh ? dz / dh * 100 : 0; $('#toolPendOut').innerHTML = `<strong>Pendiente:</strong> ${fmt(p,3)} %`; }
    if (tool === 'coord') { const e1=parseNum($('#e1').value),n1=parseNum($('#n1').value),e2=parseNum($('#e2').value),n2=parseNum($('#n2').value); const de=e2-e1,dn=n2-n1,d=Math.sqrt(de*de+dn*dn),az=normAz(radToDeg(Math.atan2(de,dn))); $('#toolCoordOut').innerHTML = `<strong>Distancia:</strong> ${fmt(d)} m<br><strong>Azimut:</strong> ${fmt(az,4)}°`; }
    if (tool === 'area') { const pts=$('#toolArea').value.trim().split(/\n+/).map(l=>l.split(/[;,\s]+/).map(parseNum)).filter(a=>a.length>=2); let s=0; pts.forEach((p,i)=>{ const q=pts[(i+1)%pts.length]; s += p[0]*q[1]-p[1]*q[0]; }); $('#toolAreaOut').innerHTML = `<strong>Área:</strong> ${fmt(Math.abs(s)/2)} m² · ${fmt(Math.abs(s)/20000,4)} ha`; }
    if (tool === 'dms') { const dec = parseNum($('#deg').value) + parseNum($('#min').value)/60 + parseNum($('#sec').value)/3600; $('#toolDmsOut').innerHTML = `<strong>Decimal:</strong> ${fmt(dec,6)}°`; }
    if (tool === 'decimalDms') { const v=parseNum($('#decDeg').value); const d=Math.trunc(v), m=Math.trunc((Math.abs(v-d))*60), s=(Math.abs(v-d)*60-m)*60; $('#toolDmsOut').innerHTML = `<strong>DMS:</strong> ${d}° ${m}' ${fmt(s,2)}"`; }
  }
  function handleChartAction(action, panel) {
    const svg = panel?.querySelector('svg');
    if (!svg) return alert('No se encontró un gráfico para exportar.');
    const title = panel.querySelector('.chart-title strong')?.textContent || 'grafico_topografia';
    if (action === 'png') exportChartPNG(svg, title);
    if (action === 'pdf') exportChartPDF(svg, title);
  }
  function exportChartPNG(svg, title) {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);
    if (!source.includes('xmlns=')) source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const svgBlob = new Blob([source], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const vb = svg.viewBox.baseVal;
      const width = (vb && vb.width) || svg.clientWidth || 1000;
      const height = (vb && vb.height) || svg.clientHeight || 600;
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.scale(2,2);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${safeName(title)}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
  function exportChartPDF(svg, title) {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);
    if (!source.includes('xmlns=')) source = source.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:24px;background:#fff;color:#111}h1{font-size:18px;margin:0 0 12px;color:#0b2a4a}.wrap{border:1px solid #dbe3ee;border-radius:12px;padding:14px}svg{width:100%;height:auto}</style></head><body><h1>${escapeHtml(title)}</h1><div class="wrap">${source}</div><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  }
  function printCurrentModule() { window.print(); }
  function printProject() {
    const p = activeProject(); if (!p) return;
    const win = window.open('', '_blank');
    const css = `<style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1,h2{color:#0b2a4a}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #bbb;padding:6px;font-size:12px}th{background:#eef3f8;text-align:left}.note{border-left:4px solid #d99a28;padding:10px;background:#fff7e5}</style>`;
    const sections = Object.keys(tableConfigs).map(key => {
      const rows = computeForExport(key), cols = exportColumnsFor(key);
      return `<h2>${escapeHtml(modules.find(m=>m.id===key)?.label || key)}</h2><table><tr>${cols.map(c=>`<th>${escapeHtml(c.label)}</th>`).join('')}</tr>${rows.map(r=>`<tr>${cols.map(c=>`<td>${escapeHtml(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')}</table>`;
    }).join('');
    win.document.write(`<html><head><title>Reporte ${escapeHtml(p.name)}</title>${css}</head><body><h1>${escapeHtml(p.name)}</h1><p class="note">Reporte generado por Practicas de Topografia. Verificar tolerancias con normativa peruana aplicable, expediente técnico y criterio profesional.</p><h2>Datos generales</h2><table>${Object.entries(p.general).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</table>${sections}</body></html>`);
    win.document.close(); win.focus(); setTimeout(()=>win.print(), 500);
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
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  function bindGlobalEvents() {
    $('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#projectSelect').addEventListener('change', e => { state.activeId = e.target.value; render(); });
    $('#newProjectBtn').addEventListener('click', () => handleMainAction('new-project'));
    $('#saveBtn').addEventListener('click', () => handleMainAction('save-now'));
    $('#themeToggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('topotaqui-theme', state.theme); render(); });
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; $('#installBtn').classList.remove('hidden'); });
    $('#installBtn').addEventListener('click', async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; $('#installBtn').classList.add('hidden'); });
  }
  init();
})();
