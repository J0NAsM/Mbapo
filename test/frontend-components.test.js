import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("el catálogo activo usa el componente TypeScript con filtros y paginación", async () => {
  const [app, catalog] = await Promise.all([
    readFile(resolve(root, "src/main.jsx"), "utf8"),
    readFile(resolve(root, "src/components/Discover.tsx"), "utf8"),
  ]);
  assert.match(app, /import Discover from "\.\/components\/Discover"/);
  assert.match(catalog, /type DiscoverProps/);
  assert.match(catalog, /catalog-pagination/);
  assert.match(catalog, /Guardar búsqueda/);
  assert.match(catalog, /aria-label="Guardar profesional"/);
});

test("las oportunidades activas usan el componente TypeScript con datos paginados", async () => {
  const [app, jobs] = await Promise.all([
    readFile(resolve(root, "src/main.jsx"), "utf8"),
    readFile(resolve(root, "src/components/Jobs.tsx"), "utf8"),
  ]);
  assert.match(app, /import Jobs from "\.\/components\/Jobs"/);
  assert.match(jobs, /type JobsProps/);
  assert.match(jobs, /\/api\/jobs\?\$\{params\}/);
  assert.match(jobs, /aria-label="Paginación de trabajos"/);
});

test("el perfil activo usa el componente TypeScript y delega flujos protegidos", async () => {
  const [app, profile] = await Promise.all([
    readFile(resolve(root, "src/main.jsx"), "utf8"),
    readFile(resolve(root, "src/components/Profile.tsx"), "utf8"),
  ]);
  assert.match(app, /import Profile from "\.\/components\/Profile"/);
  assert.match(profile, /type ProfileProps/);
  assert.match(profile, /<NotificationCenter \/>/);
  assert.match(profile, /onLogout/);
  assert.doesNotMatch(profile, /setRole/);
});
