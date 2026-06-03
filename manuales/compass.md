# Manual del módulo Brújula / Poligonal

## Objetivo
Resolver poligonales con rumbos o azimuts, calcular proyecciones, coordenadas y cierre.

## Datos del ejemplo precargado
Punto inicial N=1000, E=1000. Lados: AB 120 m N45E, BC 95 m S70E, CD 110 m S35W y DA 130 m N55W.

## Cálculo paso a paso
1. Convertir rumbos a azimut: AB=45.000°, BC=110.000°, CD=215.000°, DA=305.000°.
2. Calcular proyecciones: ΔN = D cos(Az) y ΔE = D sen(Az).
3. Sumar proyecciones: ΣΔN=36.819 m y ΣΔE=4.540 m.
4. Calcular error lineal: e = sqrt(ΣΔN² + ΣΔE²) = 37.098 m.
5. Distribuir el error por Bowditch proporcional a la longitud de cada lado y acumular coordenadas corregidas.

## Resultado principal
Longitud total = 455.000 m; error lineal = 37.098 m; precisión relativa aproximada = 1:12.
