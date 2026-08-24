import express from "express";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import pg from "pg";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import Stripe from "stripe";
import { z } from "zod";
import { createObservability } from "./server/observability.js";
import { applyMigrations } from "./server/persistence/migrations.js";
import { createNotificationsRepository } from "./server/persistence/notifications.js";
import { createMessagesRepository } from "./server/persistence/messages.js";
import { createReviewsRepository } from "./server/persistence/reviews.js";
import { createVerificationsRepository } from "./server/persistence/verifications.js";
import { createBookingsRepository } from "./server/persistence/bookings.js";
import { createCatalogRepository } from "./server/persistence/catalog.js";
import { createAccountsRepository } from "./server/persistence/accounts.js";
import {
  bookingOverlaps,
  bookingRange,
  isProfessionalAvailable,
  timeToMinutes,
} from "./server/domain/availability.js";

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.MBAPO_DATA_PATH || join(root, "data", "mbapo.json");
const isProduction = process.env.NODE_ENV === "production";
const app = express();
const startedAt = Date.now();
const structuredLogs = process.env.LOG_LEVEL !== "silent";
const observability = createObservability({
  enabled: structuredLogs,
  createRequestId: () => randomBytes(8).toString("hex"),
});
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
app.use(observability.middleware);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.path === "/webhooks/stripe",
  }),
);
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
      return res.status(503).json({ error: "Stripe no está configurado" });
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      return res.status(400).json({ error: "Firma de webhook inválida" });
    }
    const db = await database();
    if ((db.webhookEvents || []).some((processed) => processed.id === event.id))
      return res.json({ received: true, replayed: true });
    if (
      event.type === "payment_intent.succeeded" ||
      event.type === "payment_intent.amount_capturable_updated"
    ) {
      const intent = event.data.object;
      const bookingId = Number(intent.metadata.bookingId);
      const booking = db.bookings.find((item) => item.id === bookingId);
      if (booking && booking.paymentIntentId === intent.id) {
        const previousStatus = booking.paymentStatus;
        booking.paymentStatus =
          event.type === "payment_intent.succeeded" ? "paid" : "authorized";
        if (
          booking.paymentStatus === "authorized" &&
          previousStatus !== "authorized"
        ) {
          const profile = db.userProfiles[intent.metadata.userId];
          if (profile) profile.escrow += booking.amount;
          db.transactions.unshift({
            id: nextId(db.transactions),
            userId: intent.metadata.userId,
            name: "Pago protegido",
            description: booking.title,
            amount: -booking.amount,
            status: "Autorizado",
          });
        }
        if (booking.paymentStatus === "paid") booking.status = "Completada";
        audit(db, null, "payment.webhook_processed", "booking", booking.id, {
          eventType: event.type,
          intentId: intent.id,
        });
      }
    }
    db.webhookEvents.push({
      id: event.id,
      processedAt: new Date().toISOString(),
    });
    db.webhookEvents.splice(10000);
    await save(db);
    res.json({ received: true });
  },
);
app.use(express.json({ limit: "2mb" }));
app.disable("x-powered-by");
if (isProduction && !process.env.MBAPO_AUTH_SECRET)
  throw new Error("MBAPO_AUTH_SECRET es obligatorio en producción");
if (isProduction && !process.env.DATABASE_URL)
  throw new Error("DATABASE_URL es obligatorio en producción");
if (isProduction && process.env.DATABASE_SSL !== "true")
  throw new Error("DATABASE_SSL=true es obligatorio en producción");
const authSecret =
  process.env.MBAPO_AUTH_SECRET || "development-only-secret-do-not-deploy";
const loginAttempts = new Map();
const pool = process.env.DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? {
              rejectUnauthorized:
                process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
            }
          : undefined,
    })
  : null;
const notificationsRepository = createNotificationsRepository(pool);
const messagesRepository = createMessagesRepository(pool);
const reviewsRepository = createReviewsRepository(pool);
const verificationsRepository = createVerificationsRepository(pool);
const bookingsRepository = createBookingsRepository(pool);
const catalogRepository = createCatalogRepository(pool);
const accountsRepository = createAccountsRepository(pool);
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const demoPayments = !isProduction && process.env.PAYMENTS_MODE === "demo";
let postgresReady = false;

const seed = {
  user: {
    id: "usr-andrea",
    name: "Andrea López",
    email: "andrea@mbapo.app",
    role: "client",
    verified: true,
    skill: "Electricista",
    hourlyRate: 95000,
    balance: 1485000,
    escrow: 520000,
    favorites: [],
  },
  professionals: [
    {
      id: 1,
      name: "Rocío Benítez",
      initials: "RB",
      color: "#f3b63f",
      role: "Electricista certificada",
      rating: 4.9,
      jobs: 126,
      price: 95000,
      distance: "1.2 km",
      verified: true,
      available: true,
      tags: ["Instalaciones", "Emergencias"],
      text: "Instalaciones seguras, reparaciones y tableros eléctricos.",
      onTimeRate: 96,
      completionRate: 98,
      memberSince: "2024",
      serviceArea: ["Villa Morra", "Recoleta", "Asunción"],
      portfolio: [],
      certifications: ["Matrícula técnica eléctrica"],
    },
    {
      id: 2,
      name: "Mateo Duarte",
      initials: "MD",
      color: "#5d87d7",
      role: "Plomero · Reparaciones",
      rating: 4.8,
      jobs: 89,
      price: 80000,
      distance: "2.8 km",
      verified: true,
      available: true,
      tags: ["Pérdidas", "Baños"],
      text: "Resuelvo filtraciones, griferías y problemas de presión.",
    },
    {
      id: 3,
      name: "Sofía Rojas",
      initials: "SR",
      color: "#db8066",
      role: "Pintora y decoradora",
      rating: 5,
      jobs: 64,
      price: 70000,
      distance: "3.1 km",
      verified: true,
      available: false,
      tags: ["Interiores", "Color"],
      text: "Terminaciones cuidadas para renovar tus espacios.",
    },
    {
      id: 4,
      name: "Juan Pablo Acosta",
      initials: "JA",
      color: "#62a783",
      role: "Técnico de aire acondicionado",
      rating: 4.7,
      jobs: 103,
      price: 110000,
      distance: "4.5 km",
      verified: true,
      available: true,
      tags: ["Mantenimiento", "Split"],
      text: "Instalación, limpieza y reparación de climatización.",
    },
  ],
  jobs: [
    {
      id: 1,
      title: "Instalar 3 ventiladores de techo",
      category: "Electricidad",
      place: "Villa Morra",
      budget: "Gs. 450.000 – 650.000",
      date: "Para esta semana",
      owner: "Camila R.",
      applicants: 6,
      urgent: false,
      createdAt: "2026-08-17T10:00:00.000Z",
    },
    {
      id: 2,
      title: "Reparar pérdida debajo de la pileta",
      category: "Plomería",
      place: "Recoleta",
      budget: "Gs. 180.000 – 250.000",
      date: "Hoy · Flexible",
      owner: "Diego M.",
      applicants: 4,
      urgent: true,
      createdAt: "2026-08-17T09:00:00.000Z",
    },
    {
      id: 3,
      title: "Pintar living y pasillo",
      category: "Pintura",
      place: "Barrio Jara",
      budget: "Gs. 1.200.000 – 1.700.000",
      date: "Desde el 24 de agosto",
      owner: "Laura F.",
      applicants: 9,
      urgent: false,
      createdAt: "2026-08-16T14:00:00.000Z",
    },
  ],
  bookings: [
    {
      id: 1,
      professionalId: 1,
      title: "Instalación de ventiladores",
      date: "2026-08-21",
      time: "14:00 – 16:00",
      status: "Confirmada",
      place: "Villa Morra",
      amount: 520000,
    },
  ],
  messages: [
    {
      id: 1,
      professionalId: 1,
      text: "Hola, Rocío. ¿Tenés disponibilidad este jueves?",
      author: "client",
      createdAt: "10:40",
    },
    {
      id: 2,
      professionalId: 1,
      text: "¡Hola! Sí, puedo pasar a partir de las 14:00.",
      author: "professional",
      createdAt: "10:42",
    },
  ],
  transactions: [
    {
      id: 1,
      name: "Pago protegido",
      description: "Instalación ventiladores",
      amount: -520000,
      status: "Pendiente",
    },
    {
      id: 2,
      name: "Cobro recibido",
      description: "Reparación tablero eléctrico",
      amount: 855000,
      status: "Completado",
    },
    {
      id: 3,
      name: "Comisión Mbapo",
      description: "Trabajo #MB-1048",
      amount: -95000,
      status: "Completado",
    },
  ],
};

function passwordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}
function validPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  const hash = scryptSync(password, record.salt, 64).toString("hex");
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(record.hash, "hex"),
  );
}
function signToken(payload) {
  const content = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", authSecret)
    .update(content)
    .digest("base64url");
  return `${content}.${signature}`;
}
function publicUser(user) {
  const safe = { ...user };
  delete safe.password;
  return safe;
}
function toAuthUser(user, password) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verified: user.verified,
    status: "active",
    tokenVersion: 0,
    password: passwordRecord(password),
    createdAt: new Date().toISOString(),
  };
}
function ensureSystemData(data) {
  data.authUsers ||= [];
  data.reviews ||= [];
  data.verifications ||= [];
  data.auditLog ||= [];
  data.growthEvents ||= [];
  data.idempotencyKeys ||= [];
  data.notifications ||= [];
  data.webhookEvents ||= [];
  data.userProfiles ||= {};
  if (data.user?.id && !data.userProfiles[data.user.id])
    data.userProfiles[data.user.id] = data.user;
  for (const transaction of data.transactions || [])
    transaction.userId ||= data.user?.id;
  for (const booking of data.bookings || []) booking.clientId ||= data.user?.id;
  for (const message of data.messages || []) message.clientId ||= data.user?.id;
  for (const user of data.authUsers) {
    user.tokenVersion ||= 0;
    user.status ||= "active";
  }
  for (const profile of Object.values(data.userProfiles)) {
    profile.favorites ||= [];
    profile.savedSearches ||= [];
    profile.referralCode ||= referralCodeFor(profile.id);
    profile.referralQualifiedCount ||= 0;
  }
  if (
    !isProduction &&
    !data.authUsers.some((user) => user.email === "admin@mbapo.local")
  )
    data.authUsers.push({
      ...toAuthUser(
        {
          id: "usr-admin",
          name: "Administrador Mbapo",
          email: "admin@mbapo.local",
          role: "admin",
          verified: true,
        },
        process.env.MBAPO_DEMO_ADMIN_PASSWORD || "MbapoAdmin!2026",
      ),
      role: "admin",
    });
  data.platform ||= {
    commissionRate: 10,
    currency: "PYG",
    supportEmail: "soporte@mbapo.app",
    categories: [
      "Electricidad",
      "Plomería",
      "Pintura",
      "Construcción",
      "Hogar",
    ],
    content: {
      heroEyebrow: "SERVICIOS QUE DAN TRANQUILIDAD",
      heroTitle: "Encontrá a la persona indicada para el trabajo.",
      heroDescription:
        "Profesionales verificados, precios claros y pagos protegidos. Todo en un solo lugar.",
    },
  };
  return data;
}
function referralCodeFor(id) {
  return `MB-${String(id)
    .replace(/[^a-z0-9]/gi, "")
    .slice(-8)
    .toUpperCase()}`;
}
function trackGrowthEvent(db, account, name, metadata = {}) {
  db.growthEvents.unshift({
    id: `evt-${randomBytes(10).toString("hex")}`,
    actorId: account?.id || null,
    name,
    metadata,
    occurredAt: new Date().toISOString(),
  });
  db.growthEvents.splice(10000);
}
function growthMetrics(db) {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const events = (db.growthEvents || []).filter(
    (event) => new Date(event.occurredAt).getTime() >= since,
  );
  const count = (name) => events.filter((event) => event.name === name).length;
  const jobs = (db.jobs || []).filter(
    (job) => new Date(job.createdAt || 0).getTime() >= since,
  );
  const bookings = (db.bookings || []).filter(
    (booking) => new Date(booking.timeline?.[0]?.at || 0).getTime() >= since,
  );
  const completed = bookings.filter(
    (booking) => booking.status === "Completada",
  );
  const cancelled = bookings.filter(
    (booking) => booking.status === "Cancelada",
  );
  const activeSupply = (db.professionals || []).filter(
    (professional) => professional.available && !professional.archivedAt,
  ).length;
  const demandByCategoryZone = Object.values(
    events
      .filter((event) => event.name === "job.created")
      .reduce((groups, event) => {
        const category = event.metadata?.category || "Sin categoría";
        const zone = event.metadata?.zone || "Sin zona";
        const key = `${category}::${zone}`;
        groups[key] ||= { category, zone, requests: 0 };
        groups[key].requests += 1;
        return groups;
      }, {}),
  )
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 5);
  const supplyByCategory = Object.entries(
    (db.professionals || [])
      .filter(
        (professional) => professional.available && !professional.archivedAt,
      )
      .reduce((groups, professional) => {
        for (const tag of professional.tags || [])
          groups[tag] = (groups[tag] || 0) + 1;
        return groups;
      }, {}),
  )
    .map(([category, professionals]) => ({ category, professionals }))
    .sort((left, right) => right.professionals - left.professionals);
  return {
    windowDays: 30,
    funnel: {
      registrations: count("account.registered"),
      catalogSearches: count("catalog.searched"),
      jobsCreated: jobs.length,
      bookingsCreated: bookings.length,
      bookingsCompleted: completed.length,
      reviewsCreated: count("review.created"),
      referralsQualified: count("referral.qualified"),
    },
    operations: {
      activeSupply,
      completionRate: bookings.length
        ? Number((completed.length / bookings.length).toFixed(3))
        : null,
      cancellationRate: bookings.length
        ? Number((cancelled.length / bookings.length).toFixed(3))
        : null,
      openJobs: (db.jobs || []).filter((job) => job.status === "open").length,
      demandByCategoryZone,
      supplyByCategory,
    },
  };
}
function qualifyReferral(db, account) {
  const profile = db.userProfiles[account.id];
  if (!profile?.referredBy || profile.referralRewardStatus === "qualified")
    return false;
  const referrer = db.userProfiles[profile.referredBy];
  if (!referrer) return false;
  profile.referralRewardStatus = "qualified";
  profile.referralQualifiedAt = new Date().toISOString();
  referrer.referralQualifiedCount =
    Number(referrer.referralQualifiedCount || 0) + 1;
  trackGrowthEvent(db, account, "referral.qualified", {
    referrerId: referrer.id,
  });
  return true;
}
function verifyToken(token) {
  try {
    const [content, signature] = String(token || "").split(".");
    if (!content || !signature) return null;
    const expected = createHmac("sha256", authSecret)
      .update(content)
      .digest("base64url");
    const received = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      received.length !== expectedBuffer.length ||
      !timingSafeEqual(received, expectedBuffer)
    )
      return null;
    const payload = JSON.parse(
      Buffer.from(content, "base64url").toString("utf8"),
    );
    return payload.exp > Date.now() &&
      typeof payload.sub === "string" &&
      Number.isInteger(payload.ver)
      ? payload
      : null;
  } catch {
    return null;
  }
}
function profileFor(db, account) {
  const existing = db.userProfiles[account.id];
  if (existing) {
    existing.email = account.email;
    existing.role = account.role;
    existing.verified = account.verified;
    return existing;
  }
  const profile = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    verified: account.verified,
    skill: "",
    hourlyRate: 0,
    balance: 0,
    escrow: 0,
    favorites: [],
    savedSearches: [],
    referralCode: referralCodeFor(account.id),
    referralQualifiedCount: 0,
  };
  db.userProfiles[account.id] = profile;
  return profile;
}
function professionalForAccount(db, account) {
  return db.professionals.find(
    (professional) =>
      professional.ownerId === account.id && !professional.archivedAt,
  );
}
function ownedProfessionalOrFail(req, res) {
  if (req.account.role !== "professional") {
    fail(res, "Solo una cuenta profesional puede realizar esta acción", 403);
    return null;
  }
  const professional = professionalForAccount(req.db, req.account);
  if (!professional) {
    fail(res, "Tu cuenta profesional aún no está vinculada a un perfil", 403);
    return null;
  }
  return professional;
}
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload) return fail(res, "Iniciá sesión para continuar", 401);
  const db = await database();
  const account = db.authUsers.find((item) => item.id === payload.sub);
  if (!account || account.tokenVersion !== payload.ver)
    return fail(res, "La sesión ya no es válida", 401);
  if (account.status === "blocked")
    return fail(res, "Esta cuenta estÃ¡ bloqueada", 403);
  req.account = account;
  req.profile = profileFor(db, account);
  req.db = db;
  next();
}
async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const payload = verifyToken(token);
  if (!payload) return fail(res, "Iniciá sesión como administrador", 401);
  const db = await database();
  const user = db.authUsers.find((item) => item.id === payload.sub);
  if (!user || user.role !== "admin" || user.tokenVersion !== payload.ver)
    return fail(res, "No tenés permisos de administrador", 403);
  if (user.status === "blocked")
    return fail(res, "Esta cuenta estÃ¡ bloqueada", 403);
  req.admin = user;
  next();
}
async function setupPostgres() {
  if (postgresReady) return;
  await applyMigrations(pool, root);
  postgresReady = true;
}
async function loadPostgresData() {
  const [
    platform,
    version,
    accounts,
    profiles,
    professionals,
    jobs,
    bookings,
    messages,
    transactions,
    reviews,
    verifications,
    auditLog,
    growthEvents,
    idempotencyKeys,
    notifications,
    webhookEvents,
  ] = await Promise.all([
    pool.query("SELECT payload FROM platform_settings WHERE id = 1"),
    pool.query("SELECT version FROM application_state_version WHERE id = 1"),
    pool.query(
      "SELECT id, name, email, role, verified, status, password_salt, password_hash, token_version, created_at FROM accounts",
    ),
    pool.query("SELECT account_id, payload FROM user_profiles"),
    pool.query("SELECT payload FROM professionals ORDER BY id"),
    pool.query("SELECT payload FROM jobs ORDER BY id"),
    pool.query("SELECT payload FROM bookings ORDER BY id"),
    pool.query("SELECT payload FROM messages ORDER BY id"),
    pool.query("SELECT payload FROM transactions ORDER BY id"),
    pool.query("SELECT payload FROM reviews ORDER BY id"),
    pool.query("SELECT payload FROM verifications ORDER BY id"),
    pool.query("SELECT payload FROM audit_log ORDER BY id DESC"),
    pool.query("SELECT payload FROM growth_events ORDER BY occurred_at DESC"),
    pool.query(
      "SELECT account_id, key, method, path, response_status, response_body, created_at FROM idempotency_keys WHERE created_at > now() - interval '24 hours'",
    ),
    pool.query(
      "SELECT id, account_id, type, title, body, read_at, created_at FROM notifications ORDER BY created_at DESC",
    ),
    pool.query(
      "SELECT event_id, processed_at FROM stripe_webhook_events WHERE processed_at > now() - interval '30 days'",
    ),
  ]);
  return {
    __version: Number(version.rows[0]?.version || 0),
    platform: platform.rows[0]?.payload,
    authUsers: accounts.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      verified: row.verified,
      status: row.status || "active",
      tokenVersion: row.token_version,
      password: { salt: row.password_salt, hash: row.password_hash },
      createdAt: row.created_at,
    })),
    userProfiles: Object.fromEntries(
      profiles.rows.map((row) => [row.account_id, row.payload]),
    ),
    professionals: professionals.rows.map((row) => row.payload),
    jobs: jobs.rows.map((row) => row.payload),
    bookings: bookings.rows.map((row) => row.payload),
    messages: messages.rows.map((row) => row.payload),
    transactions: transactions.rows.map((row) => row.payload),
    reviews: reviews.rows.map((row) => row.payload),
    verifications: verifications.rows.map((row) => row.payload),
    auditLog: auditLog.rows.map((row) => row.payload),
    growthEvents: growthEvents.rows.map((row) => row.payload),
    idempotencyKeys: idempotencyKeys.rows.map((row) => ({
      accountId: row.account_id,
      key: row.key,
      method: row.method,
      path: row.path,
      status: row.response_status,
      body: row.response_body,
      createdAt: row.created_at,
    })),
    notifications: notifications.rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      title: row.title,
      body: row.body,
      readAt: row.read_at,
      createdAt: row.created_at,
    })),
    webhookEvents: webhookEvents.rows.map((row) => ({
      id: row.event_id,
      processedAt: row.processed_at,
    })),
  };
}
async function insertPayloads(client, table, items, foreignKey) {
  for (const item of items || [])
    await client.query(
      `INSERT INTO ${table} (id, payload${foreignKey ? `, ${foreignKey.column}` : ""}) VALUES ($1, $2::jsonb${foreignKey ? ", $3" : ""}) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload${foreignKey ? `, ${foreignKey.column} = EXCLUDED.${foreignKey.column}` : ""}`,
      foreignKey
        ? [item.id, JSON.stringify(item), foreignKey.value(item)]
        : [item.id, JSON.stringify(item)],
    );
}
async function savePostgres(data) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE application_state_version SET version = version + 1, updated_at = now() WHERE id = 1 AND version = $1 RETURNING version",
      [Number(data.__version || 0)],
    );
    if (!updated.rowCount) {
      const error = new Error(
        "Los datos cambiaron. Actualizá e intentá nuevamente.",
      );
      error.code = "MBAPO_CONFLICT";
      throw error;
    }
    await client.query(
      "INSERT INTO platform_settings (id, payload, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
      [JSON.stringify(data.platform)],
    );
    for (const user of data.authUsers || [])
      await client.query(
        "INSERT INTO accounts (id, name, email, role, verified, status, password_salt, password_hash, token_version, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role, verified = EXCLUDED.verified, status = EXCLUDED.status, password_salt = EXCLUDED.password_salt, password_hash = EXCLUDED.password_hash, token_version = EXCLUDED.token_version",
        [
          user.id,
          user.name,
          user.email,
          user.role,
          Boolean(user.verified),
          user.status || "active",
          user.password.salt,
          user.password.hash,
          Number(user.tokenVersion || 0),
          user.createdAt || new Date().toISOString(),
        ],
      );
    for (const profile of Object.values(data.userProfiles || {}))
      await client.query(
        "INSERT INTO user_profiles (account_id, payload, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (account_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
        [profile.id, JSON.stringify(profile)],
      );
    await insertPayloads(client, "professionals", data.professionals, {
      column: "owner_account_id",
      value: (item) => item.ownerId || null,
    });
    await insertPayloads(client, "jobs", data.jobs, {
      column: "owner_account_id",
      value: (item) => item.ownerId || null,
    });
    await insertPayloads(client, "bookings", data.bookings, {
      column: "client_account_id",
      value: (item) => item.clientId || null,
    });
    for (const booking of data.bookings || [])
      await client.query(
        "UPDATE bookings SET professional_id = $2 WHERE id = $1",
        [booking.id, booking.professionalId || null],
      );
    await insertPayloads(client, "messages", data.messages, {
      column: "client_account_id",
      value: (item) => item.clientId || null,
    });
    for (const message of data.messages || [])
      await client.query(
        "UPDATE messages SET professional_id = $2 WHERE id = $1",
        [message.id, message.professionalId || null],
      );
    await insertPayloads(client, "transactions", data.transactions, {
      column: "account_id",
      value: (item) => item.userId || null,
    });
    for (const review of data.reviews || [])
      await client.query(
        "INSERT INTO reviews (id, payload, booking_id, account_id, professional_id) VALUES ($1,$2::jsonb,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, booking_id = EXCLUDED.booking_id, account_id = EXCLUDED.account_id, professional_id = EXCLUDED.professional_id",
        [
          review.id,
          JSON.stringify(review),
          review.bookingId || null,
          review.userId || null,
          review.professionalId || null,
        ],
      );
    await insertPayloads(client, "verifications", data.verifications, {
      column: "account_id",
      value: (item) => item.userId || null,
    });
    await insertPayloads(client, "audit_log", data.auditLog, {
      column: "actor_account_id",
      value: (item) =>
        (data.authUsers || []).some((user) => user.id === item.actorId)
          ? item.actorId
          : null,
    });
    await insertPayloads(client, "growth_events", data.growthEvents, {
      column: "actor_account_id",
      value: (item) =>
        (data.authUsers || []).some((user) => user.id === item.actorId)
          ? item.actorId
          : null,
    });
    await client.query(
      "DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'",
    );
    for (const record of data.idempotencyKeys || [])
      await client.query(
        "INSERT INTO idempotency_keys (account_id, key, method, path, response_status, response_body, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT (account_id, key, method, path) DO UPDATE SET response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body, created_at = EXCLUDED.created_at",
        [
          record.accountId,
          record.key,
          record.method,
          record.path,
          record.status,
          JSON.stringify(record.body),
          record.createdAt || new Date().toISOString(),
        ],
      );
    for (const notification of data.notifications || [])
      await client.query(
        "INSERT INTO notifications (id, account_id, type, title, body, read_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET read_at = EXCLUDED.read_at, title = EXCLUDED.title, body = EXCLUDED.body",
        [
          notification.id,
          notification.accountId,
          notification.type,
          notification.title,
          notification.body,
          notification.readAt || null,
          notification.createdAt || new Date().toISOString(),
        ],
      );
    await client.query(
      "DELETE FROM stripe_webhook_events WHERE processed_at < now() - interval '30 days'",
    );
    for (const event of data.webhookEvents || [])
      await client.query(
        "INSERT INTO stripe_webhook_events (event_id, processed_at) VALUES ($1,$2) ON CONFLICT (event_id) DO NOTHING",
        [event.id, event.processedAt || new Date().toISOString()],
      );
    data.__version = Number(updated.rows[0].version);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function database() {
  if (pool) {
    await setupPostgres();
    const data = await loadPostgresData();
    if (!data.authUsers.length) {
      const legacyTable = await pool.query(
        "SELECT to_regclass('public.mbapo_state') AS name",
      );
      let initial;
      if (legacyTable.rows[0]?.name) {
        const legacy = await pool.query(
          "SELECT payload FROM mbapo_state WHERE id = 1",
        );
        initial = legacy.rows[0]?.payload;
      }
      initial ||= {
        ...structuredClone(seed),
        authUsers: [
          toAuthUser(
            seed.user,
            process.env.MBAPO_DEMO_USER_PASSWORD || "mbapo-demo-2026",
          ),
        ],
        reviews: [],
        verifications: [],
      };
      ensureSystemData(initial);
      initial.__version = data.__version;
      await savePostgres(initial);
      return initial;
    }
    return ensureSystemData(data);
  }
  try {
    await access(dbPath, constants.F_OK);
  } catch {
    const initial = structuredClone(seed);
    initial.authUsers = [
      toAuthUser(
        initial.user,
        process.env.MBAPO_DEMO_USER_PASSWORD || "mbapo-demo-2026",
      ),
    ];
    initial.reviews = [];
    initial.verifications = [];
    await mkdir(dirname(dbPath), { recursive: true });
    await save(initial);
  }
  const data = JSON.parse(await readFile(dbPath, "utf8"));
  if (!data.authUsers)
    data.authUsers = [
      toAuthUser(
        data.user,
        process.env.MBAPO_DEMO_USER_PASSWORD || "mbapo-demo-2026",
      ),
    ];
  ensureSystemData(data);
  await save(data);
  return data;
}
async function save(data) {
  if (pool) return savePostgres(data);
  const temp = `${dbPath}.tmp`;
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(temp, JSON.stringify(data, null, 2));
  await rename(temp, dbPath);
}
function nextId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}
function initialsFor(name) {
  return String(name || "MB")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
function money(value) {
  return Number(String(value || 0).replace(/[^0-9]/g, "")) || 0;
}
function fail(res, message, status = 400) {
  return res.status(status).json({ error: message });
}
function replayIdempotentRequest(req, res) {
  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!key) return false;
  if (key.length < 8 || key.length > 160) {
    fail(res, "Idempotency-Key invÃ¡lido");
    return true;
  }
  const record = (req.db.idempotencyKeys || []).find(
    (item) =>
      item.accountId === req.account.id &&
      item.key === key &&
      item.method === req.method &&
      item.path === req.path,
  );
  if (!record) return false;
  res.setHeader("Idempotency-Replayed", "true");
  res.status(record.status).json(record.body);
  return true;
}
function rememberIdempotentResponse(req, status, body) {
  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!key) return;
  req.db.idempotencyKeys ||= [];
  req.db.idempotencyKeys = req.db.idempotencyKeys.filter(
    (item) =>
      new Date(item.createdAt).getTime() > Date.now() - 24 * 60 * 60 * 1000,
  );
  req.db.idempotencyKeys.push({
    accountId: req.account.id,
    key,
    method: req.method,
    path: req.path,
    status,
    body,
    createdAt: new Date().toISOString(),
  });
}
function persistedIdempotency(req, res) {
  const key = String(req.headers["idempotency-key"] || "").trim();
  if (!key) return null;
  if (key.length < 8 || key.length > 160) {
    fail(res, "Idempotency-Key invÃ¡lido");
    return false;
  }
  return {
    accountId: req.account.id,
    key,
    method: req.method,
    path: req.path,
  };
}
function persistedNotification(accountId, type, title, body) {
  return {
    id: `ntf-${randomBytes(10).toString("hex")}`,
    accountId,
    type,
    title,
    body,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}
function audit(db, account, action, entity, entityId, metadata = {}) {
  db.auditLog.unshift({
    id: nextId(db.auditLog),
    actorId: account?.id || "system",
    action,
    entity,
    entityId: String(entityId),
    metadata,
    createdAt: new Date().toISOString(),
  });
  db.auditLog.splice(1000);
}
function notify(db, accountId, type, title, body) {
  if (!accountId) return;
  db.notifications ||= [];
  db.notifications.unshift({
    id: `ntf-${randomBytes(10).toString("hex")}`,
    accountId,
    type,
    title,
    body,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
  db.notifications.splice(1000);
}
function loginAllowed(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, expires: now + 60000 };
  if (record.expires < now) {
    loginAttempts.delete(ip);
    return true;
  }
  return record.count < 8;
}
function recordLoginAttempt(ip, success) {
  if (success) return loginAttempts.delete(ip);
  const record = loginAttempts.get(ip) || {
    count: 0,
    expires: Date.now() + 60000,
  };
  record.count += 1;
  loginAttempts.set(ip, record);
}

app.get("/api/health", async (_req, res) => {
  try {
    if (pool) await pool.query("SELECT 1");
    res.json({
      ok: true,
      storage: pool ? "postgres" : "json",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  } catch {
    res.status(503).json({ ok: false, error: "Base de datos no disponible" });
  }
});
app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const referralCode = String(req.body.referralCode || "")
    .trim()
    .toUpperCase();
  if (name.length < 2 || name.length > 80)
    return fail(res, "Ingresá un nombre válido");
  if (!/^\S+@\S+\.\S+$/.test(email))
    return fail(res, "Ingresá un correo válido");
  if (password.length < 10)
    return fail(res, "La contraseña debe tener al menos 10 caracteres");
  if (referralCode && !/^MB-[A-Z0-9]{1,16}$/.test(referralCode))
    return fail(res, "El código de referido no tiene un formato válido");
  const db = await database();
  if (db.authUsers.some((user) => user.email === email))
    return fail(res, "Ya existe una cuenta con ese correo", 409);
  const referrer = referralCode
    ? Object.values(db.userProfiles).find(
        (profile) => profile.referralCode === referralCode,
      )
    : null;
  if (referralCode && !referrer)
    return fail(res, "El código de referido no es válido", 400);
  const user = {
    id: `usr-${randomBytes(8).toString("hex")}`,
    name,
    email,
    role: "client",
    verified: false,
    tokenVersion: 0,
    password: passwordRecord(password),
    createdAt: new Date().toISOString(),
  };
  db.authUsers.push(user);
  const profile = profileFor(db, user);
  if (referrer) {
    profile.referredBy = referrer.id;
    profile.referralRewardStatus = "pending";
  }
  trackGrowthEvent(db, user, "account.registered", {
    channel: referrer ? "referral" : "direct",
  });
  await save(db);
  const token = signToken({
    sub: user.id,
    ver: user.tokenVersion,
    exp: Date.now() + 86400000,
  });
  res.status(201).json({ token, user: publicUser(user) });
});
app.post("/api/auth/login", async (req, res) => {
  const ip = req.ip || "unknown";
  if (!loginAllowed(ip))
    return fail(res, "Demasiados intentos. Esperá un minuto.", 429);
  const email = String(req.body.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body.password || "");
  const db = await database();
  const user = db.authUsers.find((item) => item.email === email);
  const valid = user && validPassword(password, user.password);
  recordLoginAttempt(ip, valid);
  if (!valid) return fail(res, "Correo o contraseña incorrectos", 401);
  res.json({
    token: signToken({
      sub: user.id,
      ver: user.tokenVersion || 0,
      exp: Date.now() + 86400000,
    }),
    user: publicUser(user),
  });
});
app.post("/api/auth/logout", requireAuth, async (req, res) => {
  req.account.tokenVersion = Number(req.account.tokenVersion || 0) + 1;
  audit(req.db, req.account, "account.logged_out", "account", req.account.id);
  await save(req.db);
  res.status(204).end();
});
app.post("/api/auth/refresh", requireAuth, (req, res) => {
  res.json({
    token: signToken({
      sub: req.account.id,
      ver: req.account.tokenVersion || 0,
      exp: Date.now() + 86400000,
    }),
    user: publicUser(req.account),
  });
});
const professionalInput = z.object({
  name: z.string().min(2).max(80),
  role: z.string().min(2).max(100),
  price: z.coerce.number().int().min(0).max(100000000),
  distance: z.string().max(30).optional(),
  available: z.boolean().optional(),
  tags: z.array(z.string().max(30)).max(8).optional(),
  text: z.string().max(400).optional(),
});
const availabilitySlotInput = z
  .object({
    day: z.coerce.number().int().min(0).max(6),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .refine(
    (slot) => timeToMinutes(slot.start) < timeToMinutes(slot.end),
    "El horario de fin debe ser posterior al de inicio",
  );
const professionalOnboardingInput = z.object({
  role: z.string().trim().min(2).max(100),
  price: z.coerce.number().int().positive().max(100000000),
  tags: z.array(z.string().trim().min(2).max(30)).min(1).max(8),
  serviceAreas: z.array(z.string().trim().min(2).max(60)).min(1).max(10),
  text: z.string().trim().min(20).max(400),
  availability: z.array(availabilitySlotInput).min(1).max(28),
});
const jobInput = z.object({
  title: z.string().min(3).max(140),
  category: z.string().min(2).max(50),
  budget: z.string().max(80),
  place: z.string().max(90),
  date: z.string().max(70),
  urgent: z.boolean().optional(),
});
const bookingInput = z.object({
  professionalId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().min(3).max(80),
  place: z.string().trim().min(4).max(120),
  amount: z.coerce.number().int().positive().max(100000000).optional(),
});
const withdrawalInput = z.object({
  amount: z.coerce.number().int().positive().max(100000000),
});
app.post("/api/professional/onboarding", requireAuth, async (req, res) => {
  const input = professionalOnboardingInput.safeParse(req.body);
  if (!input.success) return fail(res, "Datos profesionales invÃ¡lidos");
  const db = req.db;
  const existing = professionalForAccount(db, req.account);
  if (existing) {
    Object.assign(existing, input.data, {
      available: true,
      initials: existing.initials || initialsFor(req.account.name),
      color: existing.color || "#4f8c78",
    });
    await save(db);
    return res.json({ professional: existing, user: publicUser(req.account) });
  }
  if (req.account.role !== "client")
    return fail(res, "Esta cuenta no puede iniciar el onboarding", 409);
  const professional = {
    id: nextId(db.professionals),
    ownerId: req.account.id,
    name: req.profile.name,
    initials: initialsFor(req.profile.name),
    color: "#4f8c78",
    rating: 0,
    jobs: 0,
    verified: false,
    available: true,
    distance: "Zona a definir",
    ...input.data,
    createdAt: new Date().toISOString(),
  };
  db.professionals.push(professional);
  req.account.role = "professional";
  req.account.tokenVersion = Number(req.account.tokenVersion || 0) + 1;
  profileFor(db, req.account);
  audit(
    db,
    req.account,
    "professional.onboarded",
    "professional",
    professional.id,
  );
  await save(db);
  res.status(201).json({
    professional,
    token: signToken({
      sub: req.account.id,
      ver: req.account.tokenVersion,
      exp: Date.now() + 86400000,
    }),
    user: publicUser(req.account),
  });
});
app.get("/api/professional/profile", requireAuth, async (req, res) => {
  const professional = ownedProfessionalOrFail(req, res);
  if (professional) res.json(professional);
});
app.put("/api/professional/availability", requireAuth, async (req, res) => {
  const professional = ownedProfessionalOrFail(req, res);
  if (!professional) return;
  const input = z
    .array(availabilitySlotInput)
    .min(1)
    .max(28)
    .safeParse(req.body);
  if (!input.success) return fail(res, "Disponibilidad invÃ¡lida");
  professional.availability = input.data;
  audit(
    req.db,
    req.account,
    "professional.availability_updated",
    "professional",
    professional.id,
  );
  await save(req.db);
  res.json({ availability: professional.availability });
});
app.get("/api/admin/state", requireAdmin, async (_req, res) => {
  const db = await database();
  res.json({
    platform: db.platform,
    professionals: db.professionals,
    jobs: db.jobs,
    users: db.authUsers.map(publicUser),
    reviews: db.reviews,
    verifications: db.verifications,
    bookings: db.bookings,
    transactions: db.transactions,
  });
});
app.get("/api/admin/users", requireAdmin, async (req, res) => {
  const query = String(req.query.query || "")
    .trim()
    .slice(0, 100);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  if (accountsRepository) {
    const result = await accountsRepository.findPage({ query, page, limit });
    return res.json({
      items: result.items,
      page,
      limit,
      total: result.total,
    });
  }
  const db = await database();
  const normalized = query.toLocaleLowerCase("es-PY");
  const items = db.authUsers.filter((user) =>
    `${user.name} ${user.email} ${user.role} ${user.status || "active"}`
      .toLocaleLowerCase("es-PY")
      .includes(normalized),
  );
  res.json({
    items: items.slice((page - 1) * limit, page * limit).map(publicUser),
    page,
    limit,
    total: items.length,
  });
});
app.put("/api/admin/platform", requireAdmin, async (req, res) => {
  const schema = z.object({
    commissionRate: z.coerce.number().min(0).max(50),
    currency: z.string().length(3),
    supportEmail: z.string().email(),
    categories: z.array(z.string().min(2).max(40)).min(1).max(30),
    content: z.object({
      heroEyebrow: z.string().max(100),
      heroTitle: z.string().max(160),
      heroDescription: z.string().max(300),
    }),
  });
  const result = schema.safeParse(req.body);
  if (!result.success) return fail(res, "Configuración inválida");
  const db = await database();
  db.platform = result.data;
  await save(db);
  res.json(db.platform);
});
app.post("/api/admin/professionals", requireAdmin, async (req, res) => {
  const result = professionalInput.safeParse(req.body);
  if (!result.success) return fail(res, "Datos del profesional inválidos");
  const db = await database();
  const professional = {
    id: nextId(db.professionals),
    initials: result.data.name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase(),
    color: "#4f8c78",
    rating: 0,
    jobs: 0,
    verified: false,
    ...result.data,
    distance: result.data.distance || "Sin ubicación",
    available: result.data.available ?? true,
    tags: result.data.tags || [],
    text: result.data.text || "",
  };
  db.professionals.push(professional);
  await save(db);
  res.status(201).json(professional);
});
app.put("/api/admin/professionals/:id", requireAdmin, async (req, res) => {
  const result = professionalInput.safeParse(req.body);
  if (!result.success) return fail(res, "Datos del profesional inválidos");
  const db = await database();
  const professional = db.professionals.find(
    (item) => item.id === Number(req.params.id),
  );
  if (!professional) return fail(res, "Profesional no encontrado", 404);
  Object.assign(professional, result.data);
  await save(db);
  res.json(professional);
});
app.patch(
  "/api/admin/professionals/:id/owner",
  requireAdmin,
  async (req, res) => {
    const input = z
      .object({ accountId: z.string().min(1).max(100).nullable() })
      .safeParse(req.body);
    if (!input.success) return fail(res, "Vinculación de profesional inválida");
    const db = await database();
    const professional = db.professionals.find(
      (item) => item.id === Number(req.params.id),
    );
    if (!professional) return fail(res, "Profesional no encontrado", 404);
    const account = input.data.accountId
      ? db.authUsers.find((user) => user.id === input.data.accountId)
      : null;
    if (input.data.accountId && !account)
      return fail(res, "Cuenta no encontrada", 404);
    if (account?.role !== "professional")
      return fail(res, "La cuenta debe tener rol profesional", 409);
    if (
      account &&
      db.professionals.some(
        (item) => item.ownerId === account.id && item.id !== professional.id,
      )
    )
      return fail(res, "La cuenta ya está vinculada a otro perfil", 409);
    professional.ownerId = account?.id || null;
    audit(
      db,
      req.admin,
      "professional.owner_changed",
      "professional",
      professional.id,
      { accountId: professional.ownerId },
    );
    await save(db);
    res.json({ id: professional.id, ownerId: professional.ownerId });
  },
);
app.delete("/api/admin/professionals/:id", requireAdmin, async (req, res) => {
  const db = await database();
  const professional = db.professionals.find(
    (item) => item.id === Number(req.params.id),
  );
  if (!professional) return fail(res, "Profesional no encontrado", 404);
  professional.available = false;
  professional.archivedAt = new Date().toISOString();
  audit(
    db,
    req.admin,
    "professional.archived",
    "professional",
    professional.id,
  );
  await save(db);
  res.json({ archived: professional.id });
});
app.post("/api/admin/jobs", requireAdmin, async (req, res) => {
  const result = jobInput.safeParse(req.body);
  if (!result.success) return fail(res, "Datos del trabajo inválidos");
  const db = await database();
  const job = {
    id: nextId(db.jobs),
    owner: req.admin.name,
    applicants: 0,
    createdAt: new Date().toISOString(),
    ...result.data,
    urgent: result.data.urgent ?? false,
  };
  db.jobs.unshift(job);
  await save(db);
  res.status(201).json(job);
});
app.put("/api/admin/jobs/:id", requireAdmin, async (req, res) => {
  const result = jobInput.safeParse(req.body);
  if (!result.success) return fail(res, "Datos del trabajo inválidos");
  const db = await database();
  const job = db.jobs.find((item) => item.id === Number(req.params.id));
  if (!job) return fail(res, "Trabajo no encontrado", 404);
  Object.assign(job, result.data);
  await save(db);
  res.json(job);
});
app.delete("/api/admin/jobs/:id", requireAdmin, async (req, res) => {
  const db = await database();
  const job = db.jobs.find((item) => item.id === Number(req.params.id));
  if (!job) return fail(res, "Trabajo no encontrado", 404);
  job.status = "archived";
  job.archivedAt = new Date().toISOString();
  audit(db, req.admin, "job.archived", "job", job.id);
  await save(db);
  res.json({ archived: job.id });
});
app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  const status = String(req.body.status || "");
  const allowed = [
    "Profesional confirmado",
    "Trabajo en curso",
    "Esperando tu confirmación",
    "Cancelada",
  ];
  if (!allowed.includes(status)) return fail(res, "Estado no válido");
  const db = await database();
  const booking = db.bookings.find((item) => item.id === Number(req.params.id));
  if (!booking) return fail(res, "Reserva no encontrada", 404);
  if (
    status === "Esperando tu confirmación" &&
    booking.paymentStatus !== "authorized" &&
    booking.paymentStatus !== "demo_authorized"
  )
    return fail(
      res,
      "El pago debe estar autorizado antes de solicitar confirmación",
    );
  booking.status = status;
  booking.timeline ||= [];
  booking.timeline.push({
    status,
    at: new Date().toISOString(),
    by: req.admin.id,
  });
  audit(db, req.admin, "booking.status_changed", "booking", booking.id, {
    status,
  });
  await save(db);
  res.json(booking);
});
app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const input = z
    .object({
      role: z.enum(["client", "professional", "admin"]).optional(),
      verified: z.boolean().optional(),
      status: z.enum(["active", "blocked"]).optional(),
    })
    .safeParse(req.body);
  if (!input.success) return fail(res, "Cambio de usuario inválido");
  const db = await database();
  const user = db.authUsers.find((item) => item.id === req.params.id);
  if (!user) return fail(res, "Usuario no encontrado", 404);
  const roleChanged = input.data.role && input.data.role !== user.role;
  const statusChanged = input.data.status && input.data.status !== user.status;
  Object.assign(user, input.data);
  if (roleChanged || statusChanged)
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  audit(db, req.admin, "user.updated", "account", user.id, {
    ...input.data,
    tokenVersionRotated: Boolean(roleChanged || statusChanged),
  });
  await save(db);
  res.json(publicUser(user));
});
app.get("/api/admin/audit", requireAdmin, async (_req, res) => {
  const db = await database();
  res.json(db.auditLog.slice(0, 200));
});
app.get("/api/admin/metrics", requireAdmin, async (_req, res) => {
  const db = await database();
  res.json(growthMetrics(db));
});
app.get("/api/metrics", requireAdmin, (_req, res) => {
  res.json({
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    requests: observability.metrics,
    storage: pool ? "postgres" : "json",
  });
});
app.get("/api/admin/verifications", requireAdmin, async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const status = String(req.query.status || "");
  if (verificationsRepository) {
    const result = await verificationsRepository.listForAdmin({
      status,
      page,
      limit,
    });
    return res.json({ ...result, page, limit });
  }
  const items = (req.db?.verifications || (await database()).verifications)
    .filter((item) => !status || item.status === status)
    .sort(
      (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
    );
  res.json({
    items: items.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: items.length,
  });
});
app.patch("/api/admin/verifications/:id", requireAdmin, async (req, res) => {
  const input = z
    .object({ status: z.enum(["approved", "rejected"]) })
    .safeParse(req.body);
  if (!input.success)
    return fail(res, "ResoluciÃ³n de verificaciÃ³n invÃ¡lida");
  const db = await database();
  const verification = db.verifications.find(
    (item) => item.id === Number(req.params.id),
  );
  if (!verification) return fail(res, "Solicitud no encontrada", 404);
  if (verification.status !== "pending")
    return fail(res, "La solicitud ya fue resuelta", 409);
  verification.status = input.data.status;
  verification.reviewedAt = new Date().toISOString();
  verification.reviewedBy = req.admin.id;
  const account = db.authUsers.find((user) => user.id === verification.userId);
  if (input.data.status === "approved" && account) {
    if (verification.kind === "identity") account.verified = true;
    if (verification.kind === "professional") {
      const professional = professionalForAccount(db, account);
      if (professional) professional.verified = true;
    }
  }
  audit(
    db,
    req.admin,
    "verification.reviewed",
    "verification",
    verification.id,
    {
      status: verification.status,
    },
  );
  notify(
    db,
    verification.userId,
    "verification.reviewed",
    "VerificaciÃ³n actualizada",
    `Tu solicitud de verificaciÃ³n fue ${verification.status === "approved" ? "aprobada" : "rechazada"}.`,
  );
  await save(db);
  res.json(verification);
});
app.get("/api/professionals", async (req, res) => {
  const q = String(req.query.q || "").toLocaleLowerCase("es-PY");
  const maxPrice = Number(req.query.maxPrice) || Infinity;
  const maxDistance = Number(req.query.maxDistance) || Infinity;
  const minRating = Number(req.query.minRating) || 0;
  const verified = req.query.verified === "true";
  const available = req.query.available === "true";
  const terms = q
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const sort = String(req.query.sort || "rating");
  const directionName = req.query.direction === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
  if (!["rating", "price", "distance", "name"].includes(sort))
    return fail(res, "Criterio de ordenamiento no vÃƒÂ¡lido");
  if (catalogRepository) {
    const result = await catalogRepository.professionals({
      terms,
      maxPrice,
      maxDistance,
      minRating,
      verified,
      available,
      sort,
      direction: directionName,
      page,
      limit,
    });
    res.setHeader("X-Total-Count", String(result.total));
    res.setHeader("X-Page", String(page));
    res.setHeader("X-Page-Size", String(limit));
    return res.json(result.items);
  }
  const db = await database();
  const results = db.professionals.filter((pro) => {
    const content =
      `${pro.name} ${pro.role} ${(pro.tags || []).join(" ")} ${pro.text || ""}`
        .toLocaleLowerCase("es-PY")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const km = Number.parseFloat(pro.distance) || 9999;
    return (
      terms.every((term) => content.includes(term)) &&
      pro.price <= maxPrice &&
      km <= maxDistance &&
      pro.rating >= minRating &&
      (!verified || pro.verified) &&
      (!available || pro.available)
    );
  });
  const direction = directionName === "asc" ? 1 : -1;
  const sortValue = {
    rating: (item) => item.rating || 0,
    price: (item) => item.price || 0,
    distance: (item) => Number.parseFloat(item.distance) || Infinity,
    name: (item) => item.name || "",
  }[sort];
  if (!sortValue) return fail(res, "Criterio de ordenamiento no vÃ¡lido");
  results.sort((left, right) => {
    const first = sortValue(left);
    const second = sortValue(right);
    return typeof first === "string"
      ? direction * first.localeCompare(second, "es-PY")
      : direction * (first - second);
  });
  res.setHeader("X-Total-Count", String(results.length));
  res.setHeader("X-Page", String(page));
  res.setHeader("X-Page-Size", String(limit));
  res.json(results.slice((page - 1) * limit, page * limit));
});
app.get("/api/jobs", async (req, res) => {
  const categoryInput = String(req.query.category || "");
  const category = categoryInput.toLocaleLowerCase("es-PY");
  const sort = String(req.query.sort || "recent");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
  if (!["recent", "budget"].includes(sort))
    return fail(res, "Criterio de ordenamiento invÃ¡lido");
  if (catalogRepository) {
    const result = await catalogRepository.jobs({
      category: categoryInput,
      sort,
      page,
      limit,
    });
    res.setHeader("X-Total-Count", String(result.total));
    res.setHeader("X-Page", String(page));
    res.setHeader("X-Page-Size", String(limit));
    return res.json(result.items);
  }
  const db = await database();
  const jobs = (db.jobs || [])
    .filter(
      (job) =>
        job.status !== "archived" &&
        (!category || job.category?.toLocaleLowerCase("es-PY") === category),
    )
    .sort((left, right) => {
      if (sort === "budget") return money(right.budget) - money(left.budget);
      return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    });
  if (!["recent", "budget"].includes(sort))
    return fail(res, "Criterio de ordenamiento no vÃ¡lido");
  res.setHeader("X-Total-Count", String(jobs.length));
  res.setHeader("X-Page", String(page));
  res.setHeader("X-Page-Size", String(limit));
  res.json(jobs.slice((page - 1) * limit, page * limit));
});
app.get("/api/dashboard", requireAuth, async (req, res) => {
  const db = req.db;
  const favoriteTags = (req.profile.favorites || []).flatMap(
    (id) =>
      db.professionals.find((professional) => professional.id === id)?.tags ||
      [],
  );
  const recommendations = [...(db.professionals || [])]
    .filter(
      (professional) => professional.available && !professional.archivedAt,
    )
    .sort((left, right) => {
      const score = (professional) =>
        professional.rating * 10 +
        (professional.verified ? 5 : 0) +
        (req.profile.favorites || []).includes(professional.id) * 6 +
        (professional.tags || []).filter((tag) => favoriteTags.includes(tag))
          .length;
      return score(right) - score(left);
    })
    .slice(0, 3);
  const platform = db.platform
    ? {
        currency: db.platform.currency,
        categories: db.platform.categories,
        content: db.platform.content,
        commissionRate: db.platform.commissionRate,
      }
    : undefined;
  const bookings = bookingsRepository
    ? await bookingsRepository.listForClient(req.account.id)
    : (db.bookings || []).filter((item) => item.clientId === req.account.id);
  res.json({
    platform,
    professionals: db.professionals || [],
    recommendations,
    jobs: (db.jobs || []).filter((job) => job.status !== "archived"),
    reviews: db.reviews || [],
    user: req.profile,
    transactions: (db.transactions || []).filter(
      (item) => item.userId === req.account.id,
    ),
    bookings,
    messages: (db.messages || []).filter(
      (item) => item.clientId === req.account.id,
    ),
  });
});
app.get("/api/referrals", requireAuth, async (req, res) => {
  res.json({
    code: req.profile.referralCode,
    status: req.profile.referralRewardStatus || "none",
    qualifiedCount: Number(req.profile.referralQualifiedCount || 0),
  });
});
app.get("/api/notifications", requireAuth, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const items = notificationsRepository
    ? await notificationsRepository.list(req.account.id, limit)
    : (req.db.notifications || [])
        .filter((item) => item.accountId === req.account.id)
        .sort(
          (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
        )
        .slice(0, limit);
  res.json({
    items,
    unread: items.filter((item) => !item.readAt).length,
  });
});
app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
  if (notificationsRepository) {
    const notification = await notificationsRepository.markRead(
      req.params.id,
      req.account.id,
    );
    if (!notification) return fail(res, "NotificaciÃ³n no encontrada", 404);
    return res.json(notification);
  }
  const notification = (req.db.notifications || []).find(
    (item) => item.id === req.params.id && item.accountId === req.account.id,
  );
  if (!notification) return fail(res, "NotificaciÃ³n no encontrada", 404);
  notification.readAt ||= new Date().toISOString();
  await save(req.db);
  res.json(notification);
});
app.post("/api/events", requireAuth, async (req, res) => {
  const input = z
    .object({
      name: z.enum([
        "catalog.searched",
        "professional.viewed",
        "referral.shared",
        "saved_search.created",
      ]),
      category: z.string().trim().max(50).optional(),
      zone: z.string().trim().max(60).optional(),
    })
    .safeParse(req.body);
  if (!input.success) return fail(res, "Evento de producto inválido");
  trackGrowthEvent(req.db, req.account, input.data.name, {
    category: input.data.category,
    zone: input.data.zone,
  });
  await save(req.db);
  res.status(204).end();
});
app.patch("/api/profile", requireAuth, async (req, res) => {
  const { name, skill, hourlyRate } = req.body;
  if (name !== undefined) req.body.name = String(name).trim().slice(0, 80);
  const db = req.db;
  Object.assign(req.profile, {
    ...(req.body.name ? { name: req.body.name } : {}),
    ...(skill ? { skill: String(skill).slice(0, 80) } : {}),
    ...(hourlyRate ? { hourlyRate: money(hourlyRate) } : {}),
  });
  await save(db);
  res.json(req.profile);
});
app.post("/api/favorites/:professionalId", requireAuth, async (req, res) => {
  const id = Number(req.params.professionalId);
  const db = req.db;
  if (!db.professionals.some((p) => p.id === id))
    return fail(res, "Profesional no encontrado", 404);
  const favorites = req.profile.favorites;
  const index = favorites.indexOf(id);
  if (index >= 0) favorites.splice(index, 1);
  else favorites.push(id);
  await save(db);
  res.json({ favorites });
});
app.get("/api/saved-searches", requireAuth, async (req, res) => {
  res.json(req.profile.savedSearches || []);
});
app.post("/api/saved-searches", requireAuth, async (req, res) => {
  const input = z
    .object({
      query: z.string().trim().max(100).default(""),
      category: z.string().trim().max(50).default("Todos"),
      filters: z
        .object({
          available: z.boolean().optional(),
          verified: z.boolean().optional(),
          minRating: z.coerce.number().min(0).max(5).optional(),
          maxPrice: z.coerce.number().int().min(0).max(100000000).optional(),
        })
        .optional(),
    })
    .safeParse(req.body);
  if (!input.success) return fail(res, "Búsqueda guardada inválida");
  if (!input.data.query && input.data.category === "Todos")
    return fail(res, "Elegí una búsqueda o categoría antes de guardar");
  const searches = req.profile.savedSearches || [];
  const duplicate = searches.some(
    (search) =>
      search.query === input.data.query &&
      search.category === input.data.category &&
      JSON.stringify(search.filters || {}) ===
        JSON.stringify(input.data.filters || {}),
  );
  if (duplicate) return fail(res, "Esa búsqueda ya está guardada", 409);
  const search = {
    id: `search-${randomBytes(6).toString("hex")}`,
    ...input.data,
    createdAt: new Date().toISOString(),
  };
  searches.unshift(search);
  searches.splice(10);
  req.profile.savedSearches = searches;
  trackGrowthEvent(req.db, req.account, "saved_search.created", {
    category: search.category,
  });
  await save(req.db);
  res.status(201).json(search);
});
app.delete("/api/saved-searches/:id", requireAuth, async (req, res) => {
  const searches = req.profile.savedSearches || [];
  const index = searches.findIndex((search) => search.id === req.params.id);
  if (index < 0) return fail(res, "Búsqueda guardada no encontrada", 404);
  searches.splice(index, 1);
  await save(req.db);
  res.status(204).end();
});
app.post("/api/jobs", requireAuth, async (req, res) => {
  const input = z
    .object({
      title: z.string().trim().min(3).max(140),
      category: z.string().trim().min(2).max(50),
      budget: z.union([z.string().max(80), z.number()]).optional(),
      details: z.string().max(1000).optional(),
      place: z.string().trim().min(2).max(90).default("Asunción, Paraguay"),
      date: z.string().trim().min(2).max(70).default("Fecha a coordinar"),
      urgent: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!input.success) return fail(res, "Datos del trabajo inválidos");
  const { title, category, budget, details, place, date, urgent } = input.data;
  const db = req.db;
  const job = {
    id: nextId(db.jobs),
    title,
    category,
    place,
    budget: budget
      ? `Gs. ${money(budget).toLocaleString("es-PY")}`
      : "A convenir",
    details: details || "",
    date,
    owner: req.profile.name,
    ownerId: req.account.id,
    applicants: 0,
    applicantIds: [],
    urgent: Boolean(urgent),
    status: "open",
    createdAt: new Date().toISOString(),
  };
  db.jobs.unshift(job);
  audit(db, req.account, "job.created", "job", job.id);
  trackGrowthEvent(db, req.account, "job.created", {
    category: job.category,
    zone: job.place,
  });
  await save(db);
  res.status(201).json(job);
});
app.post("/api/jobs/:jobId/applications", requireAuth, async (req, res) => {
  const db = req.db;
  const job = db.jobs.find((item) => item.id === Number(req.params.jobId));
  if (!job || job.status === "archived")
    return fail(res, "Trabajo no encontrado", 404);
  if (req.account.role !== "professional")
    return fail(res, "Solo una cuenta profesional puede postularse", 403);
  job.applicantIds ||= [];
  if (
    job.ownerId === req.account.id ||
    job.applicantIds.includes(req.account.id)
  )
    return fail(res, "Ya existe una postulación para este trabajo", 409);
  job.applicantIds.push(req.account.id);
  job.applicants = job.applicantIds.length;
  audit(db, req.account, "job.application_created", "job", job.id);
  await save(db);
  res.status(201).json({ job, message: "Postulación enviada" });
});
app.get("/api/professional/dashboard", requireAuth, async (req, res) => {
  const professional = ownedProfessionalOrFail(req, res);
  if (!professional) return;
  const bookingItems = bookingsRepository
    ? await bookingsRepository.listForProfessional(professional.id)
    : req.db.bookings.filter(
        (booking) => booking.professionalId === professional.id,
      );
  const bookings = bookingItems.map((booking) => ({
    ...booking,
    place: booking.status === "Esperando respuesta" ? undefined : booking.place,
    client: req.db.userProfiles[booking.clientId]
      ? { name: req.db.userProfiles[booking.clientId].name }
      : undefined,
  }));
  const conversations = req.db.messages.filter(
    (message) => message.professionalId === professional.id,
  );
  const applications = req.db.jobs.filter((job) =>
    (job.applicantIds || []).includes(req.account.id),
  );
  res.json({ professional, bookings, conversations, applications });
});
app.patch(
  "/api/professional/bookings/:bookingId/status",
  requireAuth,
  async (req, res) => {
    const professional = ownedProfessionalOrFail(req, res);
    if (!professional) return;
    const status = String(req.body.status || "");
    const booking = req.db.bookings.find(
      (item) =>
        item.id === Number(req.params.bookingId) &&
        item.professionalId === professional.id,
    );
    if (!booking) return fail(res, "Reserva no encontrada", 404);
    const allowedTransitions = {
      "Esperando respuesta": ["Profesional confirmado", "Cancelada"],
      "Profesional confirmado": ["Trabajo en curso", "Cancelada"],
      "Trabajo en curso": ["Esperando tu confirmación"],
    };
    if (!(allowedTransitions[booking.status] || []).includes(status))
      return fail(res, "No podés realizar ese cambio de estado", 409);
    if (
      ["Trabajo en curso", "Esperando tu confirmación"].includes(status) &&
      !["authorized", "demo_authorized"].includes(booking.paymentStatus)
    )
      return fail(res, "El pago debe estar autorizado antes de iniciar", 409);
    if (status === "Cancelada" && booking.paymentStatus !== "unpaid")
      return fail(
        res,
        "No podés cancelar una reserva con pago autorizado desde este flujo",
        409,
      );
    booking.status = status;
    booking.timeline ||= [];
    booking.timeline.push({
      status,
      at: new Date().toISOString(),
      by: req.account.id,
    });
    audit(
      req.db,
      req.account,
      "booking.status_changed",
      "booking",
      booking.id,
      { status, actor: "professional" },
    );
    notify(
      req.db,
      booking.clientId,
      "booking.status_changed",
      "ActualizaciÃ³n de tu reserva",
      `${professional.name} marcÃ³ tu reserva como ${status}.`,
    );
    await save(req.db);
    res.json(booking);
  },
);
app.post("/api/bookings", requireAuth, async (req, res) => {
  if (replayIdempotentRequest(req, res)) return;
  const input = bookingInput.safeParse(req.body);
  if (!input.success) return fail(res, "Datos de reserva inválidos");
  if (req.account.role !== "client")
    return fail(res, "Solo una cuenta cliente puede crear reservas", 403);
  const db = req.db;
  const professional = db.professionals.find(
    (p) => p.id === input.data.professionalId,
  );
  if (!professional || !professional.available)
    return fail(res, "Profesional no disponible", 404);
  const requestedRange = bookingRange(input.data.time);
  if (!requestedRange) return fail(res, "El horario de reserva no es vÃ¡lido");
  if (!isProfessionalAvailable(professional, input.data.date, requestedRange))
    return fail(res, "El profesional no atiende en esa franja", 409);
  if (
    new Date(`${input.data.date}T00:00:00`).getTime() <
    new Date().setHours(0, 0, 0, 0)
  )
    return fail(res, "Elegí una fecha futura");
  if (
    db.bookings.some((item) => {
      const existingRange = bookingRange(item.time);
      return (
        item.professionalId === professional.id &&
        item.date === input.data.date &&
        existingRange &&
        bookingOverlaps(existingRange, requestedRange) &&
        !["Cancelada", "Completada"].includes(item.status)
      );
    })
  )
    return fail(res, "Ese horario ya no está disponible", 409);
  const amount = input.data.amount || professional.price * 2;
  const booking = {
    id: nextId(db.bookings),
    professionalId: professional.id,
    clientId: req.account.id,
    title: `Servicio con ${professional.name}`,
    date: input.data.date,
    time: input.data.time,
    status: "Esperando respuesta",
    paymentStatus: "unpaid",
    place: input.data.place,
    amount,
    timeline: [{ status: "Esperando respuesta", at: new Date().toISOString() }],
  };
  db.bookings.push(booking);
  notify(
    db,
    professional.ownerId,
    "booking.created",
    "Nueva solicitud de reserva",
    `${req.profile.name} solicitó ${booking.date} · ${booking.time}.`,
  );
  audit(db, req.account, "booking.created", "booking", booking.id);
  trackGrowthEvent(db, req.account, "booking.created", {
    category: professional.role,
    zone: booking.place,
  });
  rememberIdempotentResponse(req, 201, booking);
  await save(db);
  res.status(201).json(booking);
});
app.patch("/api/bookings/:bookingId/status", requireAuth, async (req, res) => {
  const status = String(req.body.status || "");
  const db = req.db;
  const booking = db.bookings.find(
    (item) =>
      item.id === Number(req.params.bookingId) &&
      item.clientId === req.account.id,
  );
  if (!booking) return fail(res, "Reserva no encontrada", 404);
  const allowedTransitions = {
    "Esperando respuesta": ["Cancelada"],
    "Profesional confirmado": ["Cancelada"],
    "Esperando tu confirmación": ["Finalizado", "Disputa abierta"],
  };
  if (!(allowedTransitions[booking.status] || []).includes(status))
    return fail(res, "No podés realizar ese cambio de estado", 409);
  if (
    status === "Finalizado" &&
    booking.paymentStatus !== "authorized" &&
    booking.paymentStatus !== "demo_authorized"
  )
    return fail(res, "El pago debe estar autorizado antes de finalizar", 409);
  booking.status = status;
  booking.timeline ||= [];
  booking.timeline.push({ status, at: new Date().toISOString() });
  audit(db, req.account, "booking.status_changed", "booking", booking.id, {
    status,
  });
  const professional = db.professionals.find(
    (item) => item.id === booking.professionalId,
  );
  notify(
    db,
    professional?.ownerId,
    "booking.status_changed",
    "ActualizaciÃ³n de reserva",
    `${req.profile.name} marcÃ³ la reserva como ${status}.`,
  );
  if (status === "Finalizado") qualifyReferral(db, req.account);
  await save(db);
  res.json(booking);
});
app.post("/api/payments/intents", requireAuth, async (req, res) => {
  if (replayIdempotentRequest(req, res)) return;
  const bookingId = Number(req.body.bookingId);
  const db = req.db;
  const booking = db.bookings.find(
    (item) => item.id === bookingId && item.clientId === req.account.id,
  );
  if (!booking) return fail(res, "Reserva no encontrada", 404);
  if (booking.status !== "Profesional confirmado")
    return fail(
      res,
      "La reserva debe ser confirmada por el profesional antes de pagar",
      409,
    );
  if (booking.paymentIntentId)
    return fail(res, "Esta reserva ya tiene un pago iniciado", 409);
  if (demoPayments) {
    booking.paymentStatus = "demo_authorized";
    booking.timeline.push({
      status: "Pago de demostración autorizado",
      at: new Date().toISOString(),
    });
    req.profile.escrow += booking.amount;
    db.transactions.unshift({
      id: nextId(db.transactions),
      userId: req.account.id,
      name: "Pago protegido (demo)",
      description: booking.title,
      amount: -booking.amount,
      status: "Autorizado",
    });
    const result = { demo: true, paymentStatus: booking.paymentStatus };
    const professional = db.professionals.find(
      (item) => item.id === booking.professionalId,
    );
    notify(
      db,
      professional?.ownerId,
      "payment.authorized",
      "Pago protegido autorizado",
      `El pago demo de ${booking.title} fue autorizado.`,
    );
    rememberIdempotentResponse(req, 201, result);
    await save(db);
    return res.status(201).json(result);
  }
  if (!stripe) return fail(res, "Configurá Stripe para usar pagos reales", 503);
  const intent = await stripe.paymentIntents.create({
    amount: booking.amount,
    currency: "pyg",
    capture_method: "manual",
    automatic_payment_methods: { enabled: true },
    metadata: { bookingId: String(booking.id), userId: req.account.id },
  });
  booking.paymentIntentId = intent.id;
  booking.paymentStatus = intent.status;
  const result = {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
  };
  rememberIdempotentResponse(req, 201, result);
  await save(db);
  res.status(201).json(result);
});
app.post("/api/payments/:bookingId/release", requireAuth, async (req, res) => {
  if (replayIdempotentRequest(req, res)) return;
  const db = req.db;
  const booking = db.bookings.find(
    (item) =>
      item.id === Number(req.params.bookingId) &&
      item.clientId === req.account.id,
  );
  if (!booking)
    return fail(res, "No hay un pago autorizado para esta reserva", 404);
  if (booking.status !== "Finalizado")
    return fail(
      res,
      "La reserva debe estar finalizada para liberar el pago",
      409,
    );
  if (booking.paymentStatus === "demo_authorized" && demoPayments) {
    booking.paymentStatus = "demo_paid";
    booking.status = "Completada";
    booking.timeline ||= [];
    booking.timeline.push({
      status: "Pago de demostraciÃ³n liberado",
      at: new Date().toISOString(),
      by: req.account.id,
    });
    req.profile.escrow = Math.max(0, req.profile.escrow - booking.amount);
    db.transactions.unshift({
      id: nextId(db.transactions),
      userId: req.account.id,
      name: "Pago protegido liberado (demo)",
      description: booking.title,
      amount: 0,
      status: "Liberado",
    });
    const professional = db.professionals.find(
      (item) => item.id === booking.professionalId,
    );
    const professionalAccount = professional?.ownerId
      ? db.authUsers.find((item) => item.id === professional.ownerId)
      : null;
    if (professionalAccount) {
      const professionalProfile = profileFor(db, professionalAccount);
      const commission = Math.round(
        (booking.amount * Number(db.platform?.commissionRate || 0)) / 100,
      );
      const payout = booking.amount - commission;
      professionalProfile.balance += payout;
      db.transactions.unshift({
        id: nextId(db.transactions),
        userId: professionalAccount.id,
        name: "Cobro por servicio (demo)",
        description: booking.title,
        amount: payout,
        status: "Disponible",
      });
    }
    audit(db, req.account, "payment.demo_released", "booking", booking.id, {
      amount: booking.amount,
      professionalId: booking.professionalId,
    });
    notify(
      db,
      professionalAccount?.id,
      "payment.released",
      "Cobro disponible",
      `El cobro demo de ${booking.title} ya estÃ¡ disponible en tu billetera.`,
    );
    const result = { demo: true, status: booking.paymentStatus };
    rememberIdempotentResponse(req, 200, result);
    await save(db);
    return res.json(result);
  }
  if (!booking.paymentIntentId)
    return fail(res, "No hay un pago autorizado para esta reserva", 404);
  if (booking.paymentStatus !== "authorized")
    return fail(res, "No hay un pago autorizado para liberar", 409);
  if (!stripe) return fail(res, "Configurá Stripe para usar pagos reales", 503);
  const intent = await stripe.paymentIntents.capture(booking.paymentIntentId);
  booking.paymentStatus = intent.status;
  booking.status = "Completada";
  const result = { status: intent.status };
  rememberIdempotentResponse(req, 200, result);
  await save(db);
  res.json(result);
});
function conversationsFor(db, account) {
  const professional =
    account.role === "professional"
      ? professionalForAccount(db, account)
      : null;
  const messages = (db.messages || []).filter(
    (message) =>
      message.clientId === account.id ||
      (professional && message.professionalId === professional.id),
  );
  const grouped = new Map();
  for (const message of messages) {
    const key = `${message.professionalId}:${message.clientId}`;
    const current = grouped.get(key) || {
      professionalId: message.professionalId,
      clientId: message.clientId,
      messages: [],
    };
    current.messages.push(message);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map((conversation) => {
      const items = conversation.messages.sort(
        (left, right) => new Date(left.createdAt) - new Date(right.createdAt),
      );
      const lastMessage = items.at(-1);
      const professionalProfile = db.professionals.find(
        (item) => item.id === conversation.professionalId,
      );
      const clientProfile = db.userProfiles[conversation.clientId];
      const isProfessional = Boolean(professional);
      return {
        professionalId: conversation.professionalId,
        clientId: conversation.clientId,
        partner: isProfessional
          ? { name: clientProfile?.name || "Cliente" }
          : professionalProfile
            ? {
                id: professionalProfile.id,
                name: professionalProfile.name,
                initials: professionalProfile.initials,
                color: professionalProfile.color,
                verified: professionalProfile.verified,
              }
            : { name: "Profesional" },
        lastMessage,
        unreadCount: items.filter(
          (message) =>
            !message.readAt &&
            ((isProfessional && message.author === "client") ||
              (!isProfessional && message.author === "professional")),
        ).length,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.lastMessage.createdAt) -
        new Date(left.lastMessage.createdAt),
    );
}
app.get("/api/conversations", requireAuth, async (req, res) => {
  if (
    req.account.role === "professional" &&
    !professionalForAccount(req.db, req.account)
  )
    return fail(
      res,
      "Tu cuenta profesional aÃºn no estÃ¡ vinculada a un perfil",
      403,
    );
  if (messagesRepository) {
    const professional =
      req.account.role === "professional"
        ? professionalForAccount(req.db, req.account)
        : null;
    const messages = professional
      ? await messagesRepository.listForProfessional(professional.id)
      : await messagesRepository.listForClient(req.account.id);
    return res.json(conversationsFor({ ...req.db, messages }, req.account));
  }
  res.json(conversationsFor(req.db, req.account));
});
app.get("/api/messages/:professionalId", requireAuth, async (req, res) => {
  const db = req.db;
  const professionalId = Number(req.params.professionalId);
  if (!db.professionals.some((pro) => pro.id === professionalId))
    return fail(res, "Profesional no encontrado", 404);
  const professional =
    req.account.role === "professional"
      ? ownedProfessionalOrFail(req, res)
      : null;
  if (req.account.role === "professional" && !professional) return;
  if (professional && professional.id !== professionalId)
    return fail(res, "No tenÃ©s acceso a esta conversaciÃ³n", 403);
  const clientId = professional
    ? String(req.query.clientId || "")
    : req.account.id;
  if (!clientId) return fail(res, "IndicÃ¡ el cliente de la conversaciÃ³n");
  const messages = messagesRepository
    ? await messagesRepository.listThread(professionalId, clientId)
    : db.messages
        .filter(
          (message) =>
            message.professionalId === professionalId &&
            message.clientId === clientId,
        )
        .sort(
          (left, right) => new Date(left.createdAt) - new Date(right.createdAt),
        );
  res.json(messages);
});
app.post("/api/messages", requireAuth, async (req, res) => {
  const idempotency = messagesRepository
    ? persistedIdempotency(req, res)
    : null;
  if (messagesRepository && idempotency === false) return;
  if (!messagesRepository && replayIdempotentRequest(req, res)) return;
  const input = z
    .object({
      professionalId: z.coerce.number().int().positive(),
      text: z.string().trim().min(1).max(1500),
    })
    .safeParse(req.body);
  if (!input.success) return fail(res, "Mensaje inválido");
  if (req.account.role !== "client")
    return fail(
      res,
      "Solo una cuenta cliente puede iniciar esta conversación",
      403,
    );
  const db = req.db;
  if (!db.professionals.some((pro) => pro.id === input.data.professionalId))
    return fail(res, "Profesional no encontrado", 404);
  const message = {
    id: nextId(db.messages),
    clientId: req.account.id,
    professionalId: input.data.professionalId,
    text: input.data.text,
    author: "client",
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  const professional = db.professionals.find(
    (item) => item.id === message.professionalId,
  );
  if (messagesRepository) {
    const notification = persistedNotification(
      professional?.ownerId,
      "message.received",
      "Nuevo mensaje",
      `${req.profile.name}: ${message.text.slice(0, 120)}`,
    );
    const result = await messagesRepository.createWithEffects({
      message,
      notification,
      audit: {
        actorId: req.account.id,
        action: "message.sent",
        entity: "message",
        entityId: "pending",
        metadata: { actor: "client" },
        createdAt: new Date().toISOString(),
      },
      idempotency: idempotency && { ...idempotency, status: 201 },
    });
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
      return res.status(result.status).json(result.body);
    }
    return res.status(201).json(result.message);
  }
  db.messages.push(message);
  notify(
    db,
    professional?.ownerId,
    "message.received",
    "Nuevo mensaje",
    `${req.profile.name}: ${message.text.slice(0, 120)}`,
  );
  rememberIdempotentResponse(req, 201, message);
  await save(db);
  res.status(201).json(message);
});
app.post("/api/professional/messages", requireAuth, async (req, res) => {
  const idempotency = messagesRepository
    ? persistedIdempotency(req, res)
    : null;
  if (messagesRepository && idempotency === false) return;
  if (!messagesRepository && replayIdempotentRequest(req, res)) return;
  const professional = ownedProfessionalOrFail(req, res);
  if (!professional) return;
  const input = z
    .object({
      clientId: z.string().min(1).max(100),
      text: z.string().trim().min(1).max(1500),
    })
    .safeParse(req.body);
  if (!input.success) return fail(res, "Mensaje inválido");
  const hasConversation = req.db.messages.some(
    (message) =>
      message.professionalId === professional.id &&
      message.clientId === input.data.clientId,
  );
  const hasBooking = req.db.bookings.some(
    (booking) =>
      booking.professionalId === professional.id &&
      booking.clientId === input.data.clientId,
  );
  if (!hasConversation && !hasBooking)
    return fail(res, "No existe una conversación con esa cuenta", 403);
  const message = {
    id: nextId(req.db.messages),
    clientId: input.data.clientId,
    professionalId: professional.id,
    text: input.data.text,
    author: "professional",
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  if (messagesRepository) {
    const notification = persistedNotification(
      message.clientId,
      "message.received",
      "Nuevo mensaje",
      `${professional.name}: ${message.text.slice(0, 120)}`,
    );
    const result = await messagesRepository.createWithEffects({
      message,
      notification,
      audit: {
        actorId: req.account.id,
        action: "message.sent",
        entity: "message",
        entityId: "pending",
        metadata: { actor: "professional" },
        createdAt: new Date().toISOString(),
      },
      idempotency: idempotency && { ...idempotency, status: 201 },
    });
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
      return res.status(result.status).json(result.body);
    }
    return res.status(201).json(result.message);
  }
  req.db.messages.push(message);
  notify(
    req.db,
    message.clientId,
    "message.received",
    "Nuevo mensaje",
    `${professional.name}: ${message.text.slice(0, 120)}`,
  );
  audit(req.db, req.account, "message.sent", "message", message.id, {
    actor: "professional",
  });
  rememberIdempotentResponse(req, 201, message);
  await save(req.db);
  res.status(201).json(message);
});
app.patch("/api/messages/:id/read", requireAuth, async (req, res) => {
  const message = req.db.messages.find(
    (item) => item.id === Number(req.params.id),
  );
  if (!message) return fail(res, "Mensaje no encontrado", 404);
  const professional =
    req.account.role === "professional"
      ? professionalForAccount(req.db, req.account)
      : null;
  const allowed = professional
    ? message.professionalId === professional.id && message.author === "client"
    : message.clientId === req.account.id && message.author === "professional";
  if (!allowed) return fail(res, "No tenÃ©s acceso a este mensaje", 403);
  if (messagesRepository) {
    const updated = professional
      ? await messagesRepository.markReadByProfessional(
          message.id,
          professional.id,
        )
      : await messagesRepository.markReadByClient(message.id, req.account.id);
    if (!updated) return fail(res, "Mensaje no encontrado", 404);
    return res.json({ id: updated.id, readAt: updated.readAt });
  }
  if (!message.readAt) message.readAt = new Date().toISOString();
  await save(req.db);
  res.json({ id: message.id, readAt: message.readAt });
});
app.post("/api/withdrawals", requireAuth, async (req, res) => {
  if (replayIdempotentRequest(req, res)) return;
  const input = withdrawalInput.safeParse(req.body);
  if (!input.success) return fail(res, "Monto de retiro inválido");
  if (isProduction)
    return fail(
      res,
      "Los retiros requieren un proveedor de pagos configurado",
      503,
    );
  const db = req.db;
  if (input.data.amount > req.profile.balance)
    return fail(res, "El monto no puede superar tu saldo");
  req.profile.balance -= input.data.amount;
  db.transactions.unshift({
    id: nextId(db.transactions),
    userId: req.account.id,
    name: "Retiro de demostración solicitado",
    description: "No se transfiere dinero real",
    amount: -input.data.amount,
    status: "En proceso",
  });
  audit(
    db,
    req.account,
    "withdrawal.requested",
    "withdrawal",
    nextId(db.transactions),
  );
  const result = { balance: req.profile.balance };
  rememberIdempotentResponse(req, 201, result);
  await save(db);
  res.status(201).json(result);
});
app.get("/api/professionals/:professionalId/reviews", async (req, res) => {
  const id = Number(req.params.professionalId);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  if (reviewsRepository) {
    const result = await reviewsRepository.findPage(id, page, limit);
    if (!result.exists) return fail(res, "Profesional no encontrado", 404);
    return res.json({ ...result, page, limit });
  }
  const db = await database();
  if (!db.professionals.some((item) => item.id === id))
    return fail(res, "Profesional no encontrado", 404);
  const reviews = db.reviews
    .filter((review) => review.professionalId === id)
    .sort(
      (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
    );
  res.json({
    items: reviews.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: reviews.length,
  });
});
app.post(
  "/api/professionals/:professionalId/reviews",
  requireAuth,
  async (req, res) => {
    const input = z
      .object({
        rating: z.coerce.number().int().min(1).max(5),
        comment: z.string().trim().min(3).max(800),
        bookingId: z.coerce.number().int().positive(),
      })
      .safeParse(req.body);
    const id = Number(req.params.professionalId);
    if (!input.success || !Number.isInteger(id))
      return fail(res, "Ingresá una calificación y un comentario válido");
    if (reviewsRepository) {
      const result = await reviewsRepository.createWithEffects({
        professionalId: id,
        bookingId: input.data.bookingId,
        accountId: req.account.id,
        author: req.profile.name,
        rating: input.data.rating,
        comment: input.data.comment,
        createdAt: new Date().toISOString(),
        growthEventId: `evt-${randomBytes(10).toString("hex")}`,
        notificationId: `ntf-${randomBytes(10).toString("hex")}`,
      });
      if (result.duplicate)
        return fail(res, "Este servicio ya fue calificado", 409);
      if (!result.allowed && !result.review)
        return fail(res, "Solo podés calificar un servicio finalizado", 403);
      return res.status(201).json(result.review);
    }
    const db = req.db;
    const professional = db.professionals.find((item) => item.id === id);
    const booking = db.bookings.find(
      (item) =>
        item.id === input.data.bookingId &&
        item.clientId === req.account.id &&
        item.professionalId === id &&
        ["Finalizado", "Completada"].includes(item.status),
    );
    if (!professional || !booking)
      return fail(res, "Solo podés calificar un servicio finalizado", 403);
    if (db.reviews.some((item) => item.bookingId === input.data.bookingId))
      return fail(res, "Este servicio ya fue calificado", 409);
    const review = {
      id: nextId(db.reviews),
      bookingId: input.data.bookingId,
      userId: req.account.id,
      professionalId: id,
      author: req.profile.name,
      rating: input.data.rating,
      comment: input.data.comment,
      createdAt: new Date().toISOString(),
    };
    db.reviews.unshift(review);
    professional.rating = Number(
      (
        (professional.rating * professional.jobs + review.rating) /
        (professional.jobs + 1)
      ).toFixed(1),
    );
    professional.jobs += 1;
    audit(db, req.account, "review.created", "review", review.id, {
      bookingId: input.data.bookingId,
    });
    trackGrowthEvent(db, req.account, "review.created", {
      category: professional.role,
    });
    notify(
      db,
      professional.ownerId,
      "review.created",
      "Nueva reseÃ±a recibida",
      `${req.profile.name} dejÃ³ una calificaciÃ³n de ${review.rating}/5.`,
    );
    await save(db);
    res.status(201).json(review);
  },
);
app.get("/api/verifications", requireAuth, async (req, res) => {
  if (verificationsRepository)
    return res.json(await verificationsRepository.listForUser(req.account.id));
  res.json(
    req.db.verifications
      .filter((item) => item.userId === req.account.id)
      .sort(
        (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
      ),
  );
});
app.post("/api/verifications", requireAuth, async (req, res) => {
  const kind = String(req.body.kind || "").trim();
  if (!["identity", "professional", "address"].includes(kind))
    return fail(res, "Tipo de verificación no válido");
  const db = req.db;
  if (verificationsRepository) {
    const result = await verificationsRepository.createWithNotifications({
      request: {
        userId: req.account.id,
        kind,
        status: "pending",
        createdAt: new Date().toISOString(),
      },
      notifications: db.authUsers
        .filter((user) => user.role === "admin")
        .map((admin) =>
          persistedNotification(
            admin.id,
            "verification.requested",
            "Nueva verificación para revisar",
            `${req.profile.name} solicitó verificación de ${kind}.`,
          ),
        ),
    });
    if (result.duplicate)
      return fail(res, "Ya tenés una solicitud de este tipo en revisión", 409);
    return res.status(201).json({
      request: result.request,
      message: "Solicitud recibida. Un revisor la evaluará.",
    });
  }
  if (
    db.verifications.some(
      (item) =>
        item.userId === req.account.id &&
        item.kind === kind &&
        item.status === "pending",
    )
  )
    return fail(res, "Ya tenÃ©s una solicitud de este tipo en revisiÃ³n", 409);
  const request = {
    id: nextId(db.verifications),
    userId: req.account.id,
    kind,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.verifications.push(request);
  for (const admin of db.authUsers.filter((user) => user.role === "admin"))
    notify(
      db,
      admin.id,
      "verification.requested",
      "Nueva verificaciÃ³n para revisar",
      `${req.profile.name} solicitÃ³ verificaciÃ³n de ${kind}.`,
    );
  await save(db);
  res
    .status(201)
    .json({ request, message: "Solicitud recibida. Un revisor la evaluará." });
});

app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Ruta de API no encontrada" }),
);
app.use(express.static(join(root, "dist")));
app.get("{*splat}", (_req, res) =>
  res.sendFile(join(root, "dist", "index.html")),
);
app.use((err, _req, res, _next) => {
  if (err?.code === "MBAPO_CONFLICT")
    return res.status(409).json({ error: err.message });
  console.error(err?.message || err);
  res.status(500).json({ error: "Error interno del servidor" });
});
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = app.listen(process.env.PORT || 3001, () =>
    console.log("Mbapo API en http://localhost:3001"),
  );
  const shutdown = (signal) => {
    console.log(`${signal} recibido; cerrando Mbapo...`);
    server.close(() => {
      Promise.resolve(pool?.end()).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

export { app };
