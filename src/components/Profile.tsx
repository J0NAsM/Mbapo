import { NotificationCenter } from "./NotificationCenter";
import { VerificationRequests } from "./VerificationRequests";

type User = {
  name?: string;
  verified?: boolean;
  referralCode?: string;
};

type ProfileProps = {
  role: "client" | "professional";
  user?: User | null;
  onWallet: () => void;
  onAdmin: () => void;
  onReferralShare: () => void;
  onOnboarding: () => void;
  onLogout: () => void;
};

export default function Profile({
  role,
  user,
  onWallet,
  onAdmin,
  onReferralShare,
  onOnboarding,
  onLogout,
}: ProfileProps) {
  const initials = (user?.name || "MB")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">TU CUENTA</p>
          <h1>Perfil y preferencias</h1>
          <p>Una misma cuenta para contratar y ofrecer servicios.</p>
          <button className="filter" onClick={onLogout}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <section className="profile-card">
        <span className="profile-avatar">{initials}</span>
        <div>
          <h2>
            {user?.name || "Tu cuenta"}{" "}
            {user?.verified && <span className="verified">✓</span>}
          </h2>
          <p>
            {user?.verified
              ? "Identidad verificada"
              : "Completá la verificación para generar confianza"}
          </p>
          <button className="link-btn">Editar perfil →</button>
        </div>
      </section>
      <section className="profile-options">
        <NotificationCenter />
        <VerificationRequests />
        {role === "client" && (
          <article>
            <span>+</span>
            <div>
              <h3>Ofrecer servicios</h3>
              <p>Creá tu perfil profesional, zonas, precios y horarios.</p>
            </div>
            <button className="link-btn" onClick={onOnboarding}>
              Empezar →
            </button>
          </article>
        )}
        <article>
          <span>◈</span>
          <div>
            <h3>Pagos y billetera</h3>
            <p>Consultá tus cobros, pagos protegidos y retiros.</p>
          </div>
          <button className="link-btn" onClick={onWallet}>
            Abrir →
          </button>
        </article>
        <article>
          <span>✦</span>
          <div>
            <h3>Invitá a alguien</h3>
            <p>
              Código: <b>{user?.referralCode || "Sin código"}</b>
            </p>
          </div>
          <button className="link-btn" onClick={onReferralShare}>
            Compartir →
          </button>
        </article>
        <article>
          <span>⚙</span>
          <div>
            <h3>Administración</h3>
            <p>Acceso restringido para gestionar la plataforma.</p>
          </div>
          <button className="link-btn" onClick={onAdmin}>
            Abrir →
          </button>
        </article>
      </section>
    </div>
  );
}
