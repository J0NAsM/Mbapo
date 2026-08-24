type Booking = {
  date: string;
  id: number;
  status: string;
  time: string;
  title: string;
};

type Workspace = {
  applications?: unknown[];
  bookings?: Booking[];
  conversations?: unknown[];
  professional: {
    available?: boolean;
    name: string;
    serviceAreas?: string[];
  };
};

type Props = {
  announce: (message: string) => void;
  setView: (view: string) => void;
  workspace: Workspace | null;
};

export function ProfessionalHome({ workspace, setView, announce }: Props) {
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
