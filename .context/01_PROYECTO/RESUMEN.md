# Resumen del proyecto

Mbapo es un marketplace de servicios locales para Paraguay. Conecta clientes con profesionales mediante catálogo, solicitudes, reservas, mensajería, reputación, verificación, referidos y pagos protegidos.

## Estado actual

El proyecto es usable como aplicación local y demo operativa: autenticación, roles, administración, persistencia JSON/PostgreSQL y el ciclo demo de reserva están implementados. No es una plataforma autorizada para dinero real, identidad real ni lanzamiento público.

## Alcance implementado

- Registro e inicio de sesión con contraseñas derivadas mediante `scrypt`.
- Catálogo, favoritos, búsquedas guardadas y publicación de necesidades.
- Reservas con transiciones autorizadas por actor.
- Mensajería cliente-profesional con aislamiento por cuenta.
- Reseñas condicionadas a una reserva finalizada.
- Administración de contenido, usuarios y vinculación de perfiles profesionales.
- Pago demo completo: autorizar, ejecutar el servicio, confirmar, liberar y acreditar el cobro simulado.

Ver también [[ESTADO]].
