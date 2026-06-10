Practicas de Topografia - Versión PWA institucional
===================================================
Responsable visible: Jesus Alfonso Barrante Flores

Aplicativo web funcional para escritorio y celulares. Permite registrar datos de prácticas de topografía, calcular resultados, guardar proyectos localmente, exportar respaldos, exportar gráficos y trabajar sin conexión cuando se instala como PWA.

Mejoras incorporadas en esta versión:
- Logotipo institucional propio en SVG y PNG.
- Portada institucional en el panel principal.
- Iconos técnicos por módulo en lugar de emojis genéricos.
- Exportación directa a Excel .xlsx por módulo.
- Exportación de gráficos como PNG.
- Exportación de gráficos a PDF mediante ventana de impresión.
- PWA completa básica: manifest.webmanifest, iconos 192/512 y service worker offline.
- Caché offline de archivos principales: HTML, CSS, JS, logotipo, portada e iconos.
- Perfil longitudinal tipo guitarra con bandas de terreno natural, rasante, tubería, cota roja, pendiente y observaciones.
- Corrección visual de secciones transversales para evitar sobreposición de textos.

Archivos principales:
- index.html: interfaz principal.
- styles.css: estilos responsive e identidad institucional.
- app.js: cálculos, tablas, gráficos, exportación, PWA y lógica del aplicativo.
- manifest.webmanifest: configuración instalable PWA.
- sw.js: service worker para caché offline.
- assets/logo.svg: logotipo institucional.
- assets/cover.svg: portada institucional del panel.
- assets/icon-192.png y assets/icon-512.png: iconos de instalación.

Uso en escritorio:
1. Descomprima el ZIP.
2. Abra index.html en Chrome, Edge o Firefox.
3. Cree un proyecto y registre datos por módulo.
4. Use guardar, importar/exportar JSON, CSV, Excel y gráficos.

Uso como PWA/offline:
1. Abra una terminal dentro de la carpeta del aplicativo.
2. Ejecute: python -m http.server 8000
3. Abra: http://localhost:8000
4. Use el botón instalar del navegador.
5. Luego podrá abrir el aplicativo como app instalada y trabajar sin conexión con los archivos cacheados.

Advertencia técnica:
Las fórmulas son de uso académico y técnico. Las tolerancias, precisiones y criterios de aceptación deben verificarse con normativa peruana aplicable, expediente técnico, especificaciones del proyecto y criterio profesional responsable.
