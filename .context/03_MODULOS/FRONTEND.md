# Módulo frontend

`src/main.jsx` contiene la SPA React y `src/styles.css` su diseño. La aplicación consume la API con `apiFetch`, que adjunta el token de sesión cuando existe.

## Responsabilidades

- Sesión de usuario en `sessionStorage`.
- Exploración, filtros, favoritos, solicitudes, reservas y mensajes.
- Panel de administración con su propio token de administrador.
- Cola offline en `localStorage` bajo `mbapo-offline-outbox`.
- Registro de eventos de producto permitidos por `POST /api/events`.
- Onboarding autoservicio, espacio profesional y solicitudes de verificación conectados a la API real.

## Cuidado al cambiarlo

- No usar el rol mostrado en pantalla como autorización; es solo presentación.
- La cola offline no tiene claves de idempotencia: reservarla para acciones seguras hasta rediseñarla.
- El archivo es monolítico; al agregar flujos complejos, extraer componentes sin cambiar el contrato público.
