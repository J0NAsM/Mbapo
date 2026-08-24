# Mapa rápido

## Arranque local

```bash
npm install
npm run api
# En otra terminal
npm run dev
```

- SPA: `http://localhost:5173`
- API: `http://localhost:3001`
- Salud: `GET /api/health`

## Archivos que importan

| Archivo               | Responsabilidad                                            |
| --------------------- | ---------------------------------------------------------- |
| `src/main.jsx`        | SPA React, sesión, flujos de cliente, admin y cola offline |
| `src/styles.css`      | diseño responsive                                          |
| `server.js`           | API, autorización y reglas de negocio                      |
| `data/mbapo.json`     | estado demo local                                          |
| `database/schema.sql` | esquema PostgreSQL transitorio                             |
| `test/api.test.js`    | pruebas de API y flujo demo de pagos                       |

## Antes de tocar algo sensible

1. Leé [[04_DOMINIO/RESERVAS_Y_PAGOS]].
2. Confirmá el contrato en `docs/api.md`.
3. Añadí pruebas de éxito, rechazo y aislamiento de datos.
4. Ejecutá [[09_CALIDAD_OPERACION/VERIFICACION]].
