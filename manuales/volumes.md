# Manual del módulo Volúmenes

## Objetivo
Calcular volúmenes de corte/relleno por áreas medias y revisar diagrama de masas.

## Datos del ejemplo precargado
Secciones cada 20 m con áreas de corte y relleno.

## Cálculo paso a paso
1. Para cada tramo, calcular L = distancia_i - distancia_{i-1}.
2. Volumen de corte = ((Ac1 + Ac2)/2) * L.
3. Volumen de relleno = ((Ar1 + Ar2)/2) * L.
4. Balance acumulado = ΣVcorte - ΣVrelleno; se grafica como diagrama de masas.

## Resultado principal
Volumen corte total = 760.000 m³; volumen relleno total = 370.000 m³; balance = 390.000 m³.
