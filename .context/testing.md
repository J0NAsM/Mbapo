# Testing — Mbapo

[Comandos declarados](ejecucion.md). La presencia de pruebas no acredita una ejecución reciente.

Separar unitarias de integración/E2E. Estas últimas requieren una DB de prueba expresamente identificada, migraciones controladas y datos de fixture; no reutilizar una DB compartida por defecto.

## Suites localizadas
- [test/api.test.js](<../test/api.test.js>)
- [test/availability.test.js](<../test/availability.test.js>)
- [test/deployment-config.test.js](<../test/deployment-config.test.js>)
- [test/frontend-components.test.js](<../test/frontend-components.test.js>)

Registrar comando, fecha, revisión y resultado real; consultar proyecto.json y el informe del cambio.
