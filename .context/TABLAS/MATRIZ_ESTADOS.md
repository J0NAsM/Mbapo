# Matriz de estados de reserva

| Desde                     | Actor       | Hacia                     | Condición                              |
| ------------------------- | ----------- | ------------------------- | -------------------------------------- |
| Esperando respuesta       | profesional | Profesional confirmado    | perfil profesional vinculado           |
| Esperando respuesta       | profesional | Cancelada                 | pago aún no autorizado                 |
| Profesional confirmado    | profesional | Trabajo en curso          | pago autorizado o demo autorizado      |
| Trabajo en curso          | profesional | Esperando tu confirmación | pago autorizado o demo autorizado      |
| Esperando tu confirmación | cliente     | Finalizado                | pago autorizado o demo autorizado      |
| Finalizado                | cliente     | Completada                | liberar pago demo o capturar pago real |

Fuente de verdad: `server.js`; explicación: [[04_DOMINIO/RESERVAS_Y_PAGOS]].
