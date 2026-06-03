# Manual del módulo Coordenadas y conversiones

## Objetivo
Convertir ángulos y resolver cálculos rápidos de coordenadas.

## Datos del ejemplo precargado
Punto 1: E=1000, N=1000. Punto 2: E=1090, N=1150. Radiación desde E=1000, N=1000, Az=60°, D=80 m.

## Cálculo paso a paso
1. Entre los dos puntos: ΔE=90 m y ΔN=150 m.
2. Distancia = sqrt(ΔE²+ΔN²) = 174.929 m.
3. Azimut = atan2(ΔE, ΔN) = 30.964°.
4. Radiación: E = 1000 + 80 sen60 = 1069.282; N = 1000 + 80 cos60 = 1040.000.
5. Pendiente = ΔH/D *100 = 8/160*100 = 5.000%.

## Resultado principal
Distancia 1-2 = 174.929 m; azimut 1-2 = 30.964°.
