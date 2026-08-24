# Puesta en producción de Mbapo

No habilitar registros públicos, pagos ni documentos de identidad hasta completar cada punto aplicable.

## Infraestructura y datos

1. Usar PostgreSQL administrado con `DATABASE_SSL=true`, red privada, credenciales rotadas, backups verificados y plan de recuperación.
2. Configurar `MBAPO_AUTH_SECRET` aleatorio y único en un gestor de secretos. No usar valores demo ni archivos `.env` en el repositorio.
3. Ejecutar migraciones en staging primero, medir duración y definir rollback.
4. Configurar HTTPS, dominio, HSTS, logs estructurados, monitoreo, alertas y límite de peticiones en el borde.
5. Revisar dependencias continuamente y mantener CI en verde.

## Cuentas, permisos y confianza

6. Eliminar cuentas demo, definir recuperación de cuenta, verificación de email/teléfono y política de rotación/revocación de sesión.
7. Contratar un proveedor KYC aprobado para el país. No almacenar selfies o documentos en el servidor sin cifrado, acceso mínimo, retención y auditoría.
8. Hacer revisión independiente de autorización por recurso, roles, pruebas de intrusión y modelado de amenazas.
9. Implementar moderación, reportes, bloqueo de cuentas, soporte y trazabilidad operativa.

## Dinero y reservas

10. Integrar Stripe Connect o una pasarela/payout local regulada para cobros a profesionales.
11. Usar webhooks firmados, idempotencia, conciliación, reintentos, reembolsos y disputas. Nunca aceptar el estado de pago desde el navegador.
12. Definir legal y operativamente cancelaciones, devoluciones, retenciones, impuestos, facturación y atención de disputas.
13. Restringir transiciones de reservas al actor correcto y registrar cada cambio auditablemente.

## Privacidad y producto

14. Pedir consentimiento para ubicación, almacenar precisión mínima y ocultar direcciones hasta una reserva aceptada.
15. Publicar términos, privacidad, cookies, política de disputas, retención y contacto de soporte conforme a la legislación local.
16. Realizar pruebas de integración, carga, accesibilidad (WCAG), responsive, offline y restauración de backups.
17. Configurar correo/SMS/push con límites de frecuencia, plantillas verificadas y mecanismos de baja cuando correspondan.
