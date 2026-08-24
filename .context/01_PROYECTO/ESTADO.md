# Estado y límites

## Listo para desarrollo y demo

- `npm run api` y `npm run dev`.
- Driver JSON para pruebas locales; PostgreSQL opcional por `DATABASE_URL`.
- CI ejecuta formato, lint, auditoría de dependencias, pruebas y build.
- Dockerfile multi-etapa y `compose.yaml` para PostgreSQL local.

## No habilitar públicamente todavía

- Pagos/payouts reales, aun si Stripe está configurado.
- Carga de documentos de identidad.
- Registros públicos a escala sin moderación, recuperación de cuenta y observabilidad.
- Operación multiusuario de escritura intensiva con el modelo de estado completo.

La lista completa está en [[12_AUDITORIA_ANALISIS/RIESGOS]].
