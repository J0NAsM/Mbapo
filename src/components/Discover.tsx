import { useState, type Dispatch, type SetStateAction } from "react";
import { Avatar, Stars, type PersonIdentity } from "./Identity";

type CatalogFilters = {
  available: boolean;
  verified: boolean;
  minRating: number;
  maxPrice: number;
};

type Catalog = {
  page: number;
  pageSize: number;
  total: number;
};

type PlatformContent = {
  heroEyebrow?: string;
  heroTitle?: string;
  heroDescription?: string;
};

type Professional = PersonIdentity & {
  id: number;
  name: string;
  role: string;
  rating: number | string;
  jobs: number;
  price: number;
  distance: string;
  verified: boolean;
  available: boolean;
  tags: string[];
};

type DiscoverProps = {
  visibleProfessionals: Professional[];
  catalog: Catalog | null;
  catalogPage: number;
  setCatalogPage: Dispatch<SetStateAction<number>>;
  catalogSort: string;
  setCatalogSort: Dispatch<SetStateAction<string>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: string;
  setCategory: Dispatch<SetStateAction<string>>;
  saved: number[];
  toggleSave: (id: number) => void | Promise<void>;
  setModal: Dispatch<SetStateAction<string | null>>;
  announce: (message: string) => void;
  location: string;
  requestLocation: () => void;
  platform?: { content?: PlatformContent } | null;
  filters: CatalogFilters;
  setFilters: Dispatch<SetStateAction<CatalogFilters>>;
  trackEvent: (name: string, metadata?: Record<string, unknown>) => void;
  saveSearch: () => void | Promise<void>;
  onBook: (professional: Professional) => void;
};

const categories = [
  { name: "Todos", icon: "✣" },
  { name: "Electricidad", icon: "⚡" },
  { name: "Plomería", icon: "🔧" },
  { name: "Mecánica", icon: "🚗" },
  { name: "Refrigeración", icon: "❄" },
  { name: "Construcción", icon: "🧱" },
  { name: "Limpieza", icon: "✦" },
  { name: "Educación", icon: "▣" },
];

export default function Discover({
  visibleProfessionals,
  catalog,
  catalogPage,
  setCatalogPage,
  catalogSort,
  setCatalogSort,
  query,
  setQuery,
  category,
  setCategory,
  saved,
  toggleSave,
  setModal,
  announce,
  location,
  requestLocation,
  platform,
  filters,
  setFilters,
  trackEvent,
  saveSearch,
  onBook,
}: DiscoverProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <>
      <header className="topbar">
        <button
          className="location"
          onClick={requestLocation}
          title="Usar ubicación aproximada"
        >
          <span>⌖</span>
          <div>
            <small>Tu ubicación</small>
            <b>{location}⌄</b>
          </div>
        </button>
        <div className="header-actions">
          <button className="help">?</button>
          <button className="bell">
            ♧<em />
          </button>
          <button className="publish" onClick={() => setModal("publish")}>
            ＋ Publicar necesidad
          </button>
        </div>
      </header>
      <section className="intent-hero">
        <p className="eyebrow">
          {platform?.content?.heroEyebrow || "SERVICIOS QUE DAN TRANQUILIDAD"}
        </p>
        <h1>{platform?.content?.heroTitle || "¿Qué necesitás hoy?"}</h1>
        <p>
          {platform?.content?.heroDescription ||
            "Contanos con tus palabras y encontrá a la persona indicada."}
        </p>
        <div className="intent-search">
          <span>⌕</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. mi heladera no enfría"
          />
          <button
            onClick={() => {
              if (query.trim())
                trackEvent("catalog.searched", { category: query.trim() });
              announce(
                query
                  ? `Buscando “${query}” cerca tuyo.`
                  : "Escribí una necesidad para comenzar.",
              );
            }}
          >
            Buscar
          </button>
        </div>
        <small>Probá: electricista · mecánico · profesor · diseñadora</small>
      </section>
      <section className="search-row">
        <div className="search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar servicio, profesional o problema"
          />
          <kbd>⌘ K</kbd>
        </div>
        <button
          className="filter"
          onClick={() => setFiltersOpen((value) => !value)}
        >
          ☷ Filtros
        </button>
        <button className="filter" onClick={saveSearch}>
          Guardar búsqueda
        </button>
      </section>
      {filtersOpen && (
        <section className="filter-panel">
          <label>
            <input
              type="checkbox"
              checked={filters.available}
              onChange={(event) =>
                setFilters({ ...filters, available: event.target.checked })
              }
            />{" "}
            Disponible hoy
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.verified}
              onChange={(event) =>
                setFilters({ ...filters, verified: event.target.checked })
              }
            />{" "}
            Identidad verificada
          </label>
          <label>
            Valoración
            <select
              value={filters.minRating}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  minRating: Number(event.target.value),
                })
              }
            >
              <option value="0">Cualquiera</option>
              <option value="4.5">4.5 o más</option>
              <option value="4.8">4.8 o más</option>
            </select>
          </label>
          <label>
            Hasta Gs.
            <input
              type="number"
              value={filters.maxPrice || ""}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  maxPrice: Number(event.target.value) || 0,
                })
              }
              placeholder="Sin límite"
            />
          </label>
          <button
            onClick={() =>
              setFilters({
                available: false,
                verified: false,
                minRating: 0,
                maxPrice: 0,
              })
            }
          >
            Limpiar
          </button>
        </section>
      )}
      <div className="category-row">
        {categories.map((item) => (
          <button
            key={item.name}
            className={category === item.name ? "selected" : ""}
            onClick={() => setCategory(item.name)}
          >
            <i>{item.icon}</i>
            {item.name}
          </button>
        ))}
        <button
          className="all-categories"
          onClick={() =>
            announce(
              "El administrador puede gestionar todas las categorías desde el panel.",
            )
          }
        >
          Ver todas →
        </button>
      </div>
      <section className="section-head">
        <div>
          <h2>Profesionales cerca de vos</h2>
          <p>Seleccionados por su experiencia y reputación.</p>
        </div>
        <label className="catalog-sort">
          Ordenar
          <select
            value={catalogSort}
            onChange={(event) => setCatalogSort(event.target.value)}
          >
            <option value="rating">Mejor valorados</option>
            <option value="price">Menor precio</option>
            <option value="distance">Más cercanos</option>
            <option value="name">Nombre</option>
          </select>
        </label>
      </section>
      <div className="pro-grid">
        {visibleProfessionals.map((professional) => (
          <article className="pro-card" key={professional.id}>
            <div className="card-top">
              <Avatar person={professional} />
              <button
                className={`save ${saved.includes(professional.id) ? "saved" : ""}`}
                aria-label="Guardar profesional"
                onClick={() => toggleSave(professional.id)}
              >
                {saved.includes(professional.id) ? "♥" : "♡"}
              </button>
            </div>
            <div className="pro-title">
              <div>
                <h3>
                  {professional.name}{" "}
                  {professional.verified && <span className="verified">✓</span>}
                </h3>
                <p>{professional.role}</p>
              </div>
              <Stars value={professional.rating} />
            </div>
            <div className="trust-evidence">
              <span>
                ★ {professional.rating} · {professional.jobs} trabajos
              </span>
              <span>
                {professional.verified
                  ? "✓ Identidad verificada"
                  : "○ Verificación pendiente"}
              </span>
              <span className={professional.available ? "available" : ""}>
                {professional.available
                  ? "● Disponible hoy"
                  : "○ Consultar disponibilidad"}
              </span>
            </div>
            <div className="pro-info">
              <span>⌖ A {professional.distance}</span>
              <span>
                Desde Gs. {Number(professional.price).toLocaleString("es-PY")}
              </span>
            </div>
            <div className="card-foot">
              <div>
                <b>{professional.tags[0] || "Servicio profesional"}</b>
                <small>
                  {professional.tags[1] ? ` · ${professional.tags[1]}` : ""}
                </small>
              </div>
              <button
                onClick={() => {
                  trackEvent("professional.viewed", {
                    category: professional.role,
                  });
                  onBook(professional);
                }}
              >
                {professional.available ? "Contratar" : "Ver perfil"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {visibleProfessionals.length === 0 && (
        <div className="empty">
          No encontramos profesionales con esa búsqueda. Probá otra categoría.
        </div>
      )}
      {catalog && catalog.total > catalog.pageSize && (
        <nav className="catalog-pagination" aria-label="Paginación">
          <button
            className="filter"
            disabled={catalogPage <= 1}
            onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}
          >
            Anterior
          </button>
          <span>
            Página {catalog.page} de{" "}
            {Math.ceil(catalog.total / catalog.pageSize)}
          </span>
          <button
            className="filter"
            disabled={catalogPage * catalog.pageSize >= catalog.total}
            onClick={() => setCatalogPage((page) => page + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
      <section className="trust-strip">
        <span className="shield">✓</span>
        <div>
          <b>Tu tranquilidad es nuestra prioridad</b>
          <p>
            Perfiles verificados · Pagos protegidos · Soporte cuando lo
            necesitás
          </p>
        </div>
        <button
          onClick={() =>
            announce("Te contamos cómo protegemos cada contratación.")
          }
        >
          Conocé más →
        </button>
      </section>
    </>
  );
}
