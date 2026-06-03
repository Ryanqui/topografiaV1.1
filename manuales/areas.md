# Manual del módulo Áreas por coordenadas

## Objetivo
Calcular el área y perímetro de un polígono por el método de Gauss.

## Datos del ejemplo precargado
Vértices A, B, C y D con coordenadas locales E/N.

## Cálculo paso a paso
1. Ordenar los vértices según el contorno del terreno.
2. Aplicar productos cruzados: Σ(E_i*N_{i+1}) y Σ(N_i*E_{i+1}).
3. Área = 1/2 * |suma directa - suma inversa|.
4. Perímetro = suma de distancias entre vértices consecutivos.

## Resultado principal
Área = 12450.000 m² = 1.245 ha; perímetro = 450.023 m.
