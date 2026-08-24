# Modernización actual

## Implementado en esta iteración

- Onboarding autoservicio para profesionales con servicio, precio, etiquetas, zonas y franjas semanales.
- Validación de disponibilidad y detección de reservas solapadas en servidor.
- Espacio profesional, agenda real, reseñas de reservas completadas y solicitudes de verificación en la SPA.
- Resolución administrativa de verificaciones y actualización de identidad/perfil verificado.
- Conversaciones reales, selección de hilo, timestamps ISO y marcas de lectura.
- `Idempotency-Key` para reservas, pagos, mensajes y retiros; respuestas reejecutadas durante 24 horas.
- Logout con revocación de sesión, cuentas bloqueables, request IDs, logs estructurados y métricas técnicas de administrador.
- Migraciones PostgreSQL ordenadas y `UPSERT` por entidad; se eliminó el `TRUNCATE` global.
- Inicio de migración TypeScript mediante `src/lib/api.ts`.

## Pendiente técnico concreto

- Extraer repositorios por agregado para que PostgreSQL no cargue el snapshot completo.
- Cubrir PostgreSQL real en CI con un servicio de base de datos.
- Terminar la conversión de componentes React y los contratos de dominio a TypeScript.
- Reemplazar los componentes visuales legacy que siguen en `src/main.jsx` después de validar la interfaz nueva.

## Archivos principales modificados

`server.js`, `src/main.jsx`, `src/lib/api.ts`, `database/migrations/002_account_status_notifications_idempotency.sql`, `test/api.test.js`.
