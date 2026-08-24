# Persistencia

## JSON local

Sin `DATABASE_URL`, el estado vive en `data/mbapo.json` (o `MBAPO_DATA_PATH`). Se escribe a un temporal y luego se renombra. Es útil para demo y pruebas, pero no resuelve escrituras concurrentes.

## PostgreSQL

Con `DATABASE_URL`, `database/schema.sql` se aplica al arrancar. Las entidades tienen claves relacionales e índices básicos, pero varios atributos todavía se guardan como JSONB.

Cada escritura usa una transacción, control optimista de `application_state_version`, `TRUNCATE` y reinserción del estado completo. Si otro escritor ganó, se responde `409` (`MBAPO_CONFLICT`).

## Próximo rediseño

Migrar a operaciones por agregado y migraciones versionadas: reservas, pagos, mensajes y perfiles deben guardarse por entidad, con idempotencia para operaciones monetarias.
