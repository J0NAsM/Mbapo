# Módulo frontend

`src/main.jsx` orquesta la SPA React y `src/styles.css` su diseño. Los flujos visuales se extraen progresivamente a `src/components/`. La aplicación consume la API con `apiFetch`, que adjunta el token de sesión cuando existe.

## Responsabilidades

- Sesión de usuario en `sessionStorage`.
- Exploración, filtros, favoritos, solicitudes, reservas y mensajes.
- Panel de administración con su propio token de administrador.
- Cola offline en `localStorage` bajo `mbapo-offline-outbox`.
- Registro de eventos de producto permitidos por `POST /api/events`.
- Onboarding autoservicio, espacio profesional y solicitudes de verificación conectados a la API real.
- `ProfessionalOnboarding.tsx` concentra el alta profesional y envía servicio, precio, zonas, etiquetas y franjas al contrato real `POST /api/professional/onboarding`; `PUT /api/professional/availability` conserva el contrato para la futura edición de agenda ya autenticada.

## Cuidado al cambiarlo

- No usar el rol mostrado en pantalla como autorización; es solo presentación.
- La cola offline no tiene claves de idempotencia: reservarla para acciones seguras hasta rediseñarla.
- Los componentes legacy retenidos temporalmente en `main.jsx` no deben recibir cambios funcionales: modificar el componente extraído y retirar el respaldo tras validación visual.
