# Manual del módulo Estación total

## Objetivo
Procesar radiaciones desde una estación total para obtener coordenadas X, Y, Z.

## Datos del ejemplo precargado
Estación E-1: E=5000, N=8000, Z=120, azimut base=35°, HI=1.55 m. Tres puntos radiados.

## Cálculo paso a paso
1. Para cada punto: Az punto = Az base + ángulo horizontal.
2. Con ángulo cenital: DH = DI * sen(Z) y ΔZ = DI * cos(Z) + HI - HP.
3. Luego: E = E0 + DH * sen(Az), N = N0 + DH * cos(Az), Z = Z0 + ΔZ.
4. Para P-101: Az=50.000°, DH=48.483 m, E=5037.140, N=8031.165, Z=121.320.

## Resultado principal
Se calcularon 3 puntos radiados con coordenadas XYZ.
