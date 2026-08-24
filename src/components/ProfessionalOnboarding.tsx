import { useState, type FormEvent } from "react";
import { apiFetch, formatApiError } from "../lib/api";

type AvailabilitySlot = {
  day: number;
  end: string;
  start: string;
};

type OnboardingResponse = {
  error?: string;
  professional?: { id?: number };
  token?: string;
  user?: { role?: string };
};

type ProfessionalOnboardingProps = {
  announce: (message: string) => void;
  close: () => void;
  onSession: (session: OnboardingResponse) => void;
  reload: () => Promise<unknown> | void;
};

const weekdays = [
  { day: 1, label: "Lun" },
  { day: 2, label: "Mar" },
  { day: 3, label: "Mié" },
  { day: 4, label: "Jue" },
  { day: 5, label: "Vie" },
];

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function commaSeparatedValues(form: FormData, name: string) {
  return formValue(form, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function apiError(data: OnboardingResponse) {
  return data.error || "No pudimos completar el onboarding.";
}

export default function ProfessionalOnboarding({
  close,
  announce,
  reload,
  onSession,
}: ProfessionalOnboardingProps) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const availability: AvailabilitySlot[] = weekdays
      .filter(({ day }) => form.get(`day-${day}`))
      .map(({ day }) => ({
        day,
        start: formValue(form, "start"),
        end: formValue(form, "end"),
      }));

    try {
      const response = await apiFetch("/api/professional/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: formValue(form, "role"),
          price: formValue(form, "price"),
          tags: commaSeparatedValues(form, "tags"),
          serviceAreas: commaSeparatedValues(form, "serviceAreas"),
          text: formValue(form, "text"),
          availability,
        }),
      });
      const data = (await response.json()) as OnboardingResponse;
      if (!response.ok) throw Error(apiError(data));
      onSession(data);
      await reload();
      close();
      announce("Tu perfil profesional está listo.");
    } catch (submitError) {
      setError(
        formatApiError(submitError, "No pudimos completar el onboarding."),
      );
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
            minLength={20}
            placeholder="Contá tu experiencia y qué servicios realizás."
          />
        </label>
        <fieldset className="filter-panel">
          <legend>Horarios semanales</legend>
          {weekdays.map(({ day, label }) => (
            <label key={day}>
              <input name={`day-${day}`} type="checkbox" defaultChecked />{" "}
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
