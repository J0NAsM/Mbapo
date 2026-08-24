import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Request = { kind: string; status: string };

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function VerificationRequests() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      const response = await apiFetch("/api/verifications");
      const data = (await response.json()) as Request[] | { error?: string };
      if (!response.ok) throw Error("error" in data ? data.error : "");
      setRequests(data as Request[]);
    } catch (loadError) {
      setError(message(loadError, "No pudimos cargar tus verificaciones."));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const request = async (kind: string) => {
    try {
      const response = await apiFetch("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(data.error);
      await load();
    } catch (requestError) {
      setError(message(requestError, "No pudimos enviar la solicitud."));
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
        <button onClick={() => void request("identity")}>Identidad</button>
        <button onClick={() => void request("professional")}>
          Profesional
        </button>
      </div>
    </article>
  );
}
