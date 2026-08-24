import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "mbapo-test-"));
process.env.MBAPO_DATA_PATH = join(directory, "state.json");
process.env.DATABASE_URL = "";
process.env.MBAPO_AUTH_SECRET = "test-secret-not-for-production";
process.env.PAYMENTS_MODE = "demo";
process.env.LOG_LEVEL = "silent";
const { app } = await import("../server.js");
const server = app.listen(0);
const url = `http://127.0.0.1:${server.address().port}`;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
});

test("protege el dashboard y aísla datos de una nueva cuenta", async () => {
  const catalog = await fetch(`${url}/api/professionals?sort=price&limit=2`);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get("x-total-count"), "4");
  assert.equal((await catalog.json()).length, 2);

  const denied = await fetch(`${url}/api/dashboard`);
  assert.equal(denied.status, 401);

  const registration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Cuenta de prueba",
      email: "prueba@example.com",
      password: "password-segura-123",
    }),
  });
  assert.equal(registration.status, 201);
  const session = await registration.json();
  const dashboard = await fetch(`${url}/api/dashboard`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  assert.equal(dashboard.status, 200);
  const data = await dashboard.json();
  assert.equal(data.user.email, "prueba@example.com");
  assert.equal(data.user.balance, 0);
  assert.deepEqual(data.user.favorites, []);
  assert.equal("authUsers" in data, false);
  assert.equal("auditLog" in data, false);
  assert.equal("verifications" in data, false);
  assert.deepEqual(data.messages, []);

  const logout = await fetch(`${url}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}` },
  });
  assert.equal(logout.status, 204);
  const revokedDashboard = await fetch(`${url}/api/dashboard`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  assert.equal(revokedDashboard.status, 401);
});

test("el servidor impide postulación y cambios de reserva no autorizados", async () => {
  const registration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Otra cuenta",
      email: "otra@example.com",
      password: "password-segura-456",
    }),
  });
  const session = await registration.json();
  const headers = {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
  };

  const application = await fetch(`${url}/api/jobs/1/applications`, {
    method: "POST",
    headers,
  });
  assert.equal(application.status, 403);

  const bookingResponse = await fetch(`${url}/api/bookings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      professionalId: 1,
      date: "2030-01-15",
      time: "14:00 – 16:00",
      place: "Villa Morra, Asunción",
    }),
  });
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json();

  const invalidTransition = await fetch(
    `${url}/api/bookings/${booking.id}/status`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "Finalizado" }),
    },
  );
  assert.equal(invalidTransition.status, 409);
});

test("atribuye referidos y expone métricas de crecimiento solo al administrador", async () => {
  const referrerRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Quien refiere",
      email: "refiere@example.com",
      password: "password-segura-789",
    }),
  });
  assert.equal(referrerRegistration.status, 201);
  const referrer = await referrerRegistration.json();
  const referral = await fetch(`${url}/api/referrals`, {
    headers: { Authorization: `Bearer ${referrer.token}` },
  });
  const referralData = await referral.json();
  assert.match(referralData.code, /^MB-[A-Z0-9]+$/);

  const referredRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Cuenta referida",
      email: "referida@example.com",
      password: "password-segura-987",
      referralCode: referralData.code,
    }),
  });
  assert.equal(referredRegistration.status, 201);
  const referred = await referredRegistration.json();
  const referredState = await fetch(`${url}/api/referrals`, {
    headers: { Authorization: `Bearer ${referred.token}` },
  });
  assert.equal((await referredState.json()).status, "pending");

  const event = await fetch(`${url}/api/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${referred.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "catalog.searched",
      category: "Electricidad",
    }),
  });
  assert.equal(event.status, 204);

  const savedSearch = await fetch(`${url}/api/saved-searches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${referred.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: "electricista", category: "Electricidad" }),
  });
  assert.equal(savedSearch.status, 201);
  const savedSearches = await fetch(`${url}/api/saved-searches`, {
    headers: { Authorization: `Bearer ${referred.token}` },
  });
  assert.equal((await savedSearches.json()).length, 1);

  const adminLogin = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@mbapo.local",
      password: "MbapoAdmin!2026",
    }),
  });
  assert.equal(adminLogin.status, 200);
  const admin = await adminLogin.json();
  const metrics = await fetch(`${url}/api/admin/metrics`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert.equal(metrics.status, 200);
  const metricData = await metrics.json();
  assert.ok(metricData.funnel.registrations >= 2);
  assert.equal(metricData.funnel.catalogSearches, 1);
});

test("vincula una cuenta profesional y restringe su operación a sus propias reservas", async () => {
  const adminLogin = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@mbapo.local",
      password: "MbapoAdmin!2026",
    }),
  });
  const admin = await adminLogin.json();
  const adminHeaders = {
    Authorization: `Bearer ${admin.token}`,
    "Content-Type": "application/json",
  };

  const professionalRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Profesional de prueba",
      email: "pro@example.com",
      password: "password-profesional-123",
    }),
  });
  const professionalAccount = await professionalRegistration.json();
  const roleChange = await fetch(
    `${url}/api/admin/users/${professionalAccount.user.id}`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ role: "professional" }),
    },
  );
  assert.equal(roleChange.status, 200);
  const ownerChange = await fetch(`${url}/api/admin/professionals/1/owner`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ accountId: professionalAccount.user.id }),
  });
  assert.equal(ownerChange.status, 200);

  const professionalLogin = await fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "pro@example.com",
      password: "password-profesional-123",
    }),
  });
  const professional = await professionalLogin.json();
  const professionalHeaders = {
    Authorization: `Bearer ${professional.token}`,
    "Content-Type": "application/json",
  };

  const clientRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Cliente para profesional",
      email: "client-pro@example.com",
      password: "password-cliente-123",
    }),
  });
  const client = await clientRegistration.json();
  const clientHeaders = {
    Authorization: `Bearer ${client.token}`,
    "Content-Type": "application/json",
  };
  const bookingResponse = await fetch(`${url}/api/bookings`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({
      professionalId: 1,
      date: "2031-02-04",
      time: "10:30 – 12:30",
      place: "Barrio Jara, Asunción",
    }),
  });
  assert.equal(bookingResponse.status, 201);
  const booking = await bookingResponse.json();

  const professionalDashboard = await fetch(
    `${url}/api/professional/dashboard`,
    { headers: professionalHeaders },
  );
  assert.equal(professionalDashboard.status, 200);
  const professionalData = await professionalDashboard.json();
  const pendingBooking = professionalData.bookings.find(
    (item) => item.id === booking.id,
  );
  assert.equal(pendingBooking.place, undefined);

  const invalidTransition = await fetch(
    `${url}/api/professional/bookings/${booking.id}/status`,
    {
      method: "PATCH",
      headers: professionalHeaders,
      body: JSON.stringify({ status: "Trabajo en curso" }),
    },
  );
  assert.equal(invalidTransition.status, 409);
  const confirmation = await fetch(
    `${url}/api/professional/bookings/${booking.id}/status`,
    {
      method: "PATCH",
      headers: professionalHeaders,
      body: JSON.stringify({ status: "Profesional confirmado" }),
    },
  );
  assert.equal(confirmation.status, 200);
  const bookingNotice = await fetch(`${url}/api/notifications`, {
    headers: clientHeaders,
  });
  assert.ok(
    (await bookingNotice.json()).items.some(
      (item) => item.type === "booking.status_changed",
    ),
  );

  const payment = await fetch(`${url}/api/payments/intents`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({ bookingId: booking.id }),
  });
  assert.equal(payment.status, 201);
  assert.equal((await payment.json()).demo, true);
  const paymentNotice = await fetch(`${url}/api/notifications`, {
    headers: professionalHeaders,
  });
  assert.ok(
    (await paymentNotice.json()).items.some(
      (item) => item.type === "payment.authorized",
    ),
  );

  const started = await fetch(
    `${url}/api/professional/bookings/${booking.id}/status`,
    {
      method: "PATCH",
      headers: professionalHeaders,
      body: JSON.stringify({ status: "Trabajo en curso" }),
    },
  );
  assert.equal(started.status, 200);
  const awaitingConfirmation = await fetch(
    `${url}/api/professional/bookings/${booking.id}/status`,
    {
      method: "PATCH",
      headers: professionalHeaders,
      body: JSON.stringify({ status: "Esperando tu confirmaci\u00f3n" }),
    },
  );
  assert.equal(awaitingConfirmation.status, 200);
  const completed = await fetch(`${url}/api/bookings/${booking.id}/status`, {
    method: "PATCH",
    headers: clientHeaders,
    body: JSON.stringify({ status: "Finalizado" }),
  });
  assert.equal(completed.status, 200);
  const release = await fetch(`${url}/api/payments/${booking.id}/release`, {
    method: "POST",
    headers: clientHeaders,
  });
  assert.equal(release.status, 200);
  assert.deepEqual(await release.json(), { demo: true, status: "demo_paid" });

  const paidProfessionalDashboard = await fetch(`${url}/api/dashboard`, {
    headers: professionalHeaders,
  });
  const paidProfessional = await paidProfessionalDashboard.json();
  assert.ok(paidProfessional.user.balance > 0);

  const reviewResponse = await fetch(`${url}/api/professionals/1/reviews`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({
      bookingId: booking.id,
      rating: 5,
      comment: "Trabajo puntual y bien realizado.",
    }),
  });
  assert.equal(reviewResponse.status, 201);
  const reviews = await fetch(`${url}/api/professionals/1/reviews`);
  assert.equal((await reviews.json()).total, 1);

  const clientMessage = await fetch(`${url}/api/messages`, {
    method: "POST",
    headers: clientHeaders,
    body: JSON.stringify({
      professionalId: 1,
      text: "¿Podés confirmar el horario?",
    }),
  });
  assert.equal(clientMessage.status, 201);
  const professionalMessage = await fetch(`${url}/api/professional/messages`, {
    method: "POST",
    headers: professionalHeaders,
    body: JSON.stringify({
      clientId: client.user.id,
      text: "Sí, confirmo el horario solicitado.",
    }),
  });
  assert.equal(professionalMessage.status, 201);
  const messages = await fetch(`${url}/api/messages/1`, {
    headers: clientHeaders,
  });
  const thread = await messages.json();
  assert.equal(thread.at(-1).author, "professional");
  const markedRead = await fetch(
    `${url}/api/messages/${thread.at(-1).id}/read`,
    {
      method: "PATCH",
      headers: clientHeaders,
    },
  );
  assert.equal(markedRead.status, 200);
  const messageNotice = await fetch(`${url}/api/notifications`, {
    headers: professionalHeaders,
  });
  assert.ok(
    (await messageNotice.json()).items.some(
      (item) => item.type === "message.received",
    ),
  );

  const blockProfessional = await fetch(
    `${url}/api/admin/users/${professionalAccount.user.id}`,
    {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ status: "blocked" }),
    },
  );
  assert.equal(blockProfessional.status, 200);
  const blockedWorkspace = await fetch(`${url}/api/professional/dashboard`, {
    headers: professionalHeaders,
  });
  assert.equal(blockedWorkspace.status, 401);
});

test("permite onboarding profesional y evita reservas solapadas", async () => {
  const professionalRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Nueva profesional",
      email: "nueva-profesional@example.com",
      password: "password-nueva-profesional-123",
    }),
  });
  const professionalAccount = await professionalRegistration.json();
  const date = "2035-04-17";
  const onboarding = await fetch(`${url}/api/professional/onboarding`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${professionalAccount.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "Electricista residencial",
      price: 120000,
      tags: ["Electricidad", "Urgencias"],
      serviceAreas: ["AsunciÃ³n", "Recoleta"],
      text: "Instalaciones y reparaciones electricas con atencion responsable.",
      availability: [
        {
          day: new Date(`${date}T12:00:00`).getDay(),
          start: "08:00",
          end: "18:00",
        },
      ],
    }),
  });
  assert.equal(onboarding.status, 201);
  const professional = await onboarding.json();
  assert.equal(professional.user.role, "professional");

  const clientRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Cliente disponibilidad",
      email: "cliente-disponibilidad@example.com",
      password: "password-cliente-disponibilidad-123",
    }),
  });
  const client = await clientRegistration.json();
  const headers = {
    Authorization: `Bearer ${client.token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": "booking-availability-0001",
  };
  const firstBooking = await fetch(`${url}/api/bookings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      professionalId: professional.professional.id,
      date,
      time: "10:00 - 12:00",
      place: "Recoleta, AsunciÃ³n",
    }),
  });
  assert.equal(firstBooking.status, 201);
  const firstBookingData = await firstBooking.json();
  const replayedBooking = await fetch(`${url}/api/bookings`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      professionalId: professional.professional.id,
      date,
      time: "10:00 - 12:00",
      place: "Recoleta, AsunciÃ³n",
    }),
  });
  assert.equal(replayedBooking.status, 201);
  assert.equal(replayedBooking.headers.get("idempotency-replayed"), "true");
  assert.equal((await replayedBooking.json()).id, firstBookingData.id);

  const secondClientRegistration = await fetch(`${url}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Segundo cliente",
      email: "segundo-cliente@example.com",
      password: "password-segundo-cliente-123",
    }),
  });
  const secondClient = await secondClientRegistration.json();
  const overlappingBooking = await fetch(`${url}/api/bookings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secondClient.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      professionalId: professional.professional.id,
      date,
      time: "11:00 - 13:00",
      place: "Recoleta, AsunciÃ³n",
    }),
  });
  assert.equal(overlappingBooking.status, 409);
});
