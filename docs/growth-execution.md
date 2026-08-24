# Ejecución de crecimiento de Mbapo

Este documento convierte las recomendaciones de marketing y negocio en una lista ejecutable. Cada iniciativa se marca con su estado real: **hecha**, **en curso**, **pendiente** o **externa**. No se considera implementada una acción que necesita un contrato, presupuesto, proveedor regulado o decisión jurídica.

## Objetivo y reglas de priorización

El objetivo inicial es lograr liquidez en una microzona: que una persona pueda publicar una necesidad, recibir una respuesta adecuada con rapidez, contratar con confianza y repetir. No se expande una categoría o ciudad hasta cumplir sus umbrales.

| Métrica               | Definición                                                             | Meta de salida de una microzona |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------- |
| `match_rate`          | Solicitudes con al menos una propuesta útil / solicitudes publicadas   | >= 70%                          |
| `first_response_time` | Mediana entre solicitud y primera respuesta                            | <= 15 min en horario operativo  |
| `booking_rate`        | Reservas / solicitudes publicadas                                      | >= 30%                          |
| `completion_rate`     | Reservas completadas / reservas confirmadas                            | >= 85%                          |
| `repeat_90d`          | Clientes con otra reserva en 90 días / clientes con reserva completada | >= 25%                          |
| `dispute_rate`        | Disputas / reservas completadas                                        | <= 3%                           |
| `supply_activation`   | Profesionales que responden o cotizan / profesionales verificados      | >= 50%                          |
| `contribution_margin` | Ingreso neto - pasarela - incentivos - soporte - fraude                | Positivo por cohorte            |

Las métricas se segmentan siempre por zona, categoría, canal de adquisición y cohorte; no se toman decisiones con promedios globales.

## Fase 0 — Fundamentos de confianza y operación

| ID    | Iniciativa                                  | Estado    | Entregable / criterio de aceptación                                                |
| ----- | ------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| F0-01 | Aislamiento de datos por cuenta             | Hecha     | Dashboard, mensajes, reservas y transacciones no exponen datos de terceros.        |
| F0-02 | Tokens revocables y permisos por recurso    | Hecha     | El rol y el dueño se validan en servidor; el cambio de rol invalida sesión.        |
| F0-03 | Estados seguros de reserva y pago           | Hecha     | Transiciones limitadas; no se finaliza o libera dinero desde un estado arbitrario. |
| F0-04 | Reseñas verificadas                         | Hecha     | Solo una reseña por reserva propia completada.                                     |
| F0-05 | Archivado lógico                            | Hecha     | Trabajos y profesionales se archivan sin romper el historial.                      |
| F0-06 | Base SQL y auditoría                        | Hecha     | PostgreSQL con entidades, relaciones, índices y registro de eventos sensibles.     |
| F0-07 | KYC, validación de matrícula y antecedentes | Externa   | Elegir proveedor, política de revisión, retención y responsable legal.             |
| F0-08 | Garantía de servicio, seguro y disputas     | Externa   | Definir cobertura, exclusiones, costos, aseguradora y proceso de resolución.       |
| F0-09 | Payouts y facturación reales                | Externa   | Contrato con pasarela/Stripe Connect o proveedor local, conciliación e impuestos.  |
| F0-10 | Soporte operativo                           | Pendiente | SLA, macros, turnos, categorización y escalamiento de incidentes.                  |

## Fase 1 — Liquidez: resolver la primera contratación

| ID    | Iniciativa                            | Estado    | Entregable / criterio de aceptación                                                                             |
| ----- | ------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| F1-01 | Lanzar una microzona y 3 categorías   | Externa   | Elegir zona, categoría y responsable; no abrir nuevas zonas sin metas de liquidez.                              |
| F1-02 | Captación de profesionales fundadores | Externa   | Lista de 100 prospectos, onboarding asistido y perfil completo.                                                 |
| F1-03 | Comisión fundadora temporal           | Pendiente | Configuración de campaña, fecha de vencimiento y análisis de margen.                                            |
| F1-04 | Onboarding profesional guiado         | En curso  | Las cuentas profesionales ya pueden vincularse a un perfil por administración; falta el checklist/autoservicio. |
| F1-05 | Perfil profesional enriquecido        | Pendiente | Fotos, certificaciones, experiencia, cobertura, garantía y disponibilidad.                                      |
| F1-06 | Solicitudes con fotos/video           | Pendiente | Adjuntos privados, antivirus, límites de tamaño y eliminación programada.                                       |
| F1-07 | Cotizaciones comparables              | Pendiente | Alcance, materiales, mano de obra, plazo, garantía y exclusiones.                                               |
| F1-08 | Agenda y slots reales                 | Pendiente | Bloqueos, prevención de doble reserva y zona horaria.                                                           |
| F1-09 | Concierge de match                    | Externa   | Protocolo humano para solicitudes sin respuesta tras el SLA.                                                    |
| F1-10 | Alertas de oferta insuficiente        | En curso  | Eventos y panel para detectar categoría/zona con demanda sin respuesta.                                         |

## Fase 2 — Confianza, conversión y repetición

| ID    | Iniciativa                              | Estado    | Entregable / criterio de aceptación                                                                        |
| ----- | --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| F2-01 | Insignias verificadas                   | Pendiente | Estados y evidencia verificables, con reglas públicas y fecha de renovación.                               |
| F2-02 | Puntaje de confiabilidad                | Pendiente | Puntualidad, finalización, respuesta, reclamos y calidad; explicable para el profesional.                  |
| F2-03 | Ranking de calidad                      | Pendiente | Ranking por relevancia y desempeño; nunca solo por pago o precio.                                          |
| F2-04 | Transparencia de precio                 | Pendiente | Rango, comisión, materiales, recargo de urgencia y política de cancelación antes de reservar.              |
| F2-05 | Garantía y disputa in-app               | Pendiente | Apertura de caso, evidencia, cronología, resolución y comunicación al usuario.                             |
| F2-06 | Recontratación en un toque              | Pendiente | Desde historial y perfil, con confirmación de precio/horario.                                              |
| F2-07 | Favoritos, listas y búsquedas guardadas | En curso  | Favoritos y búsquedas guardadas propios; alertas externas siguen pendientes de proveedor y consentimiento. |
| F2-08 | Recordatorios estacionales              | Pendiente | Campañas opt-in por categoría, barrio e historial; límite de frecuencia.                                   |
| F2-09 | Personalización responsable             | Pendiente | Recomendaciones explicables por zona, necesidad e historial con consentimiento.                            |
| F2-10 | NPS y feedback transaccional            | En curso  | Encuesta posterior al servicio, motivo abierto y flujo de recuperación para detractores.                   |

## Fase 3 — Adquisición y marca

| ID    | Iniciativa                      | Estado    | Entregable / criterio de aceptación                                             |
| ----- | ------------------------------- | --------- | ------------------------------------------------------------------------------- |
| F3-01 | Programa de referidos bilateral | En curso  | Código único, atribución, antiabuso y recompensa solo tras servicio calificado. |
| F3-02 | Landing por zona/categoría      | Pendiente | SEO local, contenido original, CTA, velocidad y medición de conversión.         |
| F3-03 | Guías de precio y educación     | Pendiente | Contenido útil revisado por profesionales, no páginas genéricas de IA.          |
| F3-04 | Google Business Profile y mapas | Externa   | Verificar negocio, gestionar reseñas y publicar zonas reales de cobertura.      |
| F3-05 | Campañas de alta intención      | Externa   | Search/Maps únicamente donde haya supply activo y tracking de CAC por cohorte.  |
| F3-06 | Prueba social                   | Pendiente | Casos reales con consentimiento, reseñas verificadas y antes/después.           |
| F3-07 | Alianzas de distribución        | Externa   | Ferreterías, inmobiliarias, administradores, aseguradoras y desarrolladoras.    |
| F3-08 | Embajadores de barrio           | Externa   | Incentivos, reglas anti-fraude y seguimiento por código/edificio.               |
| F3-09 | Programa B2B                    | Pendiente | Cuenta empresa, aprobaciones, historial, SLA, factura consolidada.              |
| F3-10 | Marca de confianza              | Pendiente | Mensaje, estándares y garantía; evitar promesas que operación no pueda cumplir. |

## Fase 4 — Ciclo de vida y monetización

| ID    | Iniciativa                         | Estado    | Entregable / criterio de aceptación                                                         |
| ----- | ---------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| F4-01 | Eventos de embudo y cohortes       | En curso  | Eventos de adquisición, solicitud, match, reserva, finalización, reseña y referido.         |
| F4-02 | Segmentación CRM                   | Pendiente | Nuevos, activados, alto valor, inactivos, riesgo de abandono y profesionales sin respuesta. |
| F4-03 | Automatizaciones de reactivación   | Pendiente | Email, push, SMS o WhatsApp con consentimiento, frecuencia y control de opt-out.            |
| F4-04 | Prevención de abandono             | Pendiente | Recuperar solicitudes y reservas abandonadas con ayuda, no descuentos automáticos.          |
| F4-05 | Suscripción hogar                  | Pendiente | Beneficio recurrente validado con margen: mantenimiento, prioridad o soporte.               |
| F4-06 | Herramientas para profesionales    | Pendiente | CRM, agenda, cotización, facturación, cartera y analítica; validar disposición a pagar.     |
| F4-07 | Visibilidad patrocinada etiquetada | Pendiente | Inventario limitado, relevancia mínima y señalización clara de publicidad.                  |
| F4-08 | Precios/comisiones por experimento | Pendiente | Hipótesis, segmento, duración, métrica y freno de seguridad antes de cada prueba.           |
| F4-09 | Modelo de margen por cohorte       | Pendiente | GMV, take rate, pasarela, incentivo, soporte, fraude, CAC y margen de contribución.         |
| F4-10 | Expansión disciplinada             | Pendiente | Replicar solo el playbook que alcanzó metas de liquidez y margen.                           |

## Fase 5 — Datos, experimentación y gobierno

| ID    | Iniciativa                   | Estado    | Entregable / criterio de aceptación                                                                         |
| ----- | ---------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| F5-01 | Panel diario de operación    | En curso  | Solicitudes, respuesta, match, reservas, finalización, cancelación, disputa y oferta activa.                |
| F5-02 | Panel semanal de crecimiento | En curso  | CAC, LTV, repeat, NPS, referidos, GMV, take rate y margen por cohorte.                                      |
| F5-03 | Definición única de métricas | Hecha     | Esta sección es el contrato de medición inicial.                                                            |
| F5-04 | Experimentos A/B             | Pendiente | Feature flag, grupo control, tamaño mínimo, criterio de parada y registro de resultados.                    |
| F5-05 | Privacidad analítica         | Pendiente | Minimización, consentimiento, retención, acceso y borrado; no enviar direcciones ni documentos a analítica. |
| F5-06 | Alertas de fraude            | Pendiente | Duplicados, patrones de referidos, reseñas, pagos, cancelaciones y dispositivos.                            |
| F5-07 | Revisión semanal             | Externa   | Reunión de producto, operaciones y crecimiento con decisiones por métrica.                                  |

## Orden de ejecución obligatorio

1. Validar zona/categorías y reclutar oferta activa.
2. Medir el embudo y resolver manualmente solicitudes sin match.
3. Asegurar calidad, respuesta, reserva y postventa.
4. Activar referidos y recontratación solo después de lograr buena experiencia.
5. Invertir en SEO, alianzas y publicidad cuando la oferta soporte la demanda.
6. Optimizar retención y margen antes de expandir ciudad, categorías o gasto publicitario.

## Registro de decisiones

Cada nueva iniciativa debe añadir: hipótesis, segmento, dueño, fecha, costo, evento de medición, métrica objetivo, métrica de protección, resultado y decisión de continuar/iterar/detener.
