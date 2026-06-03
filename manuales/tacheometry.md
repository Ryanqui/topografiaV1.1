# Manual del módulo Taquimetría

## Objetivo
Calcular distancias, desniveles, cotas y coordenadas a partir de lecturas estadimétricas.

## Datos del ejemplo precargado
Estación E=2000, N=2000, Z=105, HI=1.50, K=100. Lecturas superior, media e inferior.

## Cálculo paso a paso
1. Calcular intervalo estadimétrico s = LS - LI.
2. Calcular DH = K * s * cos²(α) + C * cos(α).
3. Calcular desnivel = DH * tan(α) + HI - lectura media.
4. Proyectar coordenadas con el azimut de radiación.
5. Para Q-1: s=0.660, DH=65.754 m, desnivel=3.972 m, cota=108.972 m.

## Resultado principal
Se calcularon 2 puntos taquimétricos.
