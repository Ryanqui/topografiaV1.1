# Manual del módulo Curvas geométricas

## Objetivo
Calcular elementos de curvas horizontales y una tabla de curva vertical.

## Datos del ejemplo precargado
Curva horizontal: R=80 m, Δ=45°, PI=250. Curva vertical: g1=2%, g2=-1%, L=120 m, PIV=500, cota PIV=110.

## Cálculo paso a paso
1. Tangente horizontal: T = R tan(Δ/2) = 33.137 m.
2. Longitud de curva: L = πRΔ/180 = 62.832 m.
3. PC = PI - T = 216.863; PT = PC + L = 279.695.
4. Para la vertical, se calcula PVC=PIV-L/2 y se generan cotas por parábola.

## Resultado principal
PC=216.863, PT=279.695. La tabla vertical contiene 7 puntos de replanteo.
