# Reservas y pagos

## Estados de reserva

| Estado actual             | Actor       | Siguientes estados permitidos     |
| ------------------------- | ----------- | --------------------------------- |
| Esperando respuesta       | profesional | Profesional confirmado, Cancelada |
| Profesional confirmado    | profesional | Trabajo en curso, Cancelada       |
| Trabajo en curso          | profesional | Esperando tu confirmación         |
| Esperando tu confirmación | cliente     | Finalizado, Disputa abierta       |
| Finalizado                | cliente     | liberar pago                      |

El cliente puede cancelar antes de que haya un pago autorizado. El profesional no puede iniciar trabajo hasta que el pago esté autorizado.

## Disponibilidad

Un perfil profesional puede definir franjas semanales con día, inicio y fin. La API comprueba que el rango de una solicitud quede dentro de una franja publicada y rechaza cualquier solapamiento con una reserva que todavía ocupa agenda. Los perfiles semilla sin franjas conservan disponibilidad abierta para no romper la demo existente.

## Modo demo

`PAYMENTS_MODE=demo` fuera de producción autoriza sin dinero real. Al liberar:

- la reserva pasa a `Completada` y el pago a `demo_paid`;
- se descuenta el escrow simulado del cliente;
- se acredita al profesional vinculado, descontando la comisión configurada;
- se registran transacciones y auditoría.

No confundir esto con una liquidación real. Stripe real exige intent manual, webhook firmado y un proveedor aprobado de payout. Ver [[08_DECISIONES/ADR-002-pagos]].
