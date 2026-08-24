import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatMessageTime } from "../lib/datetime";

type Role = "client" | "professional";

type Message = {
  id: number;
  clientId: string;
  professionalId: number;
  text: string;
  author: Role;
  createdAt: string;
  readAt?: string | null;
};

type Partner = {
  name: string;
  initials?: string;
  color?: string;
};

type Conversation = {
  professionalId: number;
  clientId: string;
  partner: Partner;
  lastMessage?: Message;
  unreadCount: number;
};

type ApiError = { error?: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function PartnerAvatar({ partner }: { partner: Partner }) {
  const initials = partner.initials || partner.name.slice(0, 1);
  return (
    <span
      className="avatar small"
      style={{ background: partner.color || "#5c98ac" }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Messages({ role }: { role: Role }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const loadConversations = useCallback(async () => {
    try {
      const response = await apiFetch("/api/conversations");
      const data = (await response.json()) as Conversation[] & ApiError;
      if (!response.ok) throw Error(data.error);
      setConversations(data);
      setSelected((current) => current || data[0] || null);
    } catch (requestError) {
      setError(
        errorMessage(requestError, "No pudimos cargar las conversaciones."),
      );
    }
  }, []);
  const loadMessages = useCallback(async () => {
    if (!selected) return setMessages([]);
    try {
      const search =
        role === "professional" ? `?clientId=${selected.clientId}` : "";
      const response = await apiFetch(
        `/api/messages/${selected.professionalId}${search}`,
      );
      const data = (await response.json()) as Message[] & ApiError;
      if (!response.ok) throw Error(data.error);
      setMessages(data);
      const unread = data.filter(
        (item) =>
          !item.readAt &&
          ((role === "professional" && item.author === "client") ||
            (role === "client" && item.author === "professional")),
      );
      await Promise.all(
        unread.map((item) =>
          apiFetch(`/api/messages/${item.id}/read`, { method: "PATCH" }),
        ),
      );
      if (unread.length) loadConversations();
    } catch (requestError) {
      setError(errorMessage(requestError, "No pudimos cargar los mensajes."));
    }
  }, [loadConversations, role, selected]);
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);
  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    try {
      const url =
        role === "professional"
          ? "/api/professional/messages"
          : "/api/messages";
      const body =
        role === "professional"
          ? { clientId: selected.clientId, text: draft.trim() }
          : { professionalId: selected.professionalId, text: draft.trim() };
      const response = await apiFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `message-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as Message & ApiError;
      if (!response.ok) throw Error(data.error);
      setMessages((current) => [...current, data]);
      setDraft("");
      loadConversations();
    } catch (requestError) {
      setError(errorMessage(requestError, "No pudimos enviar el mensaje."));
    }
  };
  return (
    <div className="messages-page">
      <aside className="threads">
        <div className="thread-head">
          <h2>Mensajes</h2>
        </div>
        {conversations.map((item) => (
          <button
            className={`thread ${selected?.professionalId === item.professionalId && selected?.clientId === item.clientId ? "active" : ""}`}
            key={`${item.professionalId}-${item.clientId}`}
            onClick={() => setSelected(item)}
          >
            <PartnerAvatar partner={item.partner} />
            <div>
              <b>{item.partner.name}</b>
              <p>{item.lastMessage?.text || "Sin mensajes"}</p>
            </div>
            <small>{formatMessageTime(item.lastMessage?.createdAt)}</small>
            {item.unreadCount > 0 && <em>{item.unreadCount}</em>}
          </button>
        ))}
        {!conversations.length && (
          <p className="empty">Todavía no tenés conversaciones.</p>
        )}
      </aside>
      <section className="chat">
        {selected ? (
          <>
            <header>
              <div>
                <b>{selected.partner.name}</b>
                <p>{role === "professional" ? "Cliente" : "Profesional"}</p>
              </div>
            </header>
            <div className="chat-body">
              {messages.map((item) => (
                <div
                  className={`bubble ${item.author === "professional" ? (role === "professional" ? "me" : "them") : role === "professional" ? "them" : "me"}`}
                  key={item.id}
                >
                  {item.text}
                  <small>{formatMessageTime(item.createdAt)}</small>
                </div>
              ))}
            </div>
            <form className="message-box" onSubmit={sendMessage}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escribí un mensaje..."
                maxLength={1500}
              />
              <button className="send" aria-label="Enviar">
                ↑
              </button>
            </form>
          </>
        ) : (
          <div className="empty">Elegí una conversación para empezar.</div>
        )}
        {error && <p className="form-error">{error}</p>}
      </section>
    </div>
  );
}
