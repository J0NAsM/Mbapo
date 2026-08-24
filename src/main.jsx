import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiFetch, sessionTokenKey } from "./lib/api";
import { Messages } from "./components/Messages";
import { BookingAgenda } from "./components/BookingAgenda";
import { Avatar } from "./components/Identity";
import { Wallet } from "./components/Wallet";
import { ProfessionalHome } from "./components/ProfessionalHome";
import AdminPanel from "./components/AdminPanel";
import BookingFlow from "./components/BookingFlow";
import Discover from "./components/Discover";
import Jobs from "./components/Jobs";
import Profile from "./components/Profile";
import ProfessionalOnboarding from "./components/ProfessionalOnboarding";
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
            professional={selectedProfessional || professionals[0]}
          />
        ) : modal === "onboarding" ? (
          <ProfessionalOnboarding
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

createRoot(document.getElementById("root")).render(<App />);
