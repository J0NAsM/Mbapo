# Ejecución y validación

## Requisitos y límites
Node, PostgreSQL según modalidad; proveedor de pagos solo si se habilita expresamente.

Mantener pagos reales deshabilitados hasta autorización y validación explícitas. La presencia de Stripe no acredita producción.

## Comandos declarados
Ejecutar desde el directorio indicado, después de revisar sus efectos. Esta tabla acredita que existe el script, no que haya pasado recientemente.
Los comandos de prueba pueden escribir archivos o datos. Builds móviles requieren SDK/firma y Maven puede ejecutar pruebas de integración.

| Fuente | Directorio relativo a la raíz | Script o propósito | Comando |
|---|---|---|---|
| [package.json](<../package.json>) | . | dev | npm run dev |
| [package.json](<../package.json>) | . | build | npm run build |
| [package.json](<../package.json>) | . | test | npm test |
| [package.json](<../package.json>) | . | lint | npm run lint |
| [package.json](<../package.json>) | . | typecheck | npm run typecheck |
| [package.json](<../package.json>) | . | start | npm run start |

## Configuración y despliegue encontrados
- [compose.yaml](<../compose.yaml>)
- [Dockerfile](<../Dockerfile>)
- [.github/workflows/ci.yml](<../.github/workflows/ci.yml>)

Despliegue efectivo: NO DETERMINADO. No ejecutar Compose, migraciones o arranque contra datos compartidos por inferencia.

## Puertos
Consultar [registro global](<../../Vaults/jmartinez/Infraestructura/Puertos/registro.json>) antes de iniciar varias aplicaciones. Se conservan los puertos actuales; si un proceso ajeno ocupa uno, informar y no detenerlo.

## Cierre de un cambio
Registrar comando, entorno, revisión, fecha y resultado real en proyecto.json o en el informe de validación del cambio. Actualizar documentación afectada y revisar el diff. No confundir la existencia de CI con un resultado aprobado.
