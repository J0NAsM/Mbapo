# API de Mbapo

Base local: `http://localhost:3001/api`.

Las rutas protegidas requieren `Authorization: Bearer <token>`. Los errores usan `{ "error": "mensaje" }`. No asumir que los datos mostrados por el cliente sustituyen las validaciones del servidor.

| Método                  | Ruta                                                          | Acceso           | Acción                                                                                                  |
| ----------------------- | ------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------- |
| `GET`                   | `/health`                                                     | público          | Estado de la API                                                                                        |
| `POST`                  | `/auth/register`                                              | público          | Crea cuenta cliente y sesión                                                                            |
| `POST`                  | `/auth/login`                                                 | público          | Inicia sesión                                                                                           |
| `GET`                   | `/professionals`                                              | público          | Catálogo, con filtros `q`, `maxPrice`, `maxDistance`, `minRating`, `verified`, `available`              |
| `GET`                   | `/professionals/:professionalId/availability?date=YYYY-MM-DD` | público          | Franjas de dos horas disponibles, calculadas con agenda, disponibilidad semanal y reservas activas      |
| `GET`                   | `/dashboard`                                                  | sesión           | Vista permitida de la cuenta actual; nunca incluye hashes, usuarios, auditoría ni verificaciones ajenas |
| `PATCH`                 | `/profile`                                                    | sesión           | Actualiza habilidad, tarifa o nombre; no cambia permisos                                                |
| `POST`                  | `/favorites/:professionalId`                                  | sesión           | Alterna favorito propio                                                                                 |
| `POST`                  | `/jobs`                                                       | sesión           | Publica un trabajo                                                                                      |
| `POST`                  | `/jobs/:jobId/applications`                                   | profesional      | Postula una sola vez a un trabajo abierto y ajeno                                                       |
| `POST`                  | `/professional/onboarding`                                    | cliente          | Crea el perfil profesional, zonas, servicios y disponibilidad; entrega una sesión renovada              |
| `GET`                   | `/professional/profile`                                       | profesional      | Perfil profesional vinculado a la cuenta                                                                |
| `PUT`                   | `/professional/availability`                                  | profesional      | Reemplaza las franjas semanales de disponibilidad propias                                               |
| `POST`                  | `/bookings`                                                   | cliente          | Solicita reserva futura en horario disponible                                                           |
| `PATCH`                 | `/bookings/:bookingId/status`                                 | cliente dueño    | Cancela o confirma finalización según la transición permitida                                           |
| `POST`                  | `/payments/intents`                                           | cliente dueño    | Autoriza pago demo o crea intención de Stripe luego de confirmación profesional                         |
| `POST`                  | `/payments/:bookingId/release`                                | cliente dueño    | Libera pago demo o captura pago Stripe autorizado tras finalizar el trabajo                             |
| `POST`                  | `/webhooks/stripe`                                            | Stripe           | Webhook firmado; no llamarlo desde el cliente                                                           |
| `GET`, `POST`           | `/messages/:professionalId` y `/messages`                     | sesión           | Conversación propia con un profesional                                                                  |
| `POST`                  | `/withdrawals`                                                | sesión           | Solicitud demo; en producción exige proveedor de payouts                                                |
| `GET`, `POST`           | `/professionals/:professionalId/reviews`                      | público / sesión | Lee o deja una reseña de una reserva propia finalizada                                                  |
| `GET`, `POST`           | `/verifications`                                              | sesión           | Consulta o solicita verificaciones propias                                                              |
| `GET`                   | `/admin/state`, `/admin/audit`                                | admin            | Estado administrativo y auditoría                                                                       |
| `PUT`                   | `/admin/platform`                                             | admin            | Configuración de plataforma                                                                             |
| `POST`, `PUT`, `DELETE` | `/admin/professionals`, `/admin/jobs`                         | admin            | Gestión y archivado lógico                                                                              |
| `PATCH`                 | `/admin/users/:id`                                            | admin            | Cambia rol/verificación; el cambio de rol invalida sesión                                               |
| `PATCH`                 | `/admin/bookings/:id/status`                                  | admin            | Registra transiciones operativas de reserva                                                             |
| `GET`, `PATCH`          | `/admin/verifications`                                        | admin            | Lista y resuelve solicitudes de verificación                                                            |

## Analítica y referidos

- `GET /api/referrals` devuelve el código propio y el estado de su atribución.
- `POST /api/events` acepta solamente eventos mínimos de producto autorizados: búsqueda, visualización de profesional, compartición de referido y búsqueda guardada.
- `GET /api/admin/metrics` requiere administrador y devuelve el embudo agregado de los últimos 30 días.
- `GET`, `POST`, `DELETE /api/saved-searches` permite guardar hasta diez búsquedas propias; las alertas externas siguen requiriendo un canal de notificaciones con consentimiento.

## Operación profesional

- `PATCH /api/admin/professionals/:id/owner` asigna o retira la cuenta dueña de un perfil; la cuenta debe tener rol `professional` y solo puede poseer un perfil.
- `GET /api/professional/dashboard` expone exclusivamente el perfil vinculado, sus reservas, conversaciones y postulaciones.
- `PATCH /api/professional/bookings/:bookingId/status` permite confirmar, iniciar y solicitar confirmación de una reserva propia con transiciones controladas.
- `POST /api/professional/messages` permite responder únicamente a clientes con una reserva o conversación propia.

Las operaciones de estado pueden devolver `409` si otra escritura actualizó los datos primero. El cliente debe recargar el recurso y pedir confirmación al usuario antes de reintentar.

Consultá [`docs/database.md`](database.md) y [`docs/security.md`](security.md) antes de desplegar.

## Contratos recientes

El catálogo `GET /api/professionals` admite `page`, `limit`, `sort` (`rating`, `price`, `distance`, `name`) y `direction`; devuelve los metadatos en `X-Total-Count`, `X-Page` y `X-Page-Size`. La SPA consume estos contratos para filtros, ordenamiento y paginación.

Los webhooks de Stripe guardan cada `event.id` por 30 dÃ­as: una reentrega firmada responde `replayed: true` y no vuelve a ejecutar efectos. Las notificaciones internas cubren cambios de reserva, autorizaciones y liberaciones demo, mensajes, reseÃ±as y revisiones; email y push continÃºan desacoplados y sin configurar.

- `POST /api/auth/logout` revoca la sesión actual mediante `tokenVersion`.
- `POST /api/auth/refresh` requiere una sesión vigente y devuelve un token con nueva expiración; logout, bloqueo o cambio de rol invalidan los tokens por `tokenVersion`.
- En PostgreSQL, `PATCH /api/profile`, favoritos y búsquedas guardadas actualizan solo el perfil de la cuenta; la creación de una búsqueda registra su evento en la misma transacción. `POST /api/events` inserta el evento permitido directamente en `growth_events`.
- `POST /api/professional/onboarding` crea un perfil profesional con servicios, zonas y disponibilidad, y devuelve un token renovado.
- `GET /api/professional/profile` y `PUT /api/professional/availability` son exclusivos del perfil profesional vinculado.
- `GET|POST /api/verifications` opera solicitudes propias; `GET|PATCH /api/admin/verifications` las lista y resuelve.
- `GET /api/conversations` y `PATCH /api/messages/:id/read` exponen únicamente hilos y mensajes propios.
- `GET /api/notifications` y `PATCH /api/notifications/:id/read` preparan notificaciones internas; ningún canal externo se activa desde la API.
- `GET /api/metrics` requiere administrador y entrega métricas técnicas agregadas.
- Reservas, pagos, mensajes y retiros aceptan `Idempotency-Key`. La misma clave, método y ruta para una cuenta repite la respuesta durante 24 horas con `Idempotency-Replayed: true`.
