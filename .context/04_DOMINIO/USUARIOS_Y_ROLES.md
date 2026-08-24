# Usuarios, roles y permisos

## Roles del servidor

| Rol            | Puede                                                                           |
| -------------- | ------------------------------------------------------------------------------- |
| `client`       | publicar necesidades, reservar, enviar mensajes, reseñar, liberar pagos propios |
| `professional` | postularse, operar sus reservas vinculadas y responder conversaciones propias   |
| `admin`        | gestionar usuarios, contenido, perfiles y métricas                              |

Una cuenta profesional debe estar vinculada por administración a un perfil de `professionals.ownerId`; sin ese vínculo no puede operar reservas profesionales.

Una cuenta cliente puede iniciar `POST /api/professional/onboarding`. El flujo crea y vincula un perfil con servicio, precio, zonas y agenda, convierte la cuenta en `professional`, rota su sesión y devuelve un token nuevo.

## Invariantes

- Nadie ve datos de otra cuenta salvo la información pública del catálogo.
- Cliente y profesional solo acceden a la conversación de su relación.
- Una cuenta no se postula a su propio trabajo ni dos veces al mismo trabajo.
- El token tiene expiración de 24 h y `tokenVersion` permite revocarlo al cambiar el rol.
