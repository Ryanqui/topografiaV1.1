# Manual del módulo Perfiles

## Objetivo
Construir perfil longitudinal tipo guitarra, comparar terreno y rasante, e identificar corte/relleno.

## Datos del ejemplo precargado
Progresivas 0 a 100 m con cotas de terreno y rasante.

## Cálculo paso a paso
1. Graficar terreno y rasante sobre la misma retícula.
2. Para cada progresiva: corte = terreno - rasante si el terreno está arriba.
3. Relleno = rasante - terreno si la rasante está arriba.
4. La banda inferior tipo guitarra muestra progresiva, terreno, rasante, corte y relleno.

## Resultado principal
En prog. 40 m: corte = 2.000 m y relleno = 0.000 m. En prog. 100 m: relleno = 1.800 m.
