type UserWallet = {
  balance?: number;
  escrow?: number;
};

type Transaction = {
  amount: number;
  description?: string;
  id?: number | string;
  name: string;
  status?: string;
};

type Props = {
  setModal: (kind: string) => void;
  transactions?: Transaction[];
  user?: UserWallet;
};

const guaranies = (value: number | undefined) =>
  `Gs. ${Number(value || 0).toLocaleString("es-PY")}`;

export function Wallet({ setModal, user, transactions = [] }: Props) {
  return (
    <div className="content-page">
      <header className="page-title">
        <div>
          <p className="eyebrow">PAGOS SEGUROS</p>
          <h1>Tu billetera</h1>
          <p>Administrá pagos y cobros de manera transparente.</p>
        </div>
        <button className="publish" onClick={() => setModal("withdraw")}>
          Retirar fondos
        </button>
      </header>
      <section className="wallet-cards">
        <div className="balance">
          <span>Saldo disponible</span>
          <h2>{guaranies(user?.balance)}</h2>
          <p>Actualizado ahora</p>
          <button onClick={() => setModal("withdraw")}>Retirar dinero →</button>
        </div>
        <div className="escrow">
          <span>◈</span>
          <div>
            <small>EN PAGO PROTEGIDO</small>
            <h3>{guaranies(user?.escrow)}</h3>
            <p>Se libera al confirmar el trabajo.</p>
          </div>
        </div>
      </section>
      <section className="transactions">
        <h2>Movimientos recientes</h2>
        {transactions.map((item, index) => (
          <div className="transaction" key={item.id || index}>
            <span className="trans-icon">
              {index === 0 ? "◈" : index === 1 ? "↓" : "%"}
            </span>
            <div>
              <b>{item.name}</b>
              <p>{item.description}</p>
            </div>
            <span className={item.amount > 0 ? "income" : ""}>
              <b>
                {item.amount > 0 ? "+" : "-"} {guaranies(Math.abs(item.amount))}
              </b>
              <small>{item.status}</small>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}
