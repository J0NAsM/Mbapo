import { useEffect, useState } from "react";

type AccountRole = "client" | "professional" | "admin";
type AccountStatus = "active" | "blocked";

type AdminSession = { token: string };
type PlatformSettings = {
  commissionRate: number;
  currency: string;
  supportEmail: string;
  categories: string[];
  content: {
    heroEyebrow: string;
    heroTitle: string;
    heroDescription: string;
  };
};
type Professional = {
  id: number;
  name: string;
  role: string;
  price: number;
  distance?: string;
  available?: boolean;
  tags?: string[];
  text?: string;
  ownerId?: string | null;
};
type Job = {
  id: number;
  title: string;
  category: string;
  budget: string;
  place?: string;
  date?: string;
  urgent?: boolean;
};
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  verified: boolean;
  status?: AccountStatus;
};
type Verification = {
  id: number;
  kind: string;
  status: "pending" | "approved" | "rejected";
};
type GrowthMetrics = {
  funnel: {
    registrations: number;
    catalogSearches: number;
    jobsCreated: number;
    bookingsCreated: number;
    bookingsCompleted: number;
  };
  operations: {
    activeSupply: number;
    demandByCategoryZone: Array<{
      category: string;
      zone: string;
      requests: number;
    }>;
  };
};
type AdminState = {
  platform: PlatformSettings;
  professionals: Professional[];
  jobs: Job[];
  users: AdminUser[];
  bookings: Array<{ id: number }>;
  verifications?: Verification[];
  growthMetrics: GrowthMetrics;
};
type AccountPage = {
  items: AdminUser[];
  page: number;
  limit: number;
  total: number;
};

type AdminPanelProps = {
  session: AdminSession;
  onLogout: () => void;
  announce: (message: string) => void;
};

function errorMessage(value: unknown, fallback: string) {
  if (value instanceof Error && value.message) return value.message;
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string"
  )
    return value.error;
  return fallback;
}

export default function AdminPanel({
  session,
  onLogout,
  announce,
}: AdminPanelProps) {
  const [state, setState] = useState<AdminState | null>(null);
  const [platformDraft, setPlatformDraft] = useState("");
  const [error, setError] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [accountPage, setAccountPage] = useState(1);
  const [accountResults, setAccountResults] = useState<AccountPage | null>(
    null,
  );
  const [accountRevision, setAccountRevision] = useState(0);
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
      const [data, growthMetrics] = (await Promise.all([
        response.json(),
        metricsResponse.json(),
      ])) as [unknown, unknown];
      if (!response.ok)
        throw Error(errorMessage(data, "No pudimos cargar la administración."));
      if (!metricsResponse.ok)
        throw Error(
          errorMessage(growthMetrics, "No pudimos cargar las métricas."),
        );
      const nextState = data as Omit<AdminState, "growthMetrics">;
      setState({ ...nextState, growthMetrics: growthMetrics as GrowthMetrics });
      setPlatformDraft(JSON.stringify(nextState.platform, null, 2));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos cargar la administración.",
      );
    }
  };
  // Mutations deliberately reload the administrative state after completion.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setAccountPage(1);
  }, [accountQuery]);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams({
            query: accountQuery,
            page: String(accountPage),
            limit: "15",
          });
          const response = await fetch(`/api/admin/users?${params}`, {
            headers,
          });
          const data: unknown = await response.json();
          if (!response.ok)
            throw Error(errorMessage(data, "No pudimos buscar cuentas."));
          if (current) setAccountResults(data as AccountPage);
        } catch (requestError) {
          if (current)
            setError(
              requestError instanceof Error
                ? requestError.message
                : "No pudimos buscar cuentas.",
            );
        }
      })();
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // The administrative token and revision deliberately control this request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountPage, accountQuery, accountRevision, session.token]);
  const request = async <T,>(url: string, method: string, body?: unknown) => {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await response.json();
    if (!response.ok) throw Error(errorMessage(data, "No pudimos guardar."));
    await load();
    setAccountRevision((current) => current + 1);
    return data as T;
  };
  const savePlatform = async () => {
    try {
      await request<PlatformSettings>(
        "/api/admin/platform",
        "PUT",
        JSON.parse(platformDraft),
      );
      announce("Configuración guardada.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Configuración inválida.",
      );
    }
  };
  const saveProfessional = async (professional: Professional) => {
    try {
      await request<Professional>(
        `/api/admin/professionals/${professional.id}`,
        "PUT",
        {
          name: professional.name,
          role: professional.role,
          price: professional.price,
          distance: professional.distance,
          available: professional.available,
          tags: professional.tags,
          text: professional.text,
        },
      );
      announce("Profesional actualizado.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos actualizar el profesional.",
      );
    }
  };
  const assignProfessionalOwner = async (
    professionalId: number,
    accountId: string,
  ) => {
    try {
      await request<{ id: number; ownerId: string | null }>(
        `/api/admin/professionals/${professionalId}/owner`,
        "PATCH",
        { accountId: accountId || null },
      );
      announce("Cuenta profesional vinculada.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos vincular la cuenta.",
      );
    }
  };
  const updateProfessional = <K extends keyof Professional>(
    id: number,
    field: K,
    value: Professional[K],
  ) =>
    setState((current) =>
      current
        ? {
            ...current,
            professionals: current.professionals.map((item) =>
              item.id === id ? { ...item, [field]: value } : item,
            ),
          }
        : current,
    );
  const updateJob = <K extends keyof Job>(
    id: number,
    field: K,
    value: Job[K],
  ) =>
    setState((current) =>
      current
        ? {
            ...current,
            jobs: current.jobs.map((item) =>
              item.id === id ? { ...item, [field]: value } : item,
            ),
          }
        : current,
    );
  const saveJob = async (job: Job) => {
    try {
      await request<Job>(`/api/admin/jobs/${job.id}`, "PUT", {
        title: job.title,
        category: job.category,
        budget: job.budget,
        place: job.place,
        date: job.date,
        urgent: job.urgent,
      });
      announce("Trabajo actualizado.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos actualizar el trabajo.",
      );
    }
  };
  const visibleUsers = accountResults?.items || state?.users || [];
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
        {state.professionals.map((professional) => (
          <div className="admin-row" key={professional.id}>
            <input
              value={professional.name}
              onChange={(event) =>
                updateProfessional(professional.id, "name", event.target.value)
              }
            />
            <input
              value={professional.role}
              onChange={(event) =>
                updateProfessional(professional.id, "role", event.target.value)
              }
            />
            <input
              type="number"
              value={professional.price}
              onChange={(event) =>
                updateProfessional(
                  professional.id,
                  "price",
                  Number(event.target.value),
                )
              }
            />
            <select
              value={professional.ownerId || ""}
              aria-label={`Cuenta vinculada a ${professional.name}`}
              onChange={(event) =>
                void assignProfessionalOwner(
                  professional.id,
                  event.target.value,
                )
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
            <button
              className="filter"
              onClick={() => void saveProfessional(professional)}
            >
              Guardar
            </button>
            <button
              className="danger"
              onClick={() =>
                void request(
                  `/api/admin/professionals/${professional.id}`,
                  "DELETE",
                )
                  .then(() => announce("Perfil eliminado."))
                  .catch((requestError: unknown) =>
                    setError(
                      errorMessage(requestError, "No pudimos eliminar."),
                    ),
                  )
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
            <button className="filter" onClick={() => void saveJob(job)}>
              Guardar
            </button>
            <button
              className="danger"
              onClick={() =>
                void request(`/api/admin/jobs/${job.id}`, "DELETE")
                  .then(() => announce("Trabajo eliminado."))
                  .catch((requestError: unknown) =>
                    setError(
                      errorMessage(requestError, "No pudimos eliminar."),
                    ),
                  )
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
                void request(`/api/admin/users/${user.id}`, "PATCH", {
                  role: event.target.value,
                }).catch((requestError: unknown) =>
                  setError(
                    errorMessage(requestError, "No pudimos actualizar."),
                  ),
                )
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
                void request(`/api/admin/users/${user.id}`, "PATCH", {
                  status: event.target.value,
                }).catch((requestError: unknown) =>
                  setError(
                    errorMessage(requestError, "No pudimos actualizar."),
                  ),
                )
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
                  void request(`/api/admin/users/${user.id}`, "PATCH", {
                    verified: event.target.checked,
                  }).catch((requestError: unknown) =>
                    setError(
                      errorMessage(requestError, "No pudimos actualizar."),
                    ),
                  )
                }
              />{" "}
              Verificada
            </label>
          </div>
        ))}
        {!visibleUsers.length && <p className="empty">Sin coincidencias.</p>}
        {accountResults && accountResults.total > accountResults.limit && (
          <nav
            className="catalog-pagination"
            aria-label="Paginación de cuentas"
          >
            <button
              className="filter"
              disabled={accountPage <= 1}
              onClick={() => setAccountPage((page) => Math.max(1, page - 1))}
            >
              Anterior
            </button>
            <span>
              Página {accountResults.page} de{" "}
              {Math.ceil(accountResults.total / accountResults.limit)}
            </span>
            <button
              className="filter"
              disabled={
                accountPage * accountResults.limit >= accountResults.total
              }
              onClick={() => setAccountPage((page) => page + 1)}
            >
              Siguiente
            </button>
          </nav>
        )}
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
                    void request(
                      `/api/admin/verifications/${verification.id}`,
                      "PATCH",
                      { status: "approved" },
                    )
                      .then(() => announce("Verificación aprobada."))
                      .catch((requestError: unknown) =>
                        setError(
                          errorMessage(requestError, "No pudimos aprobar."),
                        ),
                      )
                  }
                >
                  Aprobar
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    void request(
                      `/api/admin/verifications/${verification.id}`,
                      "PATCH",
                      { status: "rejected" },
                    )
                      .then(() => announce("Verificación rechazada."))
                      .catch((requestError: unknown) =>
                        setError(
                          errorMessage(requestError, "No pudimos rechazar."),
                        ),
                      )
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
