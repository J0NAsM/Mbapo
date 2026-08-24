# Contenedores y configuración por entorno

`compose.yaml` sirve exclusivamente para desarrollo local integrado. Construye
la SPA estática, inicia la API y un PostgreSQL 16 local. No es una definición de
producción: en producción la base debe ser administrada, privada y configurada
por el proveedor de despliegue.

## Inicio local

Se requiere Docker Desktop o Docker Engine con Compose v2 y Node.js 22 si se
van a ejecutar las verificaciones del repositorio.

```bash
cp .env.example .env
# Editá .env y definí MBAPO_AUTH_SECRET y POSTGRES_PASSWORD.
docker compose config
docker compose up --build
```

Los dos secretos no tienen valores por defecto. `docker compose` falla de forma
intencional si alguno está vacío. Para una contraseña local compatible con la
URL de conexión que compone el stack, usá caracteres URL seguros; por ejemplo,
un valor hexadecimal largo generado con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.

La aplicación se publica por defecto en `http://127.0.0.1:3001` y PostgreSQL
en `127.0.0.1:5432`. Podés cambiar los puertos del host con `APP_PORT` y
`POSTGRES_PORT`. `APP_BIND_ADDRESS=0.0.0.0` solamente es adecuado para una red
de pruebas controladas; PostgreSQL permanece ligado a localhost.

Validá el arranque con:

```bash
docker compose ps
curl http://127.0.0.1:3001/api/health
```

El endpoint devuelve `ok: true` únicamente cuando la API puede consultar
PostgreSQL. El healthcheck de la imagen usa el mismo endpoint, espera hasta 45
segundos para las migraciones y respeta el valor configurado de `PORT`.

Para detener el entorno conservando datos locales:

```bash
docker compose down
```

`docker compose down -v` elimina el volumen `mbapo_postgres` y, con el, todos
los datos locales. Usalo solo cuando esa eliminación sea deliberada.

## Imagen y staging

La imagen es multietapa, instala dependencias de ejecución con `npm ci --omit=dev`
y se ejecuta como el usuario sin privilegios `node`. CI la construye
en cada cambio. Antes de promover una imagen, ejecutala en staging contra una
base PostgreSQL de staging y verificá `/api/health` después de que finalicen las
migraciones.

El runtime de producción debe recibir variables desde el gestor de secretos del
proveedor, no desde un archivo incluido en la imagen:

```text
NODE_ENV=production
MBAPO_AUTH_SECRET=<secreto aleatorio único>
DATABASE_URL=<URL de PostgreSQL administrado>
DATABASE_SSL=true
DATABASE_SSL_REJECT_UNAUTHORIZED=true
TRUST_PROXY=true
LOG_LEVEL=info
```

No actives `DATABASE_SSL_REJECT_UNAUTHORIZED=false` fuera de una red de
desarrollo controlada. La aplicación rechaza el inicio de producción si faltan
el secreto, la URL de base de datos o TLS. Los pagos demo se desactivan en
producción; Stripe solo se configura cuando las credenciales y webhooks hayan
sido aprobados explícitamente.

## Operación y rollback

Las migraciones se aplican al iniciar y se registran en `schema_migrations`.
Antes de desplegar, probá la imagen y las migraciones en una copia o staging,
tomá un backup verificable y confirmá que la versión anterior sigue siendo
compatible con el esquema resultante. Si falla el healthcheck, detené la
promoción, restaurá el tráfico a la imagen anterior y usá el plan de
recuperación de la base; no borres tablas ni volúmenes para recuperar un
despliegue.
