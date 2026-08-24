# Verificación

Ejecutar desde la raíz:

```bash
npm run lint
npm test
npm run format:check
npm run build
```

`npm test` comprueba aislamiento, permisos, referidos, búsquedas, operación profesional, mensajería y el ciclo demo completo de pago.

La CI replica estas validaciones e incluye `npm audit --audit-level=high`.
