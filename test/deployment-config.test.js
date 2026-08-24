import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("la configuracion de contenedores exige secretos y conserva los puertos locales", async () => {
  const [compose, dockerfile, environment, dockerignore] = await Promise.all([
    readFile(resolve(root, "compose.yaml"), "utf8"),
    readFile(resolve(root, "Dockerfile"), "utf8"),
    readFile(resolve(root, ".env.example"), "utf8"),
    readFile(resolve(root, ".dockerignore"), "utf8"),
  ]);

  assert.match(compose, /POSTGRES_PASSWORD_is_required/);
  assert.match(compose, /MBAPO_AUTH_SECRET_is_required/);
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432/);
  assert.match(compose, /APP_BIND_ADDRESS:-127\.0\.0\.1/);
  assert.doesNotMatch(compose, /mbapo_(?:local|compose)_only/);

  assert.match(dockerfile, /process\.env\.PORT \|\| 3001/);
  assert.match(dockerfile, /\/api\/health/);
  assert.match(dockerfile, /USER node/);

  assert.match(environment, /^MBAPO_AUTH_SECRET=$/m);
  assert.match(environment, /^POSTGRES_PASSWORD=$/m);
  assert.match(environment, /^APP_BIND_ADDRESS=127\.0\.0\.1$/m);
  assert.match(dockerignore, /^\*\.pem$/m);
  assert.match(dockerignore, /^\.envrc$/m);
});
