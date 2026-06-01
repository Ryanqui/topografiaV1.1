# TopoPro Web - Calculadora Topográfica Integral

Aplicación web autocontenida para resolver ejercicios topográficos académicos y técnicos. Funciona abriendo `index.html` en un navegador moderno, sin instalar servidor ni dependencias externas.

## Módulos funcionales incluidos

1. Dashboard principal.
2. Brújula y poligonal: rumbos, azimuts, proyecciones, error de cierre, precisión relativa, ajuste Bowditch y tránsito, croquis SVG.
3. Nivelación simple: altura de instrumento, desnivel y cota nueva.
4. Nivelación compuesta: vistas atrás/intermedias/adelante, puntos de cambio, verificación aritmética.
5. Nivelación cerrada: error de cierre, tolerancia, corrección por distancia o por número de estaciones, perfil longitudinal.
6. Estación total: radiación con distancia inclinada, ángulo horizontal, vertical/cenital, altura de instrumento/prisma y coordenadas XYZ.
7. Coordenadas y conversiones: rumbo/azimut, DMS/decimal, distancia y azimut entre coordenadas, radiación y pendiente.
8. Áreas por coordenadas: método de Gauss, perímetro, hectáreas, km² y croquis.
9. Biblioteca de ejercicios prácticos con carga automática de ejemplos.

## Cómo usar

1. Descomprime el paquete.
2. Abre `index.html` con Chrome, Edge, Firefox o Brave.
3. Crea o duplica un proyecto desde el panel lateral.
4. Ingresa datos manualmente o importa archivos CSV/TXT/JSON desde cada módulo.
5. Haz clic en **Calcular**.
6. Exporta resultados a CSV, XLS compatible con Excel, JSON o usa **PDF/Imprimir** para guardar como PDF.

## Plantillas de importación

La carpeta `templates/` incluye plantillas CSV para:

- `plantilla_brujula.csv`
- `plantilla_nivelacion_simple.csv`
- `plantilla_nivelacion_compuesta.csv`
- `plantilla_nivelacion_cerrada.csv`
- `plantilla_estacion_total.csv`
- `plantilla_areas.csv`

## Notas técnicas

- El almacenamiento se realiza con LocalStorage del navegador.
- El botón de respaldo descarga el proyecto completo en JSON.
- La exportación Excel se genera en formato `.xls` compatible con Excel mediante tabla HTML.
- La versión offline importa CSV, TXT y JSON. La entrada XLSX está detectada y preparada para integrarse en una versión con SheetJS si se desea soporte nativo `.xlsx`.
- Los gráficos se generan como SVG dentro del navegador.

## Recomendaciones para futuras versiones

- Integrar SheetJS para importación/exportación XLSX nativa.
- Integrar jsPDF o pdfmake para PDF directo sin depender de la impresión del navegador.
- Añadir IndexedDB para proyectos grandes con fotografías o croquis manuales.
- Incorporar módulos pendientes: teodolito, taquimetría, curvas de nivel, perfiles, volúmenes, curvas horizontales/verticales, GNSS y libreta de campo avanzada.
- Incorporar validaciones normativas por tolerancias configurables según tipo de trabajo.

## Advertencia profesional

La aplicación está diseñada para aprendizaje, revisión técnica y cálculos preliminares. Para trabajos oficiales o de obra, verifique datum, sistema de referencia, calibración de equipos, tolerancias aplicables y normativa local.
