# Grafo de dependencias

```mermaid
flowchart TD
  Main[src/main.jsx] --> API[server.js]
  API --> Auth[HMAC + scrypt]
  API --> Domain[reservas, pagos, mensajes]
  API --> Store[database() / save()]
  Store --> JSON[data/mbapo.json]
  Store --> PG[database/schema.sql]
  API --> Tests[test/api.test.js]
  API --> Docs[docs/api.md]
```

Cambiar una transición de reserva afecta API, pruebas, `docs/api.md`, [[04_DOMINIO/RESERVAS_Y_PAGOS]] y posiblemente la interfaz.
