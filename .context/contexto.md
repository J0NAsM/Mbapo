# Mbapo — contexto

Fecha de revisión estructural: 2026-09-14. Identificador: mbapo.

## Producto y alcance
Marketplace de demostración.

Tecnología y persistencia: React/Vite, Express; PostgreSQL y persistencia alternativa JSON

Dependencias y servidor: Node, PostgreSQL según modalidad; proveedor de pagos solo si se habilita expresamente.

## Lectura obligatoria
1. [Contexto general de Vaults](<../../Vaults/jmartinez/Ecosistema/contexto.md>) y [reglas generales](<../../Vaults/jmartinez/Ecosistema/reglas.md>).
2. [Reglas particulares](reglas.md) y [ejecución y validación](ejecucion.md).
3. Documentación y decisiones del componente que vaya a cambiar.

## Límites
Mantener pagos reales deshabilitados hasta autorización y validación explícitas. La presencia de Stripe no acredita producción.

## Fuentes técnicas
- [package.json](<../package.json>)

## Documentación conservada
- [README.md](<../README.md>)
- [docs/api.md](<../docs/api.md>)
- [docs/database.md](<../docs/database.md>)
- [docs/docker.md](<../docs/docker.md>)
- [docs/growth-execution.md](<../docs/growth-execution.md>)
- [docs/production-checklist.md](<../docs/production-checklist.md>)
- [docs/security.md](<../docs/security.md>)

## Estado verificable
La metadata está en [proyecto.json](proyecto.json). STATUS y último despliegue permanecen NO DETERMINADO hasta contar con evidencia. Una revisión documental no valida el funcionamiento de la aplicación.
[Seguimiento de correcciones y dependencias externas](<../../Vaults/jmartinez/Ecosistema/seguimiento.md>).

No copiar versiones, estado de Git o resultados históricos como si fueran hechos permanentes. Al cambiar una fuente técnica, revisar el contexto y actualizar su hash solo después de comprobar coherencia.

<!-- BEGIN ECOSYSTEM DETAILS -->
## Documentos por tarea

- [arquitectura.md](<arquitectura.md>)
- [testing.md](<testing.md>)
- [base-datos.md](<base-datos.md>)
- [despliegue.md](<despliegue.md>)
- [seguridad.md](<seguridad.md>)
<!-- END ECOSYSTEM DETAILS -->
