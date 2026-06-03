# Manual del módulo GNSS / GPS

## Objetivo
Registrar puntos geográficos y calcular altura ortométrica aproximada.

## Datos del ejemplo precargado
Puntos con latitud, longitud, altura elipsoidal h y ondulación geoidal N.

## Cálculo paso a paso
1. Verificar datum y zona de trabajo.
2. Ingresar latitud y longitud en grados decimales.
3. Calcular altura ortométrica: H = h - N.
4. Para G-1: H = 125.6 - 31.2 = 94.400 m.

## Resultado principal
G-1 tiene altura ortométrica aproximada 94.400 m.

## Observaciones
La transformación a UTM precisa requiere definir datum, zona y modelo geoidal autorizado.
