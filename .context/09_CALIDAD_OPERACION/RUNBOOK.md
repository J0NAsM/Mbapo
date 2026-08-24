# Runbook local

## Variables de entorno

Copiar `.env.example` a `.env` y definir secretos locales propios. Nunca confirmar el archivo.

| Variable                                      | Uso                                        |
| --------------------------------------------- | ------------------------------------------ |
| `MBAPO_AUTH_SECRET`                           | firma de sesión; obligatoria en producción |
| `DATABASE_URL`                                | activa PostgreSQL                          |
| `DATABASE_SSL=true`                           | obligatoria en producción                  |
| `PAYMENTS_MODE=demo`                          | pagos simulados, solo desarrollo           |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | integración Stripe opcional                |

## Diagnóstico

- API no inicia: revisar Node 22+, variables de producción y que el puerto no esté ocupado.
- Salud 503: validar conexión y TLS de PostgreSQL.
- Respuesta 409 al guardar con PostgreSQL: recargar y reintentar; es control optimista del snapshot.
- No iniciar pago real: confirmar Stripe configurado y reserva profesional confirmada.
