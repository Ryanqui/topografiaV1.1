# Manual del módulo Nivelación cerrada

## Objetivo
Comprobar el cierre altimétrico y corregir cotas por distancia o estaciones.

## Datos del ejemplo precargado
Parte de BM-1 con cota 100.000 m y cierra nuevamente en BM-1 con cota conocida 100.000 m. Tolerancia: 0.012 m.

## Cálculo paso a paso
1. Resolver la libreta como nivelación compuesta. Cota final calculada = 99.475 m.
2. Error de cierre = cota final calculada - cota conocida = 99.475 - 100.000 = -0.525 m.
3. Si se corrige por distancia, cada corrección se calcula como C_i = -e * distancia acumulada / distancia total.
4. Como |e| = 0.525 m y la tolerancia es 0.012 m, el semáforo queda rojo.
5. La última cota corregida debe coincidir con la cota final conocida.

## Resultado principal
Error de cierre = -0.525 m; distancia total = 135.000 m.
