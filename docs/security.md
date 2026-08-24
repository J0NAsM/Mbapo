# Seguridad y límites operativos

La aplicación está preparada para desarrollo y pruebas controladas. Antes de operar con personas, identidad o dinero reales, completar la lista de producción y una auditoría externa.

## Protecciones implementadas

La SPA conserva el token de acceso en `sessionStorage` y lo renueva de forma proactiva durante los últimos cinco minutos de vigencia mediante `POST /api/auth/refresh`. Solo hay una renovación en curso por pestaña; si la sesión fue revocada, el cliente no intenta extenderla y la API responde `401`.

- Contraseñas derivadas con `scrypt`; hashes nunca se devuelven desde el dashboard.
- Tokens firmados, con expiración y versión por cuenta. Un cambio de rol invalida sesiones existentes.
- Autorización en servidor para recursos de cuenta, mensajes, reservas, reseñas y administración.
- Cabeceras de seguridad, límite general de API y límite específico de intentos de inicio de sesión.
- Validación de payloads, transiciones explícitas de reservas y auditoría de eventos sensibles.
- Webhooks de Stripe con verificación de firma; los pagos no se aceptan desde el navegador.

## Reglas obligatorias en producción

La API rechaza el inicio si faltan `MBAPO_AUTH_SECRET`, `DATABASE_URL` o `DATABASE_SSL=true` en producción. Configurá secretos exclusivamente en el gestor de secretos del despliegue.

No hay retiros reales sin un proveedor de payouts integrado. `PAYMENTS_MODE=demo` solo sirve fuera de producción y deja una marca explícita de demostración; no mueve dinero.

Las cuentas y contraseñas de demo deben eliminarse antes de exponer la aplicación. KYC, documentos, privacidad, retención de datos, disputas, soporte y cumplimiento local requieren proveedores y revisión jurídica externos.
