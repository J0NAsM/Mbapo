# Despliegue — Mbapo

Dependencias: Node, PostgreSQL según modalidad; proveedor de pagos solo si se habilita expresamente.

Mantener pagos reales deshabilitados hasta autorización y validación explícitas. La presencia de Stripe no acredita producción.

## Artefactos de configuración encontrados
- [compose.yaml](<../compose.yaml>)
- [Dockerfile](<../Dockerfile>)
- [.github/workflows/ci.yml](<../.github/workflows/ci.yml>)

Esto no acredita despliegue efectivo. Host, dominio administrado, certificado, versión desplegada y rollback probado: NO DETERMINADO. Antes de producción comprobar build, datos persistentes, variables privadas, health checks y restauración. No cambiar identidad de volúmenes o redes sin inventariar los existentes.
