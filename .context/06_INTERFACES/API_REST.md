# API REST

La referencia canónica de endpoints, payloads y acceso está en [`docs/api.md`](../../docs/api.md).

## Familias de rutas

- Salud y sesión: `/api/health`, `/api/auth/*`.
- Catálogo y cuenta: `/api/professionals`, `/api/dashboard`, `/api/profile`.
- Mercado: `/api/jobs`, `/api/bookings`, `/api/messages`.
- Confianza y dinero: `/api/*/reviews`, `/api/verifications`, `/api/payments/*`, `/api/withdrawals`.
- Profesional: `/api/professional/*`.
- Administración: `/api/admin/*`.

Las rutas desconocidas bajo `/api` devuelven JSON 404; el comodín de SPA solo aplica fuera de la API.
