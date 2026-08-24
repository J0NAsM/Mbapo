# ADR-001 · Estado completo transitorio

**Decisión:** mantener temporalmente el adaptador que carga y guarda el estado completo tanto en JSON como PostgreSQL.

**Motivo:** permite un prototipo único con la misma semilla y contratos en ambos drivers.

**Consecuencia:** PostgreSQL todavía no aprovecha el diseño relacional para escrituras. Los conflictos `409` aumentarán con la concurrencia. No ampliar esta estrategia para una operación pública; planificar persistencia por agregado.
