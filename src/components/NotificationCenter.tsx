import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatMessageTime } from "../lib/datetime";

type Notification = {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationResponse = {
  items?: Notification[];
  error?: string;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/notifications?limit=10");
      const data = (await response.json()) as NotificationResponse;
      if (!response.ok) throw Error(data.error);
      setNotifications(data.items || []);
    } catch (requestError) {
      setError(errorMessage(requestError, "No pudimos cargar los avisos."));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const markRead = async (id: string) => {
    try {
      const response = await apiFetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      const data = (await response.json()) as Notification & { error?: string };
      if (!response.ok) throw Error(data.error);
      setNotifications((current) =>
        current.map((item) => (item.id === id ? data : item)),
      );
    } catch (requestError) {
      setError(errorMessage(requestError, "No pudimos actualizar el aviso."));
    }
  };
  return (
    <article className="notification-card">
      <span>♡</span>
      <div>
        <h3>Avisos internos</h3>
        {notifications.length ? (
          <ul className="notification-list" aria-label="Avisos recientes">
            {notifications.map((item) => (
              <li key={item.id} className={item.readAt ? "" : "unread"}>
                <b>{item.title}</b>
                <p>{item.body}</p>
                <small>{formatMessageTime(item.createdAt)}</small>
                {!item.readAt && (
                  <button
                    className="link-btn"
                    onClick={() => markRead(item.id)}
                  >
                    Marcar leído
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No tenés avisos nuevos.</p>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </article>
  );
}
