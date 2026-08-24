import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { apiFetch } from "../lib/api";

type Job = {
  id: number;
  title: string;
  category: string;
  place: string;
  date: string;
  budget: string;
  applicants: number;
  urgent?: boolean;
};

type JobPage = {
  items: Job[];
  page: number;
  pageSize: number;
  total: number;
};

type JobsProps = {
  setModal: Dispatch<SetStateAction<string | null>>;
  announce: (message: string) => void;
  jobs: Job[];
};

function isJobList(value: unknown): value is Job[] {
  return Array.isArray(value);
}

export default function Jobs({ setModal, announce, jobs: jobList }: JobsProps) {
  const [remoteJobs, setRemoteJobs] = useState<JobPage | null>(null);
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
        const items: unknown = await response.json();
        if (!isJobList(items)) throw Error();
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

  const apply = async (job: Job) => {
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
              Categoría
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
                <option value="recent">Más recientes</option>
                <option value="budget">Mayor presupuesto</option>
              </select>
            </label>
          </div>
          {displayedJobs.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="job-meta">
                <span>{job.category}</span>
                {job.urgent && <b>Urgente</b>}
                <small>Publicado hace 2 h</small>
              </div>
              <h3>{job.title}</h3>
              <p>
                ⌖ {job.place} <i>·</i> {job.date}
              </p>
              <div className="job-bottom">
                <span>
                  <b>{job.budget}</b>
                  <small>Presupuesto estimado</small>
                </span>
                <span>{job.applicants} profesionales interesados</span>
                <button onClick={() => apply(job)}>Postularme →</button>
              </div>
            </article>
          ))}
          {!displayedJobs.length && (
            <div className="empty">No hay trabajos con esos filtros.</div>
          )}
          {remoteJobs && remoteJobs.total > remoteJobs.pageSize && (
            <nav
              className="catalog-pagination"
              aria-label="Paginación de trabajos"
            >
              <button
                className="filter"
                disabled={jobPage <= 1}
                onClick={() => setJobPage((page) => Math.max(1, page - 1))}
              >
                Anterior
              </button>
              <span>
                Página {remoteJobs.page} de{" "}
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
