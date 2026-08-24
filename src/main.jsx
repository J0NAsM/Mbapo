import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiFetch, sessionTokenKey } from "./lib/api";
import { NotificationCenter } from "./components/NotificationCenter";
import { Messages } from "./components/Messages";
import { BookingAgenda } from "./components/BookingAgenda";
import "./styles.css";

if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/service-worker.js").catch(() => {}),
  );

const offlineQueueKey = "mbapo-offline-outbox";
function trackProductEvent(name, metadata = {}) {
  if (!sessionStorage.getItem(sessionTokenKey)) return;
  apiFetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...metadata }),
  }).catch(() => {});
}
function queuedRequests() {
  try {
    return JSON.parse(localStorage.getItem(offlineQueueKey) || "[]");
  } catch {
    return [];
  }
}
function enqueueRequest(url, method, body, idempotencyKey) {
  const next = [
    ...queuedRequests(),
    {
      url,
      method,
      body,
      idempotencyKey: idempotencyKey || `offline-${crypto.randomUUID()}`,
      queuedAt: Date.now(),
    },
  ];
  localStorage.setItem(offlineQueueKey, JSON.stringify(next));
}
async function flushOfflineQueue() {
  const waiting = queuedRequests();
  if (!waiting.length) return 0;
  const pending = [];
  let delivered = 0;
  for (const request of waiting) {
    try {
      const response = await apiFetch(request.url, {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": request.idempotencyKey,
        },
        body: JSON.stringify(request.body),
      });
      if (!response.ok) pending.push(request);
      else delivered += 1;
    } catch {
      pending.push(request);
      break;
    }
  }
  localStorage.setItem(offlineQueueKey, JSON.stringify(pending));
  return delivered;
}

const professionals = [
  {
    id: 1,
    name: "Rocío Benítez",
    initials: "RB",
    color: "#f3b63f",
    role: "Electricista certificada",
    rating: 4.9,
    jobs: 126,
    price: 95000,
    distance: "1.2 km",
    verified: true,
    available: true,
    tags: ["Instalaciones", "Emergencias"],
    text: "Instalaciones seguras, reparaciones y tableros eléctricos.",
  },
  {
    id: 2,
    name: "Mateo Duarte",
    initials: "MD",
    color: "#5d87d7",
    role: "Plomero · Reparaciones",
    rating: 4.8,
    jobs: 89,
    price: 80000,
    distance: "2.8 km",
    verified: true,
    available: true,
    tags: ["Pérdidas", "Baños"],
    text: "Resuelvo filtraciones, griferías y problemas de presión.",
  },
  {
    id: 3,
    name: "Sofía Rojas",
    initials: "SR",
    color: "#db8066",
    role: "Pintora y decoradora",
    rating: 5.0,
    jobs: 64,
    price: 70000,
    distance: "3.1 km",
    verified: true,
    available: false,
    tags: ["Interiores", "Color"],
    text: "Terminaciones cuidadas para renovar tus espacios.",
  },
  {
    id: 4,
    name: "Juan Pablo Acosta",
    initials: "JA",
    color: "#62a783",
    role: "Técnico de aire acondicionado",
    rating: 4.7,
    jobs: 103,
    price: 110000,
    distance: "4.5 km",
    verified: true,
    available: true,
    tags: ["Mantenimiento", "Split"],
    text: "Instalación, limpieza y reparación de climatización.",
  },
];

const jobs = [
  {
    id: 1,
    title: "Instalar 3 ventiladores de techo",
    category: "Electricidad",
    place: "Villa Morra",
    budget: "Gs. 450.000 – 650.000",
    date: "Para esta semana",
    owner: "Camila R.",
    applicants: 6,
    urgent: false,
  },
  {
    id: 2,
    title: "Reparar pérdida debajo de la pileta",
    category: "Plomería",
    place: "Recoleta",
    budget: "Gs. 180.000 – 250.000",
    date: "Hoy · Flexible",
    owner: "Diego M.",
    applicants: 4,
    urgent: true,
  },
  {
    id: 3,
    title: "Pintar living y pasillo",
    category: "Pintura",
    place: "Barrio Jara",
    budget: "Gs. 1.200.000 – 1.700.000",
    date: "Desde el 24 de agosto",
    owner: "Laura F.",
    applicants: 9,
    urgent: false,
  },
];

const clientNav = [
  ["calendar", "#", "Reservas"],
  ["discover", "⌂", "Inicio"],
  ["search", "⌕", "Buscar"],
  ["jobs", "▣", "Trabajos"],
  ["messages", "◌", "Mensajes"],
  ["profile", "◉", "Perfil"],
];
const professionalNav = [
  ["discover", "⌂", "Inicio"],
  ["jobs", "▣", "Solicitudes"],
  ["calendar", "◫", "Agenda"],
  ["messages", "◌", "Mensajes"],
  ["profile", "◉", "Perfil"],
];

function Avatar({ person, size = "" }) {
  return (
    <span className={`avatar ${size}`} style={{ background: person.color }}>
      {person.initials}
    </span>
  );
}
function Stars({ value }) {
  return (
    <span className="stars">
      ★ <b>{value}</b>
    </span>
  );
}

function App() {
  const [view, setView] = useState("discover");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [dashboard, setDashboard] = useState({
    professionals,
    jobs,
    user: { favorites: [], balance: 1485000, escrow: 520000 },
    transactions: [],
    messages: [],
  });
  const [professionalWorkspace, setProfessionalWorkspace] = useState(null);
  const [selectedProfessional, setSelectedProfessional] = useState(
    professionals[0],
  );
  const [saved, setSaved] = useState([]);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(null);
  const [location, setLocation] = useState(() =>
    localStorage.getItem("mbapo-location-consent")
      ? "Ubicación aproximada activada"
      : "Asunción, Paraguay",
  );
  const [adminSession, setAdminSession] = useState(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("mbapo-admin-session") || "null",
      );
    } catch {
      return null;
    }
  });
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem("mbapo-session") || "null");
    } catch {
      return null;
    }
  });
  const role =
    session?.user?.role === "professional" ? "professional" : "client";
  const [filters, setFilters] = useState({
    available: false,
    verified: false,
    minRating: 0,
    maxPrice: 0,
  });
  const [catalog, setCatalog] = useState(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogSort, setCatalogSort] = useState("rating");

  useEffect(() => {
    setCatalogPage(1);
  }, [
    category,
    filters.available,
    filters.maxPrice,
    filters.minRating,
    filters.verified,
    query,
  ]);
  useEffect(() => {
    let current = true;
    const terms = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const aliases =
      terms.includes("heladera") || terms.includes("aire")
        ? "refrigeracion"
        : terms.includes("auto") || terms.includes("mecan")
          ? "mecanica"
          : terms.includes("perdida") || terms.includes("canilla")
            ? "plomeria"
            : terms.includes("luz") || terms.includes("enchufe")
              ? "electricista"
              : terms;
    const categoryTerms = {
      Electricidad: "electric",
      Plomería: "plomer",
      Mecánica: "mecanic",
      Refrigeración: "refriger",
      Construcción: "constru",
      Limpieza: "limp",
      Educación: "profesor",
    };
    const params = new URLSearchParams({
      q: [aliases, categoryTerms[category] || ""].filter(Boolean).join(" "),
      page: String(catalogPage),
      limit: "8",
      sort: catalogSort,
    });
    if (["price", "distance", "name"].includes(catalogSort))
      params.set("direction", "asc");
    if (filters.available) params.set("available", "true");
    if (filters.verified) params.set("verified", "true");
    if (filters.minRating) params.set("minRating", String(filters.minRating));
    if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
    apiFetch(`/api/professionals?${params}`)
      .then(async (response) => {
        if (!response.ok) throw Error();
        const items = await response.json();
        if (current)
          setCatalog({
            items,
            page: Number(response.headers.get("X-Page") || catalogPage),
            pageSize: Number(response.headers.get("X-Page-Size") || 8),
            total: Number(
              response.headers.get("X-Total-Count") || items.length,
            ),
          });
      })
      .catch(() => {
        if (current) setCatalog(null);
      });
    return () => {
      current = false;
    };
  }, [
    catalogPage,
    catalogSort,
    category,
    filters.available,
    filters.maxPrice,
    filters.minRating,
    filters.verified,
    query,
  ]);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await apiFetch("/api/dashboard");
      if (!response.ok) return;
      const data = await response.json();
      setDashboard(data);
      setSaved(data.user?.favorites || []);
      if (session?.user?.role === "professional") {
        const professionalResponse = await apiFetch(
          "/api/professional/dashboard",
        );
        if (professionalResponse.ok)
          setProfessionalWorkspace(await professionalResponse.json());
      } else setProfessionalWorkspace(null);
    } catch {
      /* The visual demo remains usable if the API is offline. */
    }
  }, [session?.user?.role]);
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);
  useEffect(() => {
    const sync = async () => {
      const delivered = await flushOfflineQueue();
      if (delivered) {
        await loadDashboard();
        announce(
          `${delivered} acción${delivered > 1 ? "es" : ""} sin conexión sincronizada${delivered > 1 ? "s" : ""}.`,
        );
      }
    };
    window.addEventListener("online", sync);
    if (navigator.onLine) sync();
    return () => window.removeEventListener("online", sync);
  }, [loadDashboard]);
  const filtered = useMemo(
    () =>
      (dashboard.professionals || professionals).filter((p) => {
        const haystack =
          `${p.name} ${p.role} ${p.tags.join(" ")}`.toLowerCase();
        const requested = query
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const aliases =
          requested.includes("heladera") || requested.includes("aire")
            ? "refrigeracion"
            : requested.includes("auto") || requested.includes("mecan")
              ? "mecanica"
              : requested.includes("perdida") || requested.includes("canilla")
                ? "plomeria"
                : requested.includes("luz") || requested.includes("enchufe")
                  ? "electricista"
                  : requested;
        const categoryWords = {
          Electricidad: "electric",
          Plomería: "plomer",
          Mecánica: "mecanic",
          Refrigeración: "refriger",
          Construcción: "constru",
          Limpieza: "limp",
          Educación: "profesor",
        };
        return (
          haystack
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .includes(aliases) &&
          (category === "Todos" ||
            haystack
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .includes(categoryWords[category] || category.toLowerCase())) &&
          (!filters.available || p.available) &&
          (!filters.verified || p.verified) &&
          p.rating >= filters.minRating &&
          (!filters.maxPrice || p.price <= filters.maxPrice)
        );
      }),
    [dashboard.professionals, query, category, filters],
  );
  const visibleProfessionals = catalog?.items || filtered;

  const announce = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 2800);
  };
  const currentUser = dashboard.user?.id ? dashboard.user : session.user;
  const logout = async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      sessionStorage.removeItem("mbapo-session");
      sessionStorage.removeItem(sessionTokenKey);
      setSession(null);
      setView("discover");
    }
  };
  const initials = (currentUser?.name || "MB")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const shareReferral = async () => {
    const code = currentUser?.referralCode;
    if (!code)
      return announce("Tu código de referido estará disponible pronto.");
    const text = `Usá mi código ${code} al crear tu cuenta en Mbapo.`;
    try {
      if (navigator.share) await navigator.share({ title: "Mbapo", text });
      else await navigator.clipboard.writeText(text);
      trackProductEvent("referral.shared");
      announce("Código de referido listo para compartir.");
    } catch {
      announce("No pudimos compartir el código. Podés copiarlo manualmente.");
    }
  };
  const toggleSave = async (id) => {
    const before = saved;
    setSaved((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
    try {
      const response = await apiFetch(`/api/favorites/${id}`, {
        method: "POST",
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      setSaved(data.favorites);
    } catch {
      setSaved(before);
      announce("No pudimos guardar el favorito. Iniciá sesión nuevamente.");
    }
  };
  const saveSearch = async () => {
    if (!query.trim() && category === "Todos")
      return announce("Elegí una búsqueda o categoría antes de guardar.");
    try {
      const response = await apiFetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, category, filters }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      announce(
        "Búsqueda guardada. Te mostraremos novedades cuando actives alertas.",
      );
    } catch (error) {
      announce(error.message || "No pudimos guardar la búsqueda.");
    }
  };
  const requestLocation = () => {
    if (!navigator.geolocation)
      return announce("Tu navegador no permite ubicación.");
    navigator.geolocation.getCurrentPosition(
      () => {
        localStorage.setItem("mbapo-location-consent", "approximate");
        setLocation("Ubicación aproximada activada");
        announce("Usaremos tu zona aproximada para ordenar resultados.");
      },
      () => announce("No compartiremos ubicación sin tu permiso."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 3600000 },
    );
  };

  if (!session)
    return (
      <UserAccess
        onLogin={(data) => {
          sessionStorage.setItem("mbapo-session", JSON.stringify(data));
          sessionStorage.setItem(sessionTokenKey, data.token);
          setSession(data);
        }}
      />
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir al contenido principal
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">m</span>
          <span>mbapo</span>
        </div>
        <div className="switcher">
          <span className="mini-avatar">{initials}</span>
          <span>
            <small>Estás usando Mbapo como</small>
            <b>{role === "client" ? "Cliente" : "Profesional"}</b>
          </span>
          <button
            aria-label="Ver tipo de cuenta"
            onClick={() => setView("profile")}
          >
            ⌄
          </button>
        </div>
        <nav>
          {[
            ...(role === "client" ? clientNav : professionalNav),
            ...(adminSession ? [["admin", "⚙", "Administrar"]] : []),
          ].map(([id, icon, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              <i>{icon}</i>
              {label}
              {id === "messages" && <em>2</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => announce("Centro de ayuda abierto.")}>
            ? Centro de ayuda
          </button>
          <button onClick={() => setModal("profile")}>⚙ Ajustes</button>
          <div className="user-card">
            <span className="mini-avatar ocean">{initials}</span>
            <span>
              <b>{currentUser?.name || "Tu cuenta"}</b>
              <small>{currentUser?.email || ""}</small>
            </span>
            <button>⋮</button>
          </div>
        </div>
      </aside>
      <main id="main-content" tabIndex="-1">
        {notice && (
          <div className="toast" role="status" aria-live="polite">
            ✓ {notice}
          </div>
        )}
        {view === "discover" && role !== "professional" && (
          <Discover
            visibleProfessionals={visibleProfessionals}
            catalog={catalog}
            catalogPage={catalogPage}
            setCatalogPage={setCatalogPage}
            catalogSort={catalogSort}
            setCatalogSort={setCatalogSort}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            saved={saved}
            toggleSave={toggleSave}
            setModal={setModal}
            announce={announce}
            location={location}
            requestLocation={requestLocation}
            platform={dashboard.platform}
            filters={filters}
            setFilters={setFilters}
            trackEvent={trackProductEvent}
            saveSearch={saveSearch}
            onBook={(professional) => {
              setSelectedProfessional(professional);
              setModal("book");
            }}
          />
        )}
        {view === "discover" && role === "professional" && (
          <ProfessionalHome
            workspace={professionalWorkspace}
            setView={setView}
            announce={announce}
          />
        )}
        {view === "search" && (
          <Discover
            visibleProfessionals={visibleProfessionals}
            catalog={catalog}
            catalogPage={catalogPage}
            setCatalogPage={setCatalogPage}
            catalogSort={catalogSort}
            setCatalogSort={setCatalogSort}
            query={query}
            setQuery={setQuery}
            category={category}
            setCategory={setCategory}
            saved={saved}
            toggleSave={toggleSave}
            setModal={setModal}
            announce={announce}
            location={location}
            requestLocation={requestLocation}
            platform={dashboard.platform}
            filters={filters}
            setFilters={setFilters}
            trackEvent={trackProductEvent}
            saveSearch={saveSearch}
            onBook={(professional) => {
              setSelectedProfessional(professional);
              setModal("book");
            }}
          />
        )}
        {view === "jobs" && (
          <Jobs
            setModal={setModal}
            announce={announce}
            jobs={dashboard.jobs || jobs}
          />
        )}
        {view === "calendar" && (
          <BookingAgenda
            bookings={
              role === "professional"
                ? professionalWorkspace?.bookings || []
                : dashboard.bookings || []
            }
            role={role}
            reload={loadDashboard}
            announce={announce}
          />
        )}
        {view === "messages" && <Messages role={role} />}
        {view === "wallet" && (
          <Wallet
            setModal={setModal}
            user={dashboard.user}
            transactions={dashboard.transactions}
          />
        )}
        {view === "profile" && (
          <Profile
            role={role}
            user={currentUser}
            onReferralShare={shareReferral}
            onWallet={() => setView("wallet")}
            onAdmin={() => setView("admin")}
            onOnboarding={() => setModal("onboarding")}
            onLogout={logout}
          />
        )}
        {view === "admin" &&
          (adminSession ? (
            <AdminPanel
              session={adminSession}
              onLogout={() => {
                sessionStorage.removeItem("mbapo-admin-session");
                setAdminSession(null);
                setView("discover");
              }}
              announce={announce}
            />
          ) : (
            <AdminAccess
              onLogin={(session) => {
                sessionStorage.setItem(
                  "mbapo-admin-session",
                  JSON.stringify(session),
                );
                setAdminSession(session);
              }}
            />
          ))}
      </main>
      <button className="mobile-new" onClick={() => setModal("publish")}>
        ＋
      </button>
      {modal &&
        (modal === "book" ? (
          <BookingFlow
            close={() => setModal(null)}
            announce={announce}
            reload={loadDashboard}
            professional={selectedProfessional}
          />
        ) : modal === "onboarding" ? (
          <OnboardingFlow
            close={() => setModal(null)}
            announce={announce}
            reload={loadDashboard}
            onSession={(data) => {
              sessionStorage.setItem("mbapo-session", JSON.stringify(data));
              sessionStorage.setItem(sessionTokenKey, data.token);
              setSession(data);
              setView("discover");
            }}
          />
        ) : (
          <ModalNew
            kind={modal}
            close={() => setModal(null)}
            announce={announce}
            reload={loadDashboard}
          />
        ))}
    </div>
  );
}

function Discover({
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
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
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
            ♧<em></em>
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
            onChange={(e) => setQuery(e.target.value)}
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
            onChange={(e) => setQuery(e.target.value)}
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
        {categories.map((c) => (
          <button
            key={c.name}
            className={category === c.name ? "selected" : ""}
            onClick={() => setCategory(c.name)}
          >
            <i>{c.icon}</i>
            {c.name}
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
        {visibleProfessionals.map((p) => (
          <article className="pro-card" key={p.id}>
            <div className="card-top">
              <Avatar person={p} />
              <button
                className={`save ${saved.includes(p.id) ? "saved" : ""}`}
                aria-label="Guardar profesional"
                onClick={() => toggleSave(p.id)}
              >
                {saved.includes(p.id) ? "♥" : "♡"}
              </button>
            </div>
            <div className="pro-title">
              <div>
                <h3>
                  {p.name} {p.verified && <span className="verified">✓</span>}
                </h3>
                <p>{p.role}</p>
              </div>
              <Stars value={p.rating} />
            </div>
            <div className="trust-evidence">
              <span>
                ★ {p.rating} · {p.jobs} trabajos
              </span>
              <span>
                {p.verified
                  ? "✓ Identidad verificada"
                  : "◌ Verificación pendiente"}
              </span>
              <span className={p.available ? "available" : ""}>
                {p.available
                  ? "● Disponible hoy"
                  : "○ Consultar disponibilidad"}
              </span>
            </div>
            <div className="pro-info">
              <span>⌖ A {p.distance}</span>
              <span>Desde Gs. {p.price.toLocaleString("es-PY")}</span>
            </div>
            <div className="card-foot">
              <div>
                <b>{p.tags[0] || "Servicio profesional"}</b>
                <small>{p.tags[1] ? ` · ${p.tags[1]}` : ""}</small>
              </div>
              <button
                onClick={() => {
                  trackEvent("professional.viewed", { category: p.role });
                  onBook(p);
                }}
              >
                {p.available ? "Contratar" : "Ver perfil"}
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

function Jobs({ setModal, announce, jobs: jobList }) {
  const [remoteJobs, setRemoteJobs] = useState(null);
  const [jobPage, setJobPage] = useState(1);
  const [jobSort, setJobSort] = useState("recent");
  const [jobCategory, setJobCategory] = useState("");
  useEffect(() => {
    setJobPage(1);
  }, [jobCategory, jobSort]);
  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({
      page: String(jobPage),
      limit: "8",
      sort: jobSort,
    });
    if (jobCategory) params.set("category", jobCategory);
    apiFetch(`/api/jobs?${params}`)
      .then(async (response) => {
        if (!response.ok) throw Error();
        const items = await response.json();
        if (current)
          setRemoteJobs({
            items,
            page: Number(response.headers.get("X-Page") || jobPage),
            pageSize: Number(response.headers.get("X-Page-Size") || 8),
            total: Number(
              response.headers.get("X-Total-Count") || items.length,
            ),
          });
      })
      .catch(() => {
        if (current) setRemoteJobs(null);
      });
    return () => {
      current = false;
    };
  }, [jobCategory, jobPage, jobSort]);
  const displayedJobs = remoteJobs?.items || jobList;
  const categories = [...new Set(jobList.map((job) => job.category))].sort();
  const apply = async (job) => {
    try {
      const response = await apiFetch(`/api/jobs/${job.id}/applications`, {
        method: "POST",
      });
      if (!response.ok) throw Error();
      announce(`Tu postulación para “${job.title}” fue enviada.`);
    } catch {
      announce("No pudimos enviar la postulación. Iniciá sesión nuevamente.");
    }
  };
  return (
    <div className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">OPORTUNIDADES</p>
          <h1>Trabajos cerca tuyo</h1>
          <p>Publicaciones activas de personas que necesitan ayuda.</p>
        </div>
        <button className="publish" onClick={() => setModal("publish")}>
          ＋ Publicar necesidad
        </button>
      </header>
      <div className="job-layout">
        <section className="job-list">
          <div className="job-controls">
            <label>
              CategorÃ­a
              <select
                value={jobCategory}
                onChange={(event) => setJobCategory(event.target.value)}
              >
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordenar
              <select
                value={jobSort}
                onChange={(event) => setJobSort(event.target.value)}
              >
                <option value="recent">MÃ¡s recientes</option>
                <option value="budget">Mayor presupuesto</option>
              </select>
            </label>
          </div>
          {displayedJobs.map((j) => (
            <article className="job-card" key={j.id}>
              <div className="job-meta">
                <span>{j.category}</span>
                {j.urgent && <b>Urgente</b>}
                <small>Publicado hace 2 h</small>
              </div>
              <h3>{j.title}</h3>
              <p>
                ⌖ {j.place} <i>·</i> {j.date}
              </p>
              <div className="job-bottom">
                <span>
                  <b>{j.budget}</b>
                  <small>Presupuesto estimado</small>
                </span>
                <span>{j.applicants} profesionales interesados</span>
                <button onClick={() => apply(j)}>Postularme →</button>
              </div>
            </article>
          ))}
          {!displayedJobs.length && (
            <div className="empty">No hay trabajos con esos filtros.</div>
          )}
          {remoteJobs && remoteJobs.total > remoteJobs.pageSize && (
            <nav
              className="catalog-pagination"
              aria-label="PaginaciÃ³n de trabajos"
            >
              <button
                className="filter"
                disabled={jobPage <= 1}
                onClick={() => setJobPage((page) => Math.max(1, page - 1))}
              >
                Anterior
              </button>
              <span>
                PÃ¡gina {remoteJobs.page} de{" "}
                {Math.ceil(remoteJobs.total / remoteJobs.pageSize)}
              </span>
              <button
                className="filter"
                disabled={jobPage * remoteJobs.pageSize >= remoteJobs.total}
                onClick={() => setJobPage((page) => page + 1)}
              >
                Siguiente
              </button>
            </nav>
          )}
        </section>
        <aside className="side-tip">
          <span>✦</span>
          <h3>¿Sos profesional?</h3>
          <p>
            Completá tu perfil, verificá tu identidad y empezá a recibir
            oportunidades.
          </p>
          <button onClick={() => setModal("profile")}>
            Completar mi perfil
          </button>
        </aside>
      </div>
    </div>
  );
}

function Wallet({ setModal, user, transactions = [] }) {
  const guaranies = (value) =>
    `Gs. ${Number(value || 0).toLocaleString("es-PY")}`;
  return (
    <div className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">PAGOS SEGUROS</p>
          <h1>Tu billetera</h1>
          <p>Administrá pagos y cobros de manera transparente.</p>
        </div>
        <button className="publish" onClick={() => setModal("withdraw")}>
          Retirar fondos
        </button>
      </header>
      <section className="wallet-cards">
        <div className="balance">
          <span>Saldo disponible</span>
          <h2>{guaranies(user?.balance)}</h2>
          <p>Actualizado ahora</p>
          <button onClick={() => setModal("withdraw")}>Retirar dinero →</button>
        </div>
        <div className="escrow">
          <span>◈</span>
          <div>
            <small>EN PAGO PROTEGIDO</small>
            <h3>{guaranies(user?.escrow)}</h3>
            <p>Se libera al confirmar el trabajo.</p>
          </div>
        </div>
      </section>
      <section className="transactions">
        <h2>Movimientos recientes</h2>
        {transactions.map((item, i) => (
          <div className="transaction" key={item.id || i}>
            <span className="trans-icon">
              {i === 0 ? "◈" : i === 1 ? "↓" : "%"}
            </span>
            <div>
              <b>{item.name}</b>
              <p>{item.description}</p>
            </div>
            <span className={item.amount > 0 ? "income" : ""}>
              <b>
                {item.amount > 0 ? "+" : "-"} {guaranies(Math.abs(item.amount))}
              </b>
              <small>{item.status}</small>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function ProfessionalHome({ workspace, setView, announce }) {
  if (!workspace)
    return (
      <section className="content-page">
        <p>Cargando tu espacio profesional...</p>
      </section>
    );
  const {
    professional,
    bookings = [],
    applications = [],
    conversations = [],
  } = workspace;
  const pending = bookings.filter(
    (booking) =>
      booking.status !== "Completada" && booking.status !== "Cancelada",
  );
  return (
    <section className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">ESPACIO PROFESIONAL</p>
          <h1>Hola, {professional.name}</h1>
          <p>Gestiona tus solicitudes, agenda, conversaciones y cobros.</p>
        </div>
        <button className="publish" onClick={() => setView("calendar")}>
          Ver agenda
        </button>
      </header>
      <div className="admin-summary">
        <span>
          <b>{pending.length}</b> reservas activas
        </span>
        <span>
          <b>{applications.length}</b> postulaciones
        </span>
        <span>
          <b>{conversations.length}</b> conversaciones
        </span>
        <span>
          <b>{professional.available ? "Activo" : "Pausado"}</b> estado
        </span>
      </div>
      <section className="admin-section">
        <div>
          <h2>Próximas acciones</h2>
          <p>
            Las acciones de cada reserva se habilitan según su estado y pago.
          </p>
        </div>
        {pending.slice(0, 3).map((booking) => (
          <div className="appointment" key={booking.id}>
            <time>
              {booking.date}
              <br />
              <small>{booking.time}</small>
            </time>
            <div>
              <b>{booking.title}</b>
              <p>{booking.status}</p>
            </div>
            <button onClick={() => setView("calendar")}>Gestionar</button>
          </div>
        ))}
        {!pending.length && (
          <p className="empty">No tenés reservas pendientes.</p>
        )}
      </section>
      <section className="admin-section">
        <div>
          <h2>Perfil y disponibilidad</h2>
          <p>
            {professional.serviceAreas?.join(" · ") ||
              "Definí tus zonas de servicio"}
          </p>
        </div>
        <button className="filter" onClick={() => setView("profile")}>
          Editar perfil
        </button>
        <button
          className="filter"
          onClick={() =>
            announce("Tu disponibilidad se actualiza desde el perfil.")
          }
        >
          Ver horarios
        </button>
      </section>
    </section>
  );
}

function VerificationRequests() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const response = await apiFetch("/api/verifications");
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setRequests(data);
    } catch (requestError) {
      setError(requestError.message || "No pudimos cargar tus verificaciones.");
    }
  };
  useEffect(() => {
    load();
  }, []);
  const request = async (kind) => {
    try {
      const response = await apiFetch("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      await load();
    } catch (requestError) {
      setError(requestError.message || "No pudimos enviar la solicitud.");
    }
  };
  return (
    <article>
      <span>✓</span>
      <div>
        <h3>Verificaciones</h3>
        <p>
          {requests.length
            ? requests.map((item) => `${item.kind}: ${item.status}`).join(" · ")
            : "Solicitá una revisión de identidad o perfil profesional."}
        </p>
        {error && <p className="form-error">{error}</p>}
      </div>
      <div className="role-toggle">
        <button onClick={() => request("identity")}>Identidad</button>
        <button onClick={() => request("professional")}>Profesional</button>
      </div>
    </article>
  );
}

function OnboardingFlow({ close, announce, reload, onSession }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const availability = [1, 2, 3, 4, 5]
      .filter((day) => form.get(`day-${day}`))
      .map((day) => ({
        day,
        start: form.get("start"),
        end: form.get("end"),
      }));
    try {
      const response = await apiFetch("/api/professional/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: form.get("role"),
          price: form.get("price"),
          tags: String(form.get("tags"))
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          serviceAreas: String(form.get("serviceAreas"))
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          text: form.get("text"),
          availability,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      onSession(data);
      await reload();
      close();
      announce("Tu perfil profesional está listo.");
    } catch (submitError) {
      setError(submitError.message || "No pudimos completar el onboarding.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">PERFIL PROFESIONAL</p>
        <h2>Empezá a ofrecer servicios</h2>
        <label>
          Servicio principal
          <input
            name="role"
            required
            placeholder="Ej. Electricista residencial"
          />
        </label>
        <label>
          Precio desde Gs.
          <input
            name="price"
            required
            inputMode="numeric"
            placeholder="95000"
          />
        </label>
        <label>
          Servicios (separados por coma)
          <input name="tags" required placeholder="Instalaciones, Urgencias" />
        </label>
        <label>
          Zonas de servicio (separadas por coma)
          <input
            name="serviceAreas"
            required
            placeholder="Asunción, Recoleta"
          />
        </label>
        <label>
          Presentación
          <textarea
            name="text"
            required
            minLength="20"
            placeholder="Contá tu experiencia y qué servicios realizás."
          />
        </label>
        <fieldset className="filter-panel">
          <legend>Horarios semanales</legend>
          {["Lun", "Mar", "Mié", "Jue", "Vie"].map((label, index) => (
            <label key={label}>
              <input name={`day-${index + 1}`} type="checkbox" defaultChecked />{" "}
              {label}
            </label>
          ))}
          <label>
            Desde <input name="start" type="time" defaultValue="08:00" />
          </label>
          <label>
            Hasta <input name="end" type="time" defaultValue="18:00" />
          </label>
        </fieldset>
        {error && <p className="form-error">{error}</p>}
        <button className="modal-primary" disabled={saving}>
          {saving ? "Guardando..." : "Crear perfil profesional"}
        </button>
      </form>
    </div>
  );
}

function Profile({
  role,
  setRole,
  user,
  onWallet,
  onAdmin,
  onReferralShare,
  onOnboarding,
  onLogout,
}) {
  const initials = (user?.name || "MB")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">TU CUENTA</p>
          <h1>Perfil y preferencias</h1>
          <p>Una misma cuenta para contratar y ofrecer servicios.</p>
          <button className="filter" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <section className="profile-card">
        <span className="profile-avatar">{initials}</span>
        <div>
          <h2>
            {user?.name || "Tu cuenta"}{" "}
            {user?.verified && <span className="verified">✓</span>}
          </h2>
          <p>
            {user?.verified
              ? "Identidad verificada"
              : "Completá la verificación para generar confianza"}
          </p>
          <button className="link-btn">Editar perfil →</button>
        </div>
      </section>
      <section className="profile-options">
        <NotificationCenter />
        <VerificationRequests />
        {role === "client" && (
          <article>
            <span>+</span>
            <div>
              <h3>Ofrecer servicios</h3>
              <p>CreÃ¡ tu perfil profesional, zonas, precios y horarios.</p>
            </div>
            <button className="link-btn" onClick={onOnboarding}>
              Empezar â†’
            </button>
          </article>
        )}
        <article>
          <span>↔</span>
          <div>
            <h3>Tipo de cuenta</h3>
            <p>El servidor define tus permisos y las acciones disponibles.</p>
          </div>
          <div className="role-toggle" hidden>
            <button
              className={role === "client" ? "active" : ""}
              onClick={() => setRole("client")}
            >
              Cliente
            </button>
            <button
              className={role === "professional" ? "active" : ""}
              onClick={() => setRole("professional")}
            >
              Profesional
            </button>
          </div>
        </article>
        <article>
          <span>◈</span>
          <div>
            <h3>Pagos y billetera</h3>
            <p>Consultá tus cobros, pagos protegidos y retiros.</p>
          </div>
          <button className="link-btn" onClick={onWallet}>
            Abrir →
          </button>
        </article>
        <article>
          <span>✦</span>
          <div>
            <h3>Invitá a alguien</h3>
            <p>
              Código: <b>{user?.referralCode || "Sin código"}</b>
            </p>
          </div>
          <button className="link-btn" onClick={onReferralShare}>
            Compartir →
          </button>
        </article>
        <article>
          <span>⚙</span>
          <div>
            <h3>Administración</h3>
            <p>Acceso restringido para gestionar la plataforma.</p>
          </div>
          <button className="link-btn" onClick={onAdmin}>
            Abrir →
          </button>
        </article>
      </section>
    </div>
  );
}

function ModalNew({ kind, close, announce, reload }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const titles = {
    publish: "Contanos qué necesitás",
    book: "Solicitar una reserva",
    profile: "Completá tu perfil",
    withdraw: "Retirar fondos",
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSending(true);
    const form = new FormData(event.currentTarget);
    const [url, method, body] =
      kind === "publish"
        ? [
            "/api/jobs",
            "POST",
            {
              title: form.get("title"),
              category: form.get("category"),
              budget: form.get("budget"),
              details: form.get("details"),
            },
          ]
        : kind === "book"
          ? [
              "/api/bookings",
              "POST",
              {
                professionalId: 1,
                date: form.get("date"),
                time: form.get("time"),
              },
            ]
          : kind === "profile"
            ? [
                "/api/profile",
                "PATCH",
                {
                  skill: form.get("skill"),
                  hourlyRate: form.get("hourlyRate"),
                },
              ]
            : ["/api/withdrawals", "POST", { amount: form.get("amount") }];
    const idempotencyKey = `form-${crypto.randomUUID()}`;
    try {
      const response = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "No se pudo completar la operación");
      await reload();
      close();
      announce(
        kind === "publish"
          ? "Tu necesidad fue publicada correctamente."
          : kind === "withdraw"
            ? "Solicitud de retiro creada."
            : kind === "profile"
              ? "Perfil actualizado."
              : "Reserva creada; el pago está protegido.",
      );
    } catch (err) {
      if (!navigator.onLine || /fetch|network/i.test(err.message || "")) {
        enqueueRequest(url, method, body, idempotencyKey);
        close();
        announce(
          "Guardamos esta acción y se sincronizará al recuperar conexión.",
        );
      } else setError(err.message || "No pudimos completar la operación.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">
          {kind === "book" ? "SERVICIO PROTEGIDO" : "MBAPO"}
        </p>
        <h2>{titles[kind]}</h2>
        {kind === "publish" && (
          <>
            <label>
              ¿Qué trabajo necesitás?
              <input
                name="title"
                required
                placeholder="Ej. Reparar instalación eléctrica"
              />
            </label>
            <label>
              Categoría
              <select name="category">
                <option>Electricidad</option>
                <option>Plomería</option>
                <option>Pintura</option>
                <option>Construcción</option>
              </select>
            </label>
            <label>
              Presupuesto estimado
              <input name="budget" inputMode="numeric" placeholder="Gs. 0" />
            </label>
            <label>
              Detalles
              <textarea
                name="details"
                placeholder="Describí el trabajo, fecha y cualquier información útil."
              />
            </label>
          </>
        )}
        {kind === "book" && (
          <>
            <div className="booking-pro">
              <Avatar person={professionals[0]} />
              <span>
                <b>Rocío Benítez</b>
                <small>Electricista certificada · ★ 4.9</small>
              </span>
            </div>
            <label>
              Elegí una fecha
              <input name="date" required type="date" />
            </label>
            <label>
              Horario
              <select name="time">
                <option>14:00 – 16:00</option>
                <option>16:30 – 18:30</option>
                <option>18:30 – 20:30</option>
              </select>
            </label>
            <div className="payment-note">
              ◈ El pago queda protegido y solo se libera cuando confirmes el
              trabajo.
            </div>
          </>
        )}
        {kind === "profile" && (
          <>
            <label>
              Tu habilidad principal
              <input name="skill" defaultValue="Electricista" />
            </label>
            <label>
              Tarifa por hora
              <input
                name="hourlyRate"
                inputMode="numeric"
                defaultValue="95000"
              />
            </label>
            <div className="verify-note">
              ✓ Verificá tu identidad para acceder a más trabajos y ganar
              confianza.
            </div>
          </>
        )}
        {kind === "withdraw" && (
          <>
            <label>
              Monto a retirar
              <input
                name="amount"
                required
                inputMode="numeric"
                placeholder="Gs. 0"
              />
            </label>
            <label>
              Cuenta de destino
              <select>
                <option>•••• 4482 · Banco Familiar</option>
                <option>Agregar nueva cuenta</option>
              </select>
            </label>
            <p className="modal-muted">
              Las transferencias pueden demorar hasta 24 h hábiles.
            </p>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="modal-primary" disabled={sending} type="submit">
          {sending
            ? "Guardando…"
            : kind === "publish"
              ? "Publicar necesidad"
              : kind === "withdraw"
                ? "Solicitar retiro"
                : kind === "profile"
                  ? "Guardar perfil"
                  : "Continuar al pago protegido →"}
        </button>
      </form>
    </div>
  );
}

function BookingFlow({
  close,
  announce,
  reload,
  professional = professionals[0],
}) {
  const professionalName = professional.name;
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("14:00 – 16:00");
  const [place, setPlace] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => `booking-${crypto.randomUUID()}`);
  const next = (event) => {
    event.preventDefault();
    if (step === 2 && !date) return setError("Elegí una fecha para continuar.");
    if (step === 3 && place.trim().length < 4)
      return setError("Indicá una zona o dirección para el servicio.");
    setError("");
    setStep((value) => Math.min(4, value + 1));
  };
  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const response = await apiFetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          professionalId: professional.id,
          date,
          time,
          place,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      await reload();
      close();
      announce(
        "Solicitud creada. El pago se protege al confirmar el servicio.",
      );
    } catch (err) {
      setError(err.message || "No pudimos crear la solicitud.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="overlay" onMouseDown={close}>
      <form
        className="modal booking-flow"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={step === 4 ? submit : next}
      >
        <button type="button" className="close" onClick={close}>
          ×
        </button>
        <p className="eyebrow">SOLICITAR SERVICIO · {step} DE 4</p>
        <div className="booking-progress">
          <i style={{ width: `${step * 25}%` }} />
        </div>
        {step === 1 && (
          <>
            <h2>¿A quién querés contratar?</h2>
            <div className="booking-pro">
              <Avatar person={professionals[0]} />
              <span>
                <b>{professionalName}</b>
                <small>
                  Electricista certificada · ★ 4.9 · Identidad verificada
                </small>
              </span>
            </div>
            <p className="modal-muted">
              Podrás revisar todos los detalles antes de enviar la solicitud.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <h2>¿Cuándo necesitás el servicio?</h2>
            <label>
              Fecha
              <input
                value={date}
                onChange={(event) => setDate(event.target.value)}
                type="date"
                required
              />
            </label>
            <label>
              Horario
              <select
                value={time}
                onChange={(event) => setTime(event.target.value)}
              >
                <option>08:00 – 10:00</option>
                <option>10:30 – 12:30</option>
                <option>14:00 – 16:00</option>
                <option>16:30 – 18:30</option>
              </select>
            </label>
          </>
        )}
        {step === 3 && (
          <>
            <h2>¿Dónde será el servicio?</h2>
            <label>
              Zona o dirección
              <input
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                placeholder="Ej. Villa Morra, Asunción"
                required
              />
            </label>
            <div className="payment-note">
              ⌖ La ubicación exacta solo se comparte al profesional cuando
              confirmes la reserva.
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h2>Revisá tu solicitud</h2>
            <div className="booking-review">
              <p>
                <b>Profesional</b>
                <span>{professionalName}</span>
              </p>
              <p>
                <b>Cuándo</b>
                <span>
                  {date} · {time}
                </span>
              </p>
              <p>
                <b>Dónde</b>
                <span>{place}</span>
              </p>
              <p>
                <b>Estimado</b>
                <span>Desde Gs. 190.000</span>
              </p>
            </div>
            <div className="payment-note">
              ◈ El pago solo se procesa con un proveedor configurado y se libera
              al finalizar el trabajo.
            </div>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="flow-actions">
          {step > 1 && (
            <button
              type="button"
              className="filter"
              onClick={() => setStep((value) => value - 1)}
            >
              Atrás
            </button>
          )}
          <button className="modal-primary" disabled={sending}>
            {sending
              ? "Enviando…"
              : step === 4
                ? "Solicitar servicio"
                : "Continuar →"}
          </button>
        </div>
      </form>
    </div>
  );
}

function UserAccess({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const body =
      mode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            name: form.get("name"),
            email: form.get("email"),
            password: form.get("password"),
            referralCode: form.get("referralCode"),
          };
    try {
      const response = await fetch(
        `/api/auth/${mode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      onLogin(data);
    } catch (err) {
      setError(err.message || "No pudimos continuar.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="auth-access">
      <form className="modal" onSubmit={submit}>
        <div className="brand auth-brand">
          <span className="brand-mark">m</span>
          <span>mbapo</span>
        </div>
        <p className="eyebrow">SERVICIOS DE CONFIANZA</p>
        <h2>{mode === "login" ? "Bienvenida de nuevo" : "Creá tu cuenta"}</h2>
        <p className="modal-muted">
          {mode === "login"
            ? "Ingresá para contratar o ofrecer servicios."
            : "Una sola cuenta para contratar y trabajar."}
        </p>
        {mode === "register" && (
          <>
            <label>
              Nombre
              <input name="name" required autoComplete="name" />
            </label>
            <label>
              Código de referido <small>(opcional)</small>
              <input name="referralCode" autoComplete="off" maxLength="20" />
            </label>
          </>
        )}
        <label>
          Correo
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={mode === "login" ? "andrea@mbapo.app" : ""}
          />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            required
            minLength="10"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="modal-primary" disabled={loading}>
          {loading
            ? "Un momento…"
            : mode === "login"
              ? "Iniciar sesión"
              : "Crear cuenta"}
        </button>
        <button
          type="button"
          className="auth-link"
          onClick={() => {
            setMode((value) => (value === "login" ? "register" : "login"));
            setError("");
          }}
        >
          {mode === "login"
            ? "¿Todavía no tenés cuenta? Registrate"
            : "¿Ya tenés una cuenta? Iniciá sesión"}
        </button>
      </form>
    </section>
  );
}

function AdminAccess({ onLogin }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (data.user.role !== "admin")
        throw Error("Esta cuenta no tiene permisos de administración.");
      onLogin(data);
    } catch (err) {
      setError(err.message || "No pudimos iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="admin-access">
      <form className="modal" onSubmit={login}>
        <p className="eyebrow">ACCESO RESTRINGIDO</p>
        <h2>Administración de Mbapo</h2>
        <p className="modal-muted">
          Solo las cuentas administradoras pueden modificar datos y
          configuración.
        </p>
        <label>
          Correo
          <input
            name="email"
            type="email"
            required
            placeholder="admin@mbapo.local"
          />
        </label>
        <label>
          Contraseña
          <input name="password" type="password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="modal-primary" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar al panel"}
        </button>
      </form>
    </section>
  );
}

function AdminPanel({ session, onLogout, announce }) {
  const [state, setState] = useState(null);
  const [platformDraft, setPlatformDraft] = useState("");
  const [error, setError] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.token}`,
  };
  const load = async () => {
    try {
      const [response, metricsResponse] = await Promise.all([
        fetch("/api/admin/state", { headers }),
        fetch("/api/admin/metrics", { headers }),
      ]);
      const [data, growthMetrics] = await Promise.all([
        response.json(),
        metricsResponse.json(),
      ]);
      if (!response.ok) throw Error(data.error);
      if (!metricsResponse.ok) throw Error(growthMetrics.error);
      setState({ ...data, growthMetrics });
      setPlatformDraft(JSON.stringify(data.platform, null, 2));
    } catch (err) {
      setError(err.message || "No pudimos cargar la administración.");
    }
  };
  // load is intentionally invoked on mount; mutations call it again after completion.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const request = async (url, method, body) => {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    await load();
    return data;
  };
  const savePlatform = async () => {
    try {
      await request("/api/admin/platform", "PUT", JSON.parse(platformDraft));
      announce("Configuración guardada.");
    } catch (err) {
      setError(err.message || "Configuración inválida.");
    }
  };
  const saveProfessional = async (pro) => {
    try {
      await request(`/api/admin/professionals/${pro.id}`, "PUT", {
        name: pro.name,
        role: pro.role,
        price: pro.price,
        distance: pro.distance,
        available: pro.available,
        tags: pro.tags,
        text: pro.text,
      });
      announce("Profesional actualizado.");
    } catch (err) {
      setError(err.message);
    }
  };
  const assignProfessionalOwner = async (professionalId, accountId) => {
    try {
      await request(
        `/api/admin/professionals/${professionalId}/owner`,
        "PATCH",
        {
          accountId: accountId || null,
        },
      );
      announce("Cuenta profesional vinculada.");
    } catch (err) {
      setError(err.message || "No pudimos vincular la cuenta.");
    }
  };
  const updatePro = (id, field, value) =>
    setState((current) => ({
      ...current,
      professionals: current.professionals.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  const updateJob = (id, field, value) =>
    setState((current) => ({
      ...current,
      jobs: current.jobs.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }));
  const saveJob = async (job) => {
    try {
      await request(`/api/admin/jobs/${job.id}`, "PUT", {
        title: job.title,
        category: job.category,
        budget: job.budget,
        place: job.place,
        date: job.date,
        urgent: job.urgent,
      });
      announce("Trabajo actualizado.");
    } catch (err) {
      setError(err.message);
    }
  };
  const visibleUsers = useMemo(() => {
    const query = accountQuery.trim().toLocaleLowerCase("es-PY");
    if (!query) return state?.users || [];
    return (state?.users || []).filter((user) =>
      `${user.name} ${user.email} ${user.role} ${user.status || "active"}`
        .toLocaleLowerCase("es-PY")
        .includes(query),
    );
  }, [accountQuery, state?.users]);
  if (!state)
    return (
      <section className="admin-page">
        <p>{error || "Cargando panel de administración…"}</p>
      </section>
    );
  return (
    <section className="admin-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">PANEL RESTRINGIDO</p>
          <h1>Administrar Mbapo</h1>
          <p>Los cambios se aplican al sistema de forma inmediata.</p>
        </div>
        <button className="filter" onClick={onLogout}>
          Cerrar sesión
        </button>
      </header>
      {error && <p className="form-error">{error}</p>}
      <div className="admin-summary">
        <span>
          <b>{state.professionals.length}</b> profesionales
        </span>
        <span>
          <b>{state.jobs.length}</b> trabajos
        </span>
        <span>
          <b>{state.users.length}</b> cuentas
        </span>
        <span>
          <b>{state.bookings.length}</b> reservas
        </span>
      </div>
      <section className="admin-section">
        <div>
          <h2>Embudo de crecimiento · últimos 30 días</h2>
          <p>
            Medí liquidez antes de invertir en adquisición o expandir zonas.
          </p>
        </div>
        <div className="admin-summary">
          <span>
            <b>{state.growthMetrics.funnel.registrations}</b> registros
          </span>
          <span>
            <b>{state.growthMetrics.funnel.catalogSearches}</b> búsquedas
          </span>
          <span>
            <b>{state.growthMetrics.funnel.jobsCreated}</b> solicitudes
          </span>
          <span>
            <b>{state.growthMetrics.funnel.bookingsCreated}</b> reservas
          </span>
          <span>
            <b>{state.growthMetrics.funnel.bookingsCompleted}</b> completadas
          </span>
          <span>
            <b>{state.growthMetrics.operations.activeSupply}</b> oferta activa
          </span>
        </div>
        {state.growthMetrics.operations.demandByCategoryZone.length > 0 && (
          <div className="admin-hotspots">
            <b>Demanda a revisar:</b>
            {state.growthMetrics.operations.demandByCategoryZone.map((item) => (
              <span key={`${item.category}-${item.zone}`}>
                {item.category} · {item.zone}: {item.requests} solicitudes
              </span>
            ))}
          </div>
        )}
      </section>
      <section className="admin-section">
        <div>
          <h2>Configuración de la plataforma</h2>
          <p>Comisión, categorías y contenido de portada.</p>
        </div>
        <textarea
          className="admin-json"
          value={platformDraft}
          onChange={(event) => setPlatformDraft(event.target.value)}
        />
        <button className="publish" onClick={savePlatform}>
          Guardar configuración
        </button>
      </section>
      <section className="admin-section">
        <div>
          <h2>Profesionales</h2>
          <p>Editá valores o eliminá perfiles con control administrativo.</p>
        </div>
        {state.professionals.map((pro) => (
          <div className="admin-row" key={pro.id}>
            <input
              value={pro.name}
              onChange={(event) =>
                updatePro(pro.id, "name", event.target.value)
              }
            />
            <input
              value={pro.role}
              onChange={(event) =>
                updatePro(pro.id, "role", event.target.value)
              }
            />
            <input
              type="number"
              value={pro.price}
              onChange={(event) =>
                updatePro(pro.id, "price", Number(event.target.value))
              }
            />
            <select
              value={pro.ownerId || ""}
              aria-label={`Cuenta vinculada a ${pro.name}`}
              onChange={(event) =>
                assignProfessionalOwner(pro.id, event.target.value)
              }
            >
              <option value="">Sin cuenta vinculada</option>
              {state.users
                .filter((user) => user.role === "professional")
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
            </select>
            <button className="filter" onClick={() => saveProfessional(pro)}>
              Guardar
            </button>
            <button
              className="danger"
              onClick={() =>
                request(`/api/admin/professionals/${pro.id}`, "DELETE")
                  .then(() => announce("Perfil eliminado."))
                  .catch((err) => setError(err.message))
              }
            >
              Eliminar
            </button>
          </div>
        ))}
      </section>
      <section className="admin-section">
        <div>
          <h2>Trabajos publicados</h2>
          <p>Administrá la oferta publicada y moderá contenidos.</p>
        </div>
        {state.jobs.map((job) => (
          <div className="admin-row jobs" key={job.id}>
            <input
              value={job.title}
              onChange={(event) =>
                updateJob(job.id, "title", event.target.value)
              }
            />
            <input
              value={job.category}
              onChange={(event) =>
                updateJob(job.id, "category", event.target.value)
              }
            />
            <input
              value={job.budget}
              onChange={(event) =>
                updateJob(job.id, "budget", event.target.value)
              }
            />
            <button className="filter" onClick={() => saveJob(job)}>
              Guardar
            </button>
            <button
              className="danger"
              onClick={() =>
                request(`/api/admin/jobs/${job.id}`, "DELETE")
                  .then(() => announce("Trabajo eliminado."))
                  .catch((err) => setError(err.message))
              }
            >
              Eliminar
            </button>
          </div>
        ))}
      </section>
      <section className="admin-section">
        <div>
          <h2>Cuentas</h2>
          <p>Verificación y rol de acceso.</p>
        </div>
        <label className="admin-search">
          Buscar cuenta
          <input
            value={accountQuery}
            onChange={(event) => setAccountQuery(event.target.value)}
            placeholder="Nombre, correo, rol o estado"
          />
        </label>
        {visibleUsers.map((user) => (
          <div className="admin-row users" key={user.id}>
            <span>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </span>
            <select
              value={user.role}
              onChange={(event) =>
                request(`/api/admin/users/${user.id}`, "PATCH", {
                  role: event.target.value,
                }).catch((err) => setError(err.message))
              }
            >
              <option value="client">Cliente</option>
              <option value="professional">Profesional</option>
              <option value="admin">Administrador</option>
            </select>
            <select
              value={user.status || "active"}
              aria-label={`Estado de ${user.name}`}
              onChange={(event) =>
                request(`/api/admin/users/${user.id}`, "PATCH", {
                  status: event.target.value,
                }).catch((err) => setError(err.message))
              }
            >
              <option value="active">Activa</option>
              <option value="blocked">Bloqueada</option>
            </select>
            <label>
              <input
                type="checkbox"
                checked={user.verified}
                onChange={(event) =>
                  request(`/api/admin/users/${user.id}`, "PATCH", {
                    verified: event.target.checked,
                  }).catch((err) => setError(err.message))
                }
              />{" "}
              Verificada
            </label>
          </div>
        ))}
        {!visibleUsers.length && <p className="empty">Sin coincidencias.</p>}
      </section>
      <section className="admin-section">
        <div>
          <h2>Verificaciones</h2>
          <p>
            Revisá solicitudes pendientes sin almacenar documentos en Mbapo.
          </p>
        </div>
        {(state.verifications || []).map((verification) => (
          <div className="admin-row users" key={verification.id}>
            <span>
              <b>{verification.kind}</b>
              <small>{verification.status}</small>
            </span>
            {verification.status === "pending" && (
              <>
                <button
                  className="filter"
                  onClick={() =>
                    request(
                      `/api/admin/verifications/${verification.id}`,
                      "PATCH",
                      { status: "approved" },
                    )
                      .then(() => announce("Verificación aprobada."))
                      .catch((err) => setError(err.message))
                  }
                >
                  Aprobar
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    request(
                      `/api/admin/verifications/${verification.id}`,
                      "PATCH",
                      { status: "rejected" },
                    )
                      .then(() => announce("Verificación rechazada."))
                      .catch((err) => setError(err.message))
                  }
                >
                  Rechazar
                </button>
              </>
            )}
          </div>
        ))}
        {!(state.verifications || []).length && (
          <p className="empty">No hay solicitudes.</p>
        )}
      </section>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
