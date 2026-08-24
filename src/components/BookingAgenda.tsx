import { type FormEvent, useState } from "react";
import { apiFetch } from "../lib/api";

type Role = "client" | "professional";

type Booking = {
  id: number;
  professionalId: number;
  title: string;
  date: string;
  time: string;
  status: string;
  paymentStatus?: string;
  client?: { name: string };
};

type Props = {
  bookings: Booking[];
  role: Role;
  reload: () => Promise<void>;
  announce: (message: string) => void;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function ReviewFlow({
  booking,
  close,
  announce,
  reload,
}: Omit<Props, "bookings" | "role"> & { booking: Booking; close: () => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiFetch(
        `/api/professionals/${booking.professionalId}/reviews`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookingId: booking.id,
            rating: form.get("rating"),
            comment: form.get("comment"),
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error);
      await reload();
      close();
      announce("Gracias por compartir tu experiencia.");
    } catch (submitError) {
      setError(errorMessage(submitError, "No pudimos guardar la reseña."));
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
        <p className="eyebrow">SERVICIO FINALIZADO</p>
        <h2>Calificá tu experiencia</h2>
        <label>
          Puntaje
          <select name="rating" defaultValue="5">
            <option value="5">5 · Excelente</option>
            <option value="4">4 · Muy bueno</option>
            <option value="3">3 · Bueno</option>
            <option value="2">2 · Regular</option>
            <option value="1">1 · Malo</option>
          </select>
        </label>
        <label>
          Comentario
          <textarea name="comment" required minLength={3} maxLength={800} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="modal-primary" disabled={saving}>
          {saving ? "Guardando..." : "Publicar reseña"}
        </button>
      </form>
    </div>
  );
}

export function BookingAgenda({ bookings, role, reload, announce }: Props) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const awaitingClientConfirmation = "Esperando tu confirmación";
  const nextStatus = (booking: Booking) => {
    if (role === "professional") {
      const transitions: Record<string, string> = {
        "Esperando respuesta": "Profesional confirmado",
        "Profesional confirmado": "Trabajo en curso",
        "Trabajo en curso": awaitingClientConfirmation,
      };
      return transitions[booking.status];
    }
    const transitions: Record<string, string> = {
      "Esperando respuesta": "Cancelada",
      [awaitingClientConfirmation]: "Finalizado",
    };
    return transitions[booking.status];
  };
  const labelFor = (booking: Booking) => {
    if (booking.status === "Profesional confirmado") return "Autorizar pago";
    if (booking.status === "Finalizado") return "Liberar pago";
    const next = nextStatus(booking);
    return (
      {
        "Profesional confirmado": "Confirmar reserva",
        "Trabajo en curso": "Iniciar trabajo",
        [awaitingClientConfirmation]: "Pedir confirmación",
        Finalizado: "Confirmar trabajo",
        Cancelada: "Cancelar reserva",
      }[next || ""] || null
    );
  };
  const updateBooking = async (booking: Booking) => {
    setSavingId(booking.id);
    try {
      let url: string;
      let method: "POST" | "PATCH";
      let body: Record<string, number | string> | undefined;
      if (role === "client" && booking.status === "Profesional confirmado") {
        url = "/api/payments/intents";
        method = "POST";
        body = { bookingId: booking.id };
      } else if (role === "client" && booking.status === "Finalizado") {
        url = `/api/payments/${booking.id}/release`;
        method = "POST";
      } else {
        const status = nextStatus(booking);
        if (!status) return;
        url =
          role === "professional"
            ? `/api/professional/bookings/${booking.id}/status`
            : `/api/bookings/${booking.id}/status`;
        method = "PATCH";
        body = { status };
      }
      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error);
      await reload();
      announce("Reserva actualizada correctamente.");
    } catch (error) {
      announce(errorMessage(error, "No pudimos actualizar la reserva."));
    } finally {
      setSavingId(null);
    }
  };
  return (
    <div className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">ORGANIZA TU TIEMPO</p>
          <h1>{role === "professional" ? "Tu agenda" : "Tus reservas"}</h1>
          <p>Seguí el estado de cada servicio desde un solo lugar.</p>
        </div>
      </header>
      <section className="calendar">
        {bookings.length === 0 && (
          <div className="empty">Todavía no tenés reservas activas.</div>
        )}
        {bookings.map((booking) => (
          <div className="appointment" key={booking.id}>
            <time>
              {booking.date}
              <br />
              <small>{booking.time}</small>
            </time>
            <div>
              <span className="tag green">{booking.status}</span>
              <h3>{booking.title}</h3>
              <p>
                {role === "professional" && booking.client?.name
                  ? `Cliente: ${booking.client.name}`
                  : "Servicio solicitado"}
              </p>
              <small>Pago: {booking.paymentStatus || "unpaid"}</small>
            </div>
            {labelFor(booking) && (
              <button
                disabled={savingId === booking.id}
                onClick={() => updateBooking(booking)}
              >
                {savingId === booking.id ? "Guardando..." : labelFor(booking)}
              </button>
            )}
            {role === "client" && booking.status === "Completada" && (
              <button onClick={() => setReviewBooking(booking)}>
                Calificar
              </button>
            )}
          </div>
        ))}
      </section>
      {reviewBooking && (
        <ReviewFlow
          booking={reviewBooking}
          close={() => setReviewBooking(null)}
          announce={announce}
          reload={reload}
        />
      )}
    </div>
  );
}
