# Base de datos PostgreSQL

Mbapo usa PostgreSQL 16 como fuente de verdad cuando `DATABASE_URL` está configurada. El esquema está en [`database/schema.sql`](../database/schema.sql) y se aplica de dos maneras:

- Al crear un volumen nuevo con `docker compose up -d postgres`, PostgreSQL lo ejecuta automáticamente.
- Al iniciar la API con `DATABASE_URL`, `server.js` comprueba y aplica el esquema para que el despliegue no dependa de un paso manual.

## Inicio local

```bash
cp .env.example .env
# Reemplazá POSTGRES_PASSWORD y MBAPO_AUTH_SECRET por valores propios.
docker compose up -d postgres
npm run api
```

La primera ejecución crea datos de demostración solo fuera de producción. En una base anterior que usaba `mbapo_state`, la API importa ese estado una vez a las tablas nuevas.

## Modelo

Las migraciones se ejecutan al inicio en orden lexicogrÃ¡fico y quedan registradas en `schema_migrations`. Las migraciones adicionales viven en [`database/migrations`](../database/migrations); `003_stripe_webhook_events.sql` conserva identificadores de webhooks por 30 dÃ­as para deduplicar reintentos firmados.

Las entidades tienen tablas propias con claves foráneas e índices: `accounts`, `user_profiles`, `professionals`, `jobs`, `bookings`, `messages`, `transactions`, `reviews`, `verifications`, `audit_log` y `growth_events`.

Durante la transición, cada agregado conserva parte de sus atributos en la columna `payload` JSONB. Esto mantiene el contrato de la API mientras se normalizan atributos de búsqueda y reportes de forma incremental. Las claves, relaciones, versiones de estado y campos de seguridad ya son relacionales.

Las escrituras usan una versión optimista de estado: si otra operación guardó primero, la API responde `409` para que el cliente recargue, en vez de sobrescribir datos silenciosamente.

La mensajería ya persiste por entidad: mensaje, aviso interno, auditoría e idempotencia se escriben en sus tablas sin reescribir el estado completo. Las solicitudes de verificación también se guardan junto con sus avisos administrativos, con control transaccional de duplicados pendientes. La publicación de reseñas persiste en una sola transacción la validación de la reserva, la reseña única, la reputación profesional, auditoría, analítica y el aviso. El CRUD administrativo de profesionales y trabajos también bloquea y modifica solo su fila; los archivados guardan la auditoría en la misma transacción. Los demás flujos continúan en transición y conservan el guardado compatible por snapshot hasta extraer cada transacción de dominio de forma atómica.

`growth_events` solo conserva eventos mínimos de producto —por ejemplo, registro, búsqueda, reserva y referido— para medir embudos. No se deben registrar direcciones exactas, texto de conversaciones, documentos, contraseñas ni identificadores publicitarios.

## Producción

- Usar una instancia administrada, cifrada y privada de PostgreSQL; no exponer el puerto 5432 públicamente.
- Configurar `DATABASE_SSL=true`. Solo en una red de desarrollo controlada puede usarse `DATABASE_SSL_REJECT_UNAUTHORIZED=false`.
- Habilitar copias de seguridad verificadas, recuperación ante desastres, monitoreo de conexiones y rotación de credenciales.
- No editar tablas ni JSON directamente: crear una migración versionada, probarla en una copia y documentar el rollback.
