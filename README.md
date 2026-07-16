# El Fogón de Lu

Sistema interno de ventas: caja, ventas del día, gastos y cuentas por cobrar de empresas.

- **App:** Next.js 16 + React 19 + TypeScript + Tailwind v3
- **Base de datos:** Supabase, proyecto **`isco-soda`** (team Isco Labs), `kyrzevbfbcwxofuvfqfg`
- **Local:** `npm run dev` → http://localhost:3005

## Usuarios

| Usuario | Acceso |
|---|---|
| `admin` | Todo |
| `cobrador` | Todo menos ventas mensuales y empresas |

Las contraseñas no se escriben aquí: este archivo va a control de versiones y la base
es de producción. Se fijan y se rotan en Supabase → Authentication → Users, y se
entregan al cliente por un canal aparte (gestor de contraseñas, no chat ni correo).

Las dos contraseñas iniciales del desarrollo estuvieron escritas en claro en este
README, así que hay que darlas por quemadas: **rótelas antes de exponer la app a
internet**, aunque el repositorio nunca se haya publicado.

Estas dos contraseñas son todo el perímetro: los usuarios son adivinables (`admin`,
`cobrador`), el endpoint de login de Supabase es público, y no hay MFA. Que sean
largas y aleatorias no es cosmético — es el candado.

## Cómo cuenta la plata

Tres reglas que definen todos los números del sistema:

1. **Un consumo a crédito no es una venta.** Cuando un empleado de El Cedral o Jivis come fiado, solo sube su saldo. El ingreso se reconoce el día que paga: ese abono entra como venta de ese día. Por eso el panel muestra el consumo a crédito como una cifra aparte, rotulada "no es venta".
2. **Solo el efectivo mueve la caja.** El arqueo es `fondo de apertura + ventas en efectivo − gastos en efectivo`. Un abono pagado por Sinpe o tarjeta es venta del día, pero no entra a la gaveta.
3. **El día operativo lo manda la caja, no el reloj.** Una venta registrada a las 00:15 en una caja abierta la noche anterior pertenece al día anterior. La base lo estampa sola; el cliente no puede alterarlo.

Sin caja abierta no se registra nada: ni ventas, ni gastos, ni consumos.

## Por qué el cobrador no ve las ventas del mes

No alcanza con esconder la pantalla: el cobrador podría abrir la consola del navegador y sumar la tabla `sales` a mano. El bloqueo real está en RLS — **solo alcanza filas del día operativo en curso o de la caja abierta**. Las del mes pasado no existen para su sesión, y RLS filtra antes de agregar.

Encima hay tres capas más: el guard en `src/proxy.ts`, el `requireAdmin()` del server component, y `get_month_summary()` que lanza `42501`. Esas tres son comodidad; la que importa es RLS.

**Fuga aceptada:** el cobrador ve el estado de cuenta histórico de cada empleado, porque lo necesita para cobrar. Podría sumar los abonos por empleado. Las ventas de mostrador quedan invisibles, que es lo que se quería proteger.

## Seguridad de la base

- Cero políticas de `INSERT`/`UPDATE`/`DELETE`: `authenticated` tiene esos permisos revocados en todas las tablas. Toda escritura pasa por RPC `security definer` (`src/lib/rpc.ts` es la única superficie).
- La app solo usa la *anon key*. No hay service role en el código de Next.
- Un usuario nuevo nace **cobrador e inactivo**. Aunque el signup quedara abierto en Auth, nadie se registra solo y entra: `is_staff()` exige `active`. Para habilitar a alguien, después de crearlo en el dashboard:
  ```sql
  update public.profiles set active = true, role = 'admin' where username = 'nuevo';
  ```
- Conviene igualmente desactivar *Enable signup* en Authentication → Sign In / Providers.

## Retención

`pg_cron` corre `purge_old_records()` el día 1 de cada mes. Antes de borrar lo que pasa de un año:

- consolida los totales del mes en `monthly_rollups`, para que las comparaciones sobrevivan;
- **pliega el saldo histórico de cada empleado en `opening_balance`** — sin este paso, purgar borraría deudas vivas.

Las claves foráneas son `on delete restrict` a propósito: una cascada desde `cash_sessions` podría evaporar ingresos en silencio.

## Estructura

```
src/
  proxy.ts                    guard de sesion y de rutas de admin (en Next 16 no es middleware.ts)
  lib/
    rpc.ts                    unica superficie de escritura
    auth.ts                   requireProfile / requireAdmin (server-only)
    username.ts               usuario -> correo sintetico (client-safe)
    supabase/{client,server,middleware}.ts
  app/
    login/
    (app)/                    todo lo privado, con Nav
      page.tsx                panel del dia, en vivo por Realtime
      caja/                   apertura, movimientos, cierre con arqueo
      gastos/                 registro + acumulado semanal y mensual
      creditos/               empresas, saldos, consumo y cobro
      empresas/               alta de empresas y empleados (admin)
      reportes/dia/           dia (cobrador: solo hoy)
      reportes/mes/           mes (admin)
supabase/migrations/
  0001_init.sql               esquema, RLS, RPC, purgado
  0002_bajas_y_borrado.sql    bajas con deuda viva + borrado de fichas sin historial
```
