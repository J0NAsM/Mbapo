# Matriz rápida de rutas

| Grupo          | Rutas principales                                 | Control                      |
| -------------- | ------------------------------------------------- | ---------------------------- |
| Sesión         | `POST /api/auth/register`, `POST /api/auth/login` | validación y límite de login |
| Cuenta         | `GET /api/dashboard`, `PATCH /api/profile`        | token y recurso propio       |
| Mercado        | `POST /api/jobs`, `POST /api/bookings`            | rol de cliente               |
| Profesional    | `/api/professional/*`                             | rol y perfil vinculado       |
| Pagos          | `/api/payments/*`, `/api/withdrawals`             | reserva y saldo propios      |
| Administración | `/api/admin/*`                                    | rol admin                    |

Para todos los payloads y códigos de respuesta, usar `docs/api.md`.
