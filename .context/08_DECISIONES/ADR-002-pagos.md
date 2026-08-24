# ADR-002 · Pagos demo explícitos

**Decisión:** admitir autorización y liberación simuladas solo cuando `NODE_ENV` no es producción y `PAYMENTS_MODE=demo`.

**Motivo:** el flujo puede probarse de punta a punta sin mover dinero.

**Consecuencia:** la UI y auditoría distinguen pagos demo. Producción exige secretos, PostgreSQL, TLS y Stripe; además hace falta idempotencia de webhooks, conciliación, reembolsos, disputas y un proveedor regulado de payouts.
