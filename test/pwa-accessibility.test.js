import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("el manifiesto PWA declara una identidad instalable", async () => {
  const manifest = JSON.parse(
    await readFile(resolve(root, "public/manifest.webmanifest"), "utf8"),
  );
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name);
  assert.ok(manifest.icons?.some((icon) => icon.src && icon.purpose));
});

test("el service worker no cachea solicitudes de API", async () => {
  const worker = await readFile(
    resolve(root, "public/service-worker.js"),
    "utf8",
  );
  assert.match(worker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /caches\.match/);
});

test("la imagen de despliegue incluye los módulos del servidor", async () => {
  const dockerfile = await readFile(resolve(root, "Dockerfile"), "utf8");
  assert.match(dockerfile, /COPY --from=build \/app\/server \.\/server/);
  assert.match(dockerfile, /HEALTHCHECK/);
});

test("la interfaz expone navegación y avisos accesibles", async () => {
  const source = await readFile(resolve(root, "src/main.jsx"), "utf8");
  assert.match(source, /href="#main-content"/);
  assert.match(source, /id="main-content"/);
  assert.match(source, /role="status" aria-live="polite"/);
});

test("la mensajería móvil conserva el selector de conversaciones", async () => {
  const styles = await readFile(resolve(root, "src/styles.css"), "utf8");
  assert.doesNotMatch(styles, /\.threads\s*\{\s*display:\s*none;/);
  assert.match(styles, /\.threads\s*\{[\s\S]*?overflow-x:\s*auto;/);
});

test("la billetera comunica un estado vacío accesible", async () => {
  const source = await readFile(resolve(root, "src/components/Wallet.tsx"), "utf8");
  assert.match(source, /!transactions\.length/);
  assert.match(source, /role="status"/);
});
