# Persistencia

## JSON local

Sin `DATABASE_URL`, el estado vive en `data/mbapo.json` (o `MBAPO_DATA_PATH`). Se escribe a un temporal y luego se renombra. Es útil para demo y pruebas, pero no resuelve escrituras concurrentes.

## PostgreSQL

Con `DATABASE_URL`, `database/schema.sql` se aplica al arrancar. Las entidades tienen claves relacionales e índices básicos, pero varios atributos todavía se guardan como JSONB.

Los agregados ya extraídos usan transacciones por entidad: reservas y pagos demo, billetera, mensajes, reseñas, verificaciones, moderación de cuentas, onboarding/disponibilidad y configuración. El CRUD administrativo de `professionals` y `jobs` bloquea solo la fila o tabla necesaria para asignar IDs, conserva el archivado lógico y escribe la auditoría del archivado en la misma transacción. La ruta JSON mantiene el fallback compatible.

El adaptador por snapshot y su versión optimista de `application_state_version` sobreviven solamente para flujos que aún no fueron extraídos. No se usa `TRUNCATE` global.

## Próximo rediseño

Migrar las escrituras que siguen en el adaptador de snapshot a operaciones por agregado y mantener migraciones versionadas; no volver a introducir guardados globales en comandos ya extraídos.
