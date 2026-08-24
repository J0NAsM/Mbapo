# Módulo API

`server.js` integra Express, autenticación, autorización, persistencia y reglas de negocio.

## Reglas de implementación

1. Usar Zod para toda entrada estructurada.
2. Proteger rutas con `requireAuth` o `requireAdmin` y verificar pertenencia al recurso.
3. Reutilizar `req.db` en rutas autenticadas para no cargar otro snapshot.
4. Guardar con `save(req.db)` y auditar cambios sensibles.
5. Documentar rutas en `docs/api.md` y ampliar `test/api.test.js`.

Los estados de dinero solo cambian en el servidor. Ver [[04_DOMINIO/RESERVAS_Y_PAGOS]].
