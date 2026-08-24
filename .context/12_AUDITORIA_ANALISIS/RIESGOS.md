# Riesgos y trabajo previo a producción

## Bloqueadores P0

- Persistencia por agregado, migraciones versionadas, backups y recuperación.
- Idempotencia para webhooks y operaciones monetarias.
- Proveedor aprobado de identidad/KYC, pagos y payouts; nunca documentos en este servidor sin controles aprobados.
- Observabilidad, alertas, secretos gestionados, revisión de autorización y pentest externo.
- Validación legal local de términos, privacidad, impuestos, disputas y retención.

## Prioridad P1

- Onboarding autoservicio de profesionales, disponibilidad real y notificaciones.
- Módulos/TypeScript, paginación y pruebas de interfaz, accesibilidad y PostgreSQL en CI.
- Moderación, soporte, bloqueo de cuentas y recuperación de sesión.

El detalle de despliegue está en `docs/production-checklist.md`.
