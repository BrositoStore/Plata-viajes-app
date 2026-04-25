PLATA + VIAJES - INSTRUCTIVO PASO A PASO

Qué es esto
- Esta carpeta ya tiene una PWA estática lista para subir.
- No necesitás instalar Node, React ni Android Studio para esta primera versión.
- Una vez subida, la podés abrir desde tu celular y agregar a la pantalla de inicio como app.

Archivos importantes
- index.html
- styles.css
- app.js
- manifest.webmanifest
- service-worker.js
- carpeta icons/

PASO A PASO EN LA COMPUTADORA (GitHub Pages)

1) Descargá esta carpeta o el ZIP.
2) Descomprimila en tu computadora.
3) Entrá a GitHub e iniciá sesión.
4) Creá un repositorio nuevo, por ejemplo: plata-viajes-app
   - Podés dejarlo público.
5) Dentro del repo, subí TODOS los archivos de esta carpeta, sin cambiar nombres.
6) Esperá a que termine la subida.
7) En GitHub, andá a:
   Settings > Pages
8) En Source elegí:
   Deploy from a branch
9) En Branch elegí:
   main
   folder: /(root)
10) Guardá.
11) Esperá un minuto aprox. GitHub te va a mostrar la URL publicada.
12) Abrí esa URL en Chrome desde tu celular Android.
13) En Chrome tocá el menú de los 3 puntos.
14) Tocá:
   Agregar a pantalla de inicio
   o Instalar app
15) Listo. Te queda como app en el teléfono.

Cómo usarla
- Todo se guarda en el navegador del dispositivo donde la uses.
- Si usás la app en otro celu o en otra compu, no va a tener los mismos datos salvo que importes backup.
- Usá seguido el botón Backup.

Recomendación importante
- Elegí un solo dispositivo principal para usarla todos los días.
- Hacé backup seguido.
- Guardá varias copias del backup por fecha.

Qué hace esta versión
- Plata:
  - gastos fijos por mes
  - cuotas y deudas
  - movimientos
  - balance de caja mensual
- Viajes:
  - pasajeros
  - pedidos por transferencia
  - pedidos con sobre
  - pedidos en provincia
  - gastos del viaje
  - categorías editables
  - clientes frecuentes
  - deudores permanentes
  - resumen automático del viaje
  - historial de viajes
  - resumen mensual de viajes
- Diferencia entre:
  - ganancia neta contable
  - caja neta real

Límites de esta primera versión
- Guarda datos en localStorage del navegador.
- No sincroniza sola entre dispositivos.
- La edición de registros hoy está hecha con cuadros simples tipo prompt para que sea liviana y fácil de subir.

Siguiente mejora recomendable
- versión con sincronización en la nube y usuarios
- edición visual más cómoda
- agrupación todavía más fina por cliente y por pedido


Versión v4:
- En cada cliente del viaje ya no se elige solo 'Pagado' o 'Debe'.
- Ahora podés cargar directamente un pago parcial inicial en el campo 'Pago parcial / cobrado ahora'.
- El sistema calcula solo cobrado, pendiente y estado.


Versión v6:
- pedidos unificados en una sola sección
- asistente rápido por texto/voz para comandos comunes


Versión v7: reabrir viaje desde historial, registrar pago por cliente, historial visible de pagos por línea, saldar todo en deudores, copia de resumen mensual y carga rápida renombrada.


Versión v11:
- Nuevo mes toma siempre como referencia el último mes cargado inmediato anterior.
- Los gastos fijos se copian con mismo nombre y mismo monto, y quedan pendientes.
- Todo monto menor a 1000 se interpreta como miles: 35 => 35000, 5 => 5000, 14 => 14000.


Versión v12:
- Nuevo mes copia SIEMPRE desde el mes actual inmediato anterior.
- Reparar mes rehace los gastos fijos del mes actual tomando como base el mes anterior.
- Meses bugueados viejos sin movimientos y con gastos fijos raros se corrigen solos al abrirlos.


Versión v14
- tablero Inicio
- auditoría
- cierre mensual
- autosnapshots
- exportar CSV
- duplicar último viaje
- alertas y validaciones
- fichas de cliente más completas
- deudores reforzados
- accesos rápidos y mejoras de uso móvil
