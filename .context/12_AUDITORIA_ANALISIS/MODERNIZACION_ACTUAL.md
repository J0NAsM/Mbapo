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

- Terminar las escrituras PostgreSQL por agregado para reservas, pagos demo, retiros y moderación administrativa; mensajes, reseñas y altas de verificación ya no escriben el snapshot.
- Ampliar la integración PostgreSQL para cubrir los nuevos comandos de reseña y verificación; CI ya levanta PostgreSQL 16 y localmente la prueba se omite sin `MBAPO_TEST_DATABASE_URL`.
- Terminar la conversión de componentes React y los contratos de dominio a TypeScript.
- Reemplazar los componentes visuales legacy que siguen en `src/main.jsx` después de validar la interfaz nueva.

## Archivos principales modificados

`server.js`, `src/main.jsx`, `src/lib/api.ts`, `database/migrations/002_account_status_notifications_idempotency.sql`, `database/migrations/003_stripe_webhook_events.sql`, `test/api.test.js`, `test/postgres.integration.test.js`.

Siguiente paso: extraer la transacción de reservas y pagos demo, conservando disponibilidad, solapamientos, saldo, auditoría y avisos. Los avisos internos ya tienen centro de lectura y eventos de reservas, pagos demo, mensajes, reseñas y verificaciones.

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

Se retiraron los componentes de demostración inactivos de mensajes, modal y calendario. La navegación de agenda renderiza directamente `BookingAgenda`, que opera reservas reales y acciones de pago demo.

`src/components/BookingAgenda.tsx` migra a TypeScript la agenda, las transiciones de reserva, autorización/liberación demo y el formulario de reseña. Las acciones permanecen sujetas a las validaciones de estado del servidor.

`server/persistence/accounts.js` habilita búsqueda paginada de cuentas por nombre, correo, rol o estado. El panel administrativo consume `/api/admin/users` con búsqueda remota y paginación, y la integración PostgreSQL cubre ese contrato.

`POST /api/auth/refresh` renueva una sesión vigente sin ampliar sus permisos. La revocación mediante `tokenVersion` invalida a la vez tokens antiguos y renovados tras logout, bloqueo o cambio de rol.

`src/lib/api.ts` renueva proactivamente el token cercano a expirar, coordina solicitudes concurrentes y actualiza la sesión de la pestaña. Una sesión expirada o revocada no se prolonga automáticamente.

`Dockerfile` incluye el directorio `server/` junto a `server.js`, por lo que los módulos extraídos están disponibles en runtime. La prueba PWA verifica ese empaquetado y el service worker usa una nueva versión de caché.

CI ejecuta `docker build --tag mbapo:ci .` después del build frontend. Docker no está disponible en la estación local actual, por lo que la ejecución de contenedor queda delegada a CI y staging.

La mensajería conserva en móvil el selector de conversaciones como carril horizontal desplazable; ya no se oculta la lista de hilos. Una prueba estática evita que esa regresión vuelva a introducirse.

`src/components/Identity.tsx` concentra Avatar y Stars con contratos TypeScript estrictos y valores seguros para identidad incompleta; `main.jsx` reutiliza este componente compartido.

La escritura de mensajes en PostgreSQL ya evita `savePostgres`: mensaje, notificación interna, auditoría e idempotencia se guardan por entidad. El bloqueo transaccional de la tabla asigna IDs enteros sin colisión durante la transición del esquema. La prueba de integración valida que una repetición con la misma `Idempotency-Key` no duplica el mensaje.

Las nuevas solicitudes de verificación usan también una transacción PostgreSQL por entidad: evita solicitudes pendientes duplicadas y persiste los avisos de moderación sin llamar a `savePostgres`. La resolución administrativa seguirá siendo parte del siguiente agregado, porque actualiza simultáneamente solicitud, cuenta y perfil profesional.

La creación de reseñas en PostgreSQL valida y bloquea la reserva finalizada, evita duplicados por reserva y actualiza de forma atómica la reseña, reputación del profesional, auditoría, evento de producto y notificación. El modo JSON conserva el flujo previo compatible.

`src/components/Wallet.tsx` extrae la billetera de `main.jsx` con contratos tipados para saldo, escrow y movimientos, preservando el flujo de retiro demo.

`server/domain/availability.js` concentra el cálculo de franjas, disponibilidad semanal y solapamientos de reservas. Sus pruebas unitarias cubren límites de horario y días sin disponibilidad; la API conserva estas mismas reglas.

La creación de reservas en PostgreSQL se ejecuta ahora por transacción: verifica profesional, disponibilidad y solapamientos con bloqueo de tabla; guarda reserva, aviso, auditoría, analítica e idempotencia sin `savePostgres`.

La integración PostgreSQL repite una reserva con la misma `Idempotency-Key` y exige la cabecera `Idempotency-Replayed`, para detectar duplicación accidental en este comando.
