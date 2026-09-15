# Seguridad y variables

Mantener pagos reales deshabilitados hasta autorización y validación explícitas. La presencia de Stripe no acredita producción.

Los archivos .env reales se conservan fuera del contexto y deben estar ignorados por Git. Los ejemplos no prueban que una variable sea obligatoria; se mantiene NO DETERMINADO hasta revisar su validación en código.

| NOMBRE_VARIABLE | PROPÓSITO | EJEMPLO_SEGURO | REQUERIDA | FUENTES |
|---|---|---|---|---|
| APP_BIND_ADDRESS | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| APP_PORT | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| LOG_LEVEL | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| MBAPO_AUTH_SECRET | Configuración específica; consultar el consumidor y las fuentes indicadas | REEMPLAZAR_LOCALMENTE | NO DETERMINADO; verificar modo de ejecución | .env.example |
| PAYMENTS_MODE | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| PORT | Puerto de escucha | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| POSTGRES_DB | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| POSTGRES_PASSWORD | Configuración específica; consultar el consumidor y las fuentes indicadas | REEMPLAZAR_LOCALMENTE | NO DETERMINADO; verificar modo de ejecución | .env.example |
| POSTGRES_PORT | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| POSTGRES_USER | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |
| TRUST_PROXY | Configuración específica; consultar el consumidor y las fuentes indicadas | NO DETERMINADO | NO DETERMINADO; verificar modo de ejecución | .env.example |

No ejecutar proveedores, pagos, mensajería ni migraciones reales durante una validación documental.
