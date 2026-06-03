# TopoPro Web 3.0

Aplicación web autocontenida para resolver ejercicios de topografía por módulos independientes.

## Cómo usar
1. Abra `index.html` en Chrome, Edge o Firefox.
2. Use el botón **Cargar ejemplos** para restaurar los datos de prueba.
3. Entre a cada módulo, edite datos y presione **Calcular**.
4. Exporte resultados en CSV, Excel compatible, JSON o use **PDF/Imprimir**.
5. Configure logo, modo claro/oscuro y colores desde la barra lateral.

## Módulos incluidos
- Brújula / poligonal
- Nivelación simple
- Nivelación compuesta
- Nivelación cerrada
- Estación total
- Teodolito
- Taquimetría
- Coordenadas y conversiones
- Áreas por coordenadas
- Curvas de nivel
- Perfiles longitudinales
- Volúmenes y diagrama de masas
- Curvas horizontales y verticales
- GNSS / GPS
- Libreta digital
- Manuales integrados

## Notas técnicas
- La app funciona sin servidor, usando LocalStorage.
- Importa CSV, TXT y JSON.
- Exporta CSV, JSON y Excel compatible `.xls`.
- Para importación nativa `.xlsx`, se recomienda integrar SheetJS en una siguiente versión.
