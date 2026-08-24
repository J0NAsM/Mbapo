import assert from "node:assert/strict";
import test from "node:test";

const connectionString = process.env.MBAPO_TEST_DATABASE_URL;

test(
  "persiste entidades contra PostgreSQL cuando hay una base de pruebas configurada",
  { skip: !connectionString },
  async () => {
    process.env.DATABASE_URL = connectionString;
    process.env.MBAPO_AUTH_SECRET = "postgres-integration-test-secret";
    process.env.PAYMENTS_MODE = "demo";
    process.env.LOG_LEVEL = "silent";
    const { app } = await import("../server.js");
    const server = app.listen(0);
    const url = `http://127.0.0.1:${server.address().port}`;
    try {
      const health = await fetch(`${url}/api/health`);
      assert.equal(health.status, 200);
      assert.equal((await health.json()).storage, "postgres");

      const professionals = await fetch(
        `${url}/api/professionals?sort=price&direction=asc&limit=2`,
      );
      assert.equal(professionals.status, 200);
      assert.equal((await professionals.json()).length, 2);
      const jobs = await fetch(`${url}/api/jobs?sort=budget&limit=2`);
      assert.equal(jobs.status, 200);
      assert.equal((await jobs.json()).length, 2);

      const email = `postgres-${Date.now()}@example.com`;
      const registration = await fetch(`${url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Prueba PostgreSQL",
          email,
          password: "password-postgres-integration-123",
        }),
      });
      assert.equal(registration.status, 201);
      const session = await registration.json();
      const headers = {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      };
      const bookingResponse = await fetch(`${url}/api/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          professionalId: 1,
          date: "2037-05-18",
          time: "09:00 - 11:00",
          place: "AsunciÃ³n",
        }),
      });
      assert.equal(bookingResponse.status, 201);
      const booking = await bookingResponse.json();
      const replayedBooking = await fetch(`${url}/api/bookings`, {
        method: "POST",
        headers: {
          ...headers,
          "Idempotency-Key": "postgres-booking-replay-001",
        },
        body: JSON.stringify({
          professionalId: 2,
          date: "2037-05-18",
          time: "09:00 - 11:00",
          place: "Asunción",
        }),
      });
      assert.equal(replayedBooking.status, 201);
      const secondaryBooking = await replayedBooking.json();
      const replay = await fetch(`${url}/api/bookings`, {
        method: "POST",
        headers: {
          ...headers,
          "Idempotency-Key": "postgres-booking-replay-001",
        },
        body: JSON.stringify({
          professionalId: 2,
          date: "2037-05-18",
          time: "09:00 - 11:00",
          place: "Asunción",
        }),
      });
      assert.equal(replay.status, 201);
      assert.equal(replay.headers.get("idempotency-replayed"), "true");

      const messageHeaders = {
        ...headers,
        "Idempotency-Key": "postgres-message-idempotency-001",
      };
      const sendMessage = () =>
        fetch(`${url}/api/messages`, {
          method: "POST",
          headers: messageHeaders,
          body: JSON.stringify({
            professionalId: 1,
            text: "Mensaje de persistencia PostgreSQL.",
          }),
        });
      const [sentMessage, replayedMessage] = await Promise.all([
        sendMessage(),
        sendMessage(),
      ]);
      assert.equal(sentMessage.status, 201);
      assert.equal(replayedMessage.status, 201);
      assert.ok(
        [sentMessage, replayedMessage].some(
          (response) => response.headers.get("idempotency-replayed") === "true",
        ),
      );
      const thread = await fetch(`${url}/api/messages/1`, { headers });
      assert.equal(thread.status, 200);
      const threadItems = await thread.json();
      assert.equal(threadItems.at(-1).author, "client");
      assert.equal(
        threadItems.filter(
          (item) => item.text === "Mensaje de persistencia PostgreSQL.",
        ).length,
        1,
      );
      const conversations = await fetch(`${url}/api/conversations`, {
        headers,
      });
      assert.equal(conversations.status, 200);
      assert.equal((await conversations.json())[0].professionalId, 1);

      const reviews = await fetch(`${url}/api/professionals/1/reviews?limit=5`);
      assert.equal(reviews.status, 200);
      assert.ok(Array.isArray((await reviews.json()).items));

      const verification = await fetch(`${url}/api/verifications`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "identity" }),
      });
      assert.equal(verification.status, 201);
      const verificationRequest = await verification.json();
      const duplicateVerification = await fetch(`${url}/api/verifications`, {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "identity" }),
      });
      assert.equal(duplicateVerification.status, 409);
      const ownVerifications = await fetch(`${url}/api/verifications`, {
        headers,
      });
      assert.equal(ownVerifications.status, 200);
      assert.equal((await ownVerifications.json())[0].kind, "identity");

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
      const accountSearch = await fetch(
        `${url}/api/admin/users?query=Prueba%20PostgreSQL&limit=5`,
        { headers: { Authorization: `Bearer ${admin.token}` } },
      );
      assert.equal(accountSearch.status, 200);
      assert.equal((await accountSearch.json()).total, 1);
      const platformUpdate = await fetch(`${url}/api/admin/platform`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${admin.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commissionRate: 10,
          currency: "PYG",
          supportEmail: "soporte@example.com",
          categories: ["Electricidad"],
          content: {
            heroEyebrow: "SERVICIOS QUE DAN TRANQUILIDAD",
            heroTitle: "Encontrá a la persona indicada para el trabajo.",
            heroDescription: "Profesionales verificados y pagos protegidos.",
          },
        }),
      });
      assert.equal(platformUpdate.status, 200);
      assert.equal((await platformUpdate.json()).commissionRate, 10);
      const adminBookingHeaders = {
        Authorization: `Bearer ${admin.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "postgres-admin-booking-idempotency-001",
      };
      const adminCancellation = await fetch(
        `${url}/api/admin/bookings/${secondaryBooking.id}/status`,
        {
          method: "PATCH",
          headers: adminBookingHeaders,
          body: JSON.stringify({ status: "Cancelada" }),
        },
      );
      assert.equal(adminCancellation.status, 200);
      const adminCancellationReplay = await fetch(
        `${url}/api/admin/bookings/${secondaryBooking.id}/status`,
        {
          method: "PATCH",
          headers: adminBookingHeaders,
          body: JSON.stringify({ status: "Cancelada" }),
        },
      );
      assert.equal(adminCancellationReplay.status, 200);
      assert.equal(
        adminCancellationReplay.headers.get("idempotency-replayed"),
        "true",
      );
      const verificationResolution = await fetch(
        `${url}/api/admin/verifications/${verificationRequest.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${admin.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "approved" }),
        },
      );
      assert.equal(verificationResolution.status, 200);
      assert.equal((await verificationResolution.json()).status, "approved");

      const professionalRegistration = await fetch(`${url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Profesional PostgreSQL",
          email: `professional-${Date.now()}@example.com`,
          password: "password-professional-postgres-123",
        }),
      });
      assert.equal(professionalRegistration.status, 201);
      const professionalAccount = await professionalRegistration.json();
      const roleChange = await fetch(
        `${url}/api/admin/users/${professionalAccount.user.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${admin.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: "professional" }),
        },
      );
      assert.equal(roleChange.status, 200);
      const ownerChange = await fetch(
        `${url}/api/admin/professionals/1/owner`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${admin.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountId: professionalAccount.user.id }),
        },
      );
      assert.equal(ownerChange.status, 200);
      const professionalLogin = await fetch(`${url}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: professionalAccount.user.email,
          password: "password-professional-postgres-123",
        }),
      });
      assert.equal(professionalLogin.status, 200);
      const professionalSession = await professionalLogin.json();
      const professionalHeaders = {
        Authorization: `Bearer ${professionalSession.token}`,
        "Content-Type": "application/json",
      };
      const confirmationHeaders = {
        ...professionalHeaders,
        "Idempotency-Key": "postgres-booking-transition-idempotency-001",
      };
      const confirmation = await fetch(
        `${url}/api/professional/bookings/${booking.id}/status`,
        {
          method: "PATCH",
          headers: confirmationHeaders,
          body: JSON.stringify({ status: "Profesional confirmado" }),
        },
      );
      assert.equal(confirmation.status, 200);
      const confirmationReplay = await fetch(
        `${url}/api/professional/bookings/${booking.id}/status`,
        {
          method: "PATCH",
          headers: confirmationHeaders,
          body: JSON.stringify({ status: "Profesional confirmado" }),
        },
      );
      assert.equal(confirmationReplay.status, 200);
      assert.equal(
        confirmationReplay.headers.get("idempotency-replayed"),
        "true",
      );

      const paymentHeaders = {
        ...headers,
        "Idempotency-Key": "postgres-demo-payment-idempotency-001",
      };
      const authorizePayment = () =>
        fetch(`${url}/api/payments/intents`, {
          method: "POST",
          headers: paymentHeaders,
          body: JSON.stringify({ bookingId: booking.id }),
        });
      const [authorized, authorizedReplay] = await Promise.all([
        authorizePayment(),
        authorizePayment(),
      ]);
      assert.equal(authorized.status, 201);
      assert.equal(authorizedReplay.status, 201);
      assert.ok(
        [authorized, authorizedReplay].some(
          (response) => response.headers.get("idempotency-replayed") === "true",
        ),
      );
      assert.equal((await authorized.json()).paymentStatus, "demo_authorized");

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
          body: JSON.stringify({ status: "Esperando tu confirmaciÃ³n" }),
        },
      );
      assert.equal(awaitingConfirmation.status, 200);
      const finished = await fetch(`${url}/api/bookings/${booking.id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "Finalizado" }),
      });
      assert.equal(finished.status, 200);
      const releaseHeaders = {
        ...headers,
        "Idempotency-Key": "postgres-demo-release-idempotency-001",
      };
      const released = await fetch(
        `${url}/api/payments/${booking.id}/release`,
        { method: "POST", headers: releaseHeaders },
      );
      assert.equal(released.status, 200);
      assert.equal((await released.json()).status, "demo_paid");
      const releasedReplay = await fetch(
        `${url}/api/payments/${booking.id}/release`,
        { method: "POST", headers: releaseHeaders },
      );
      assert.equal(releasedReplay.status, 200);
      assert.equal(releasedReplay.headers.get("idempotency-replayed"), "true");

      const withdrawalHeaders = {
        ...professionalHeaders,
        "Idempotency-Key": "postgres-demo-withdrawal-idempotency-001",
      };
      const withdrawal = await fetch(`${url}/api/withdrawals`, {
        method: "POST",
        headers: withdrawalHeaders,
        body: JSON.stringify({ amount: 1000 }),
      });
      assert.equal(withdrawal.status, 201);
      assert.ok(Number((await withdrawal.json()).balance) >= 0);
      const withdrawalReplay = await fetch(`${url}/api/withdrawals`, {
        method: "POST",
        headers: withdrawalHeaders,
        body: JSON.stringify({ amount: 1000 }),
      });
      assert.equal(withdrawalReplay.status, 201);
      assert.equal(
        withdrawalReplay.headers.get("idempotency-replayed"),
        "true",
      );

      const dashboard = await fetch(`${url}/api/dashboard`, { headers });
      assert.equal(dashboard.status, 200);
      const dashboardData = await dashboard.json();
      assert.ok(dashboardData.bookings.length >= 1);
      assert.equal(
        dashboardData.bookings.find((item) => item.id === booking.id)?.status,
        "Completada",
      );
      assert.equal(
        dashboardData.transactions.filter(
          (item) => item.description === booking.title,
        ).length,
        2,
      );
      const professionalDashboard = await fetch(`${url}/api/dashboard`, {
        headers: professionalHeaders,
      });
      assert.equal(professionalDashboard.status, 200);
      assert.ok(
        (await professionalDashboard.json()).transactions.some(
          (item) => item.name === "Retiro de demostración solicitado",
        ),
      );

      const notifications = await fetch(`${url}/api/notifications`, {
        headers,
      });
      assert.equal(notifications.status, 200);
      assert.ok(Array.isArray((await notifications.json()).items));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
