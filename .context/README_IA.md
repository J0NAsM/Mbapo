# Mbapo · contexto para humanos e IA

Este vault explica cómo operar y cambiar Mbapo sin romper sus contratos. Empezá por [[MAPA_RAPIDO]] y, antes de modificar código, consultá [[NIVELES_CONTEXTO]].

## Principios

- La API es la autoridad: el cliente nunca decide permisos, estados ni montos.
- El modo JSON y los pagos demo son solamente para desarrollo local.
- No introducir dinero, KYC ni datos personales reales sin completar los controles de producción.
- Toda modificación de API debe actualizar `docs/api.md`, pruebas y la nota correspondiente del vault.

## Comprobación obligatoria

```bash
npm run lint
npm test
npm run format:check
npm run build
```

## Estructura

- [[01_PROYECTO/RESUMEN|Proyecto]]: alcance y estado.
- [[02_ARQUITECTURA/VISION_GENERAL|Arquitectura]]: límites y flujos.
- [[04_DOMINIO/RESERVAS_Y_PAGOS|Dominio]]: reglas que no se deben romper.
- [[09_CALIDAD_OPERACION/RUNBOOK|Operación]]: puesta en marcha y diagnóstico.
- [[12_AUDITORIA_ANALISIS/RIESGOS|Riesgos]]: lo que aún bloquea producción pública.
