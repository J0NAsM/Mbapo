# Modernización actual

## Implementado en esta iteración

- Onboarding autoservicio para profesionales con servicio, precio, etiquetas, zonas y franjas semanales.
- Validación de disponibilidad y detección de reservas solapadas en servidor.
- Espacio profesional, agenda real, reseñas de reservas completadas y solicitudes de verificación en la SPA.
- Resolución administrativa de verificaciones y actualización de identidad/perfil verificado.
- Conversaciones reales, selección de hilo, timestamps ISO y marcas de lectura.
- `Idempotency-Key` para reservas, pagos, mensajes y retiros; respuestas reejecutadas durante 24 horas.
- Eventos Stripe procesados se registran por `event.id` durante 30 días para ignorar reentregas de webhook.
- Logout con revocación de sesión, cuentas bloqueables, request IDs, logs estructurados y métricas técnicas de administrador.
- Migraciones PostgreSQL ordenadas y `UPSERT` por entidad; se eliminó el `TRUNCATE` global.
- Inicio de migración TypeScript mediante `src/lib/api.ts`.
- `tsc --noEmit`, pruebas de manifiesto/PWA y controles básicos de accesibilidad integrados en CI.
- Healthchecks para PostgreSQL y aplicación; `compose.yaml` puede levantar el stack local completo.
- Catálogo y trabajos admiten paginación y ordenamiento por consulta, manteniendo arreglos como cuerpo de respuesta y metadatos en cabeceras `X-Total-Count`, `X-Page` y `X-Page-Size`.

## Pendiente técnico concreto

- Extraer repositorios por agregado para que PostgreSQL no cargue el snapshot completo.
- CI levanta PostgreSQL 16 y ejecuta una prueba de persistencia real; localmente se omite si no se define `MBAPO_TEST_DATABASE_URL`.
- Terminar la conversión de componentes React y los contratos de dominio a TypeScript.
- Reemplazar los componentes visuales legacy que siguen en `src/main.jsx` después de validar la interfaz nueva.

## Archivos principales modificados

`server.js`, `src/main.jsx`, `src/lib/api.ts`, `database/migrations/002_account_status_notifications_idempotency.sql`, `database/migrations/003_stripe_webhook_events.sql`, `test/api.test.js`, `test/postgres.integration.test.js`.

Siguiente paso: separar repositorios PostgreSQL por agregado y sumar una prueba de integraciÃ³n contra PostgreSQL real en CI. Los avisos internos ya tienen centro de lectura y eventos de reservas, pagos demo, mensajes, reseÃ±as y verificaciones.

ActualizaciÃ³n de modularizaciÃ³n: `server/observability.js` concentra request IDs, logs estructurados y mÃ©tricas; `server/persistence/migrations.js` aplica migraciones en transacciÃ³n. `src/lib/datetime.ts` inicia la extracciÃ³n de utilidades de interfaz tipadas. La prueba PostgreSQL queda habilitada en CI y se omite localmente sin `MBAPO_TEST_DATABASE_URL`.

El descubrimiento consume el catÃ¡logo paginado real con filtros, orden y metadatos HTTP; el filtrado local queda solamente como respaldo cuando la API no responde. `server/persistence/notifications.js` opera la lectura y marcado de avisos directamente por entidad en PostgreSQL.

La vista de trabajos tambiÃ©n consume `GET /api/jobs` con categorÃ­a, orden y paginaciÃ³n reales, conservando el listado del dashboard como respaldo sin conexiÃ³n.

`server/persistence/messages.js` mueve a PostgreSQL por entidad las lecturas de hilos, conversaciones y marcas de lectura. La prueba de integraciÃ³n PostgreSQL cubre ahora reserva, mensaje, hilo, conversación, dashboard y avisos.

`server/persistence/reviews.js` pagina reseñas públicas directamente desde PostgreSQL y valida la existencia del profesional en la misma consulta por agregado.

`server/persistence/verifications.js` entrega solicitudes propias y la cola administrativa paginada desde PostgreSQL; la transición de aprobación continúa protegida por las reglas actuales de cuenta y perfil profesional.

`server/persistence/bookings.js` consulta reservas por cliente o profesional para el dashboard y la agenda profesional, evitando cargar esa colección desde el snapshot cuando PostgreSQL está configurado.

`src/components/NotificationCenter.tsx` es el primer componente visual migrado a TypeScript estricto. `tsconfig.json` habilita `react-jsx`; los contratos de avisos y respuestas de API quedan tipados dentro del componente.

`server/persistence/catalog.js` ejecuta filtros, orden y paginación de profesionales y trabajos sobre PostgreSQL. La integración SQL cubre ambos catálogos además de los flujos autenticados ya existentes.

`src/components/Messages.tsx` migra mensajería a TypeScript con contratos de hilo, interlocutor, mensaje y lectura. `App` ya no conserva estado de conversación ni envío de demostración; la pantalla consulta directamente las conversaciones reales.
