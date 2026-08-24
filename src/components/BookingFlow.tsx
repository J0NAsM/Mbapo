import { useEffect, useState, type FormEvent } from "react";
import { Avatar } from "./Identity";
import { apiFetch } from "../lib/api";

type Professional = {
  id: number;
  name: string;
  role?: string;
  rating?: number | string;
  verified?: boolean;
  color?: string;
  initials?: string;
  price?: number;
};

type BookingFlowProps = {
  close: () => void;
  announce: (message: string) => void;
  reload: () => Promise<unknown> | void;
  professional: Professional;
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

export default function BookingFlow({
  close,
  announce,
  reload,
  professional,
}: BookingFlowProps) {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [place, setPlace] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => `booking-${crypto.randomUUID()}`);
  const professionalName = professional.name;

  const next = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 2 && (!date || !time)) {
      setError("Elegí una fecha y horario disponibles para continuar.");
      return;
    }
    if (step === 3 && place.trim().length < 4) {
      setError("Indicá una zona o dirección para el servicio.");
      return;
    }
    setError("");
    setStep((value) => Math.min(4, value + 1));
  };

  useEffect(() => {
    if (!date) {
      setSlots([]);
      setTime("");
      return undefined;
    }
    let current = true;
    setSlotsLoading(true);
    setTime("");
    fetch(`/api/professionals/${professional.id}/availability?date=${date}`)
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok) throw Error(errorMessage(data, "Sin disponibilidad."));
        if (!current) return;
        const values =
          typeof data === "object" &&
          data !== null &&
          "slots" in data &&
          Array.isArray(data.slots)
            ? data.slots.filter((slot): slot is string => typeof slot === "string")
            : [];
        setSlots(values);
      })
      .catch((requestError: unknown) => {
        if (!current) return;
        setSlots([]);
        setError(errorMessage(requestError, "No pudimos consultar horarios."));
      })
      .finally(() => {
        if (current) setSlotsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [date, professional.id]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
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
      const data: unknown = await response.json();
      if (!response.ok) throw Error(errorMessage(data, "No pudimos crear la solicitud."));
      await reload();
      close();
      announce("Solicitud creada. El pago se protege al confirmar el servicio.");
    } catch (requestError) {
      setError(errorMessage(requestError, "No pudimos crear la solicitud."));
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
              <Avatar person={professional} />
              <span>
                <b>{professionalName}</b>
                <small>
                  {professional.role || "Profesional"} · ★{" "}
                  {professional.rating || "Nuevo"} ·{" "}
                  {professional.verified
                    ? "Identidad verificada"
                    : "Perfil en verificación"}
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
                min={new Date().toISOString().slice(0, 10)}
                required
              />
            </label>
            <label>
              Horario
              <select
                value={time}
                onChange={(event) => setTime(event.target.value)}
                disabled={!date || slotsLoading || !slots.length}
                required
              >
                <option value="">
                  {slotsLoading
                    ? "Consultando horarios…"
                    : date
                      ? slots.length
                        ? "Elegí un horario"
                        : "No hay horarios disponibles"
                      : "Elegí una fecha primero"}
                </option>
                {slots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
            </label>
            {date && !slotsLoading && !slots.length && (
              <p className="empty">
                No quedan franjas disponibles ese día. Elegí otra fecha.
              </p>
            )}
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
                <span>Desde Gs. {Number(professional.price || 0).toLocaleString("es-PY")}</span>
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
