# Mbapo
Marketplace de servicios locales para conectar clientes y profesionales. Incluye catálogo, trabajos, reservas, mensajería, reputación, verificación, administración, PWA y un flujo de pagos preparado para Stripe.

> Estado: prototipo funcional. No está autorizado para procesar dinero, identidad o datos personales reales hasta completar los controles de producción.

## Inicio rápido

Requiere Node.js 22 o superior.

```bash
npm install
npm run api
```

En otra terminal:

```bash
npm run dev
```

Vite se sirve normalmente en `http://localhost:5173`; la API se sirve en `http://localhost:3001` y se conecta mediante proxy.

## PostgreSQL

La API usa `data/mbapo.json` únicamente como respaldo de desarrollo si no existe `DATABASE_URL`. Para trabajar con la base SQL:

```bash
cp .env.example .env
# Definí POSTGRES_PASSWORD y MBAPO_AUTH_SECRET con valores locales propios.
docker compose up -d postgres
npm run api
```

El esquema versionable está en [`database/schema.sql`](database/schema.sql). PostgreSQL crea tablas de cuentas, perfiles, profesionales, trabajos, reservas, mensajes, transacciones, reseñas, verificaciones y auditoría. La explicación operativa está en [docs/database.md](docs/database.md).

## Calidad

```bash
npm run lint
npm test
npm run build
npm run format:check
```

GitHub Actions ejecuta lint, pruebas y build para cada push y pull request.

## Seguridad y producción

- En producción, `MBAPO_AUTH_SECRET`, `DATABASE_URL` y `DATABASE_SSL=true` son obligatorios.
- Las credenciales de demostración solo se crean fuera de producción. Definí `MBAPO_DEMO_USER_PASSWORD` y `MBAPO_DEMO_ADMIN_PASSWORD` si las necesitás localmente; eliminá esas cuentas antes de exponer el servicio.
- Los retiros son simulados fuera de producción. Pagos reales requieren Stripe, webhooks firmados, idempotencia y un proveedor de payouts.
- La ubicación debe ser aproximada hasta una reserva aceptada. No cargar documentos de KYC en esta aplicación sin un proveedor y controles aprobados.

Leé [docs/security.md](docs/security.md), la [lista de producción](docs/production-checklist.md) y la [referencia de API](docs/api.md) antes de desplegar.

Los borradores de [términos](/legal/terms.html) y [privacidad](/legal/privacy.html) deben ser validados por asesoría jurídica local antes de un lanzamiento comercial.
