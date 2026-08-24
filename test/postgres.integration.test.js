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
      const availability = await fetch(
        `${url}/api/professionals/1/availability?date=2037-05-18`,
      );
      assert.equal(availability.status, 200);
      assert.equal(
        (await availability.json()).slots.includes("08:00 - 10:00"),
        false,
      );
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
      const catalogHeaders = {
        Authorization: `Bearer ${admin.token}`,
        "Content-Type": "application/json",
      };
      const catalogSuffix = Date.now();
      const professionalName = `Catálogo PostgreSQL ${catalogSuffix}`;
      const professionalCreation = await fetch(
        `${url}/api/admin/professionals`,
        {
          method: "POST",
          headers: catalogHeaders,
          body: JSON.stringify({
            name: professionalName,
            role: "Especialista de pruebas",
            price: 100000,
            distance: "3 km",
            available: true,
            tags: ["Pruebas"],
            text: "Perfil creado por la integración PostgreSQL.",
          }),
        },
      );
      assert.equal(professionalCreation.status, 201);
      const catalogProfessional = await professionalCreation.json();
      assert.equal(catalogProfessional.name, professionalName);
      const professionalUpdate = await fetch(
        `${url}/api/admin/professionals/${catalogProfessional.id}`,
        {
          method: "PUT",
          headers: catalogHeaders,
          body: JSON.stringify({
            name: professionalName,
            role: "Especialista actualizado",
            price: 125000,
            distance: "4 km",
            available: true,
            tags: ["Pruebas", "PostgreSQL"],
            text: "Perfil actualizado por la integración PostgreSQL.",
          }),
        },
      );
      assert.equal(professionalUpdate.status, 200);
      assert.equal(
        (await professionalUpdate.json()).role,
        "Especialista actualizado",
      );
      const professionalArchive = await fetch(
        `${url}/api/admin/professionals/${catalogProfessional.id}`,
        { method: "DELETE", headers: catalogHeaders },
      );
      assert.equal(professionalArchive.status, 200);
      assert.equal(
        (await professionalArchive.json()).archived,
        catalogProfessional.id,
      );
      const archivedProfessionalSearch = await fetch(
        `${url}/api/professionals?q=${encodeURIComponent(professionalName)}`,
      );
      assert.equal(archivedProfessionalSearch.status, 200);
      assert.equal(
        (await archivedProfessionalSearch.json()).some(
          (item) => item.id === catalogProfessional.id,
        ),
        false,
      );

      const jobTitle = `Trabajo PostgreSQL ${catalogSuffix}`;
      const jobCreation = await fetch(`${url}/api/admin/jobs`, {
        method: "POST",
        headers: catalogHeaders,
        body: JSON.stringify({
          title: jobTitle,
          category: "Pruebas",
          budget: "Gs. 200.000",
          place: "Asunción",
          date: "Fecha a coordinar",
          urgent: true,
        }),
      });
      assert.equal(jobCreation.status, 201);
      const catalogJob = await jobCreation.json();
      assert.equal(catalogJob.owner, "Administrador Mbapo");
      const jobUpdate = await fetch(`${url}/api/admin/jobs/${catalogJob.id}`, {
        method: "PUT",
        headers: catalogHeaders,
        body: JSON.stringify({
          title: jobTitle,
          category: "Pruebas",
          budget: "Gs. 250.000",
          place: "Fernando de la Mora",
          date: "Próxima semana",
          urgent: false,
        }),
      });
      assert.equal(jobUpdate.status, 200);
      assert.equal((await jobUpdate.json()).urgent, false);
      const jobArchive = await fetch(`${url}/api/admin/jobs/${catalogJob.id}`, {
        method: "DELETE",
        headers: catalogHeaders,
      });
      assert.equal(jobArchive.status, 200);
      assert.equal((await jobArchive.json()).archived, catalogJob.id);
      const archivedJobSearch = await fetch(`${url}/api/jobs?category=Pruebas`);
      assert.equal(archivedJobSearch.status, 200);
      assert.equal(
        (await archivedJobSearch.json()).some(
          (item) => item.id === catalogJob.id,
        ),
        false,
      );
      const catalogAudit = await fetch(`${url}/api/admin/audit`, {
        headers: catalogHeaders,
      });
      assert.equal(catalogAudit.status, 200);
      const catalogAuditEntries = await catalogAudit.json();
      assert.ok(
        catalogAuditEntries.some(
          (entry) =>
            entry.action === "professional.archived" &&
            entry.entityId === String(catalogProfessional.id),
        ),
      );
      assert.ok(
        catalogAuditEntries.some(
          (entry) =>
            entry.action === "job.archived" &&
            entry.entityId === String(catalogJob.id),
        ),
      );
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

      const onboardingRegistration = await fetch(`${url}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Onboarding PostgreSQL",
          email: `onboarding-${Date.now()}@example.com`,
          password: "password-onboarding-postgres-123",
        }),
      });
      assert.equal(onboardingRegistration.status, 201);
      const onboardingAccount = await onboardingRegistration.json();
      const onboardingDate = "2037-05-19";
      const onboarding = await fetch(`${url}/api/professional/onboarding`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${onboardingAccount.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "Electricista residencial",
          price: 120000,
          tags: ["Electricidad", "Urgencias"],
          serviceAreas: ["Asunción"],
          text: "Instalaciones y reparaciones eléctricas responsables.",
          availability: [
            {
              day: new Date(`${onboardingDate}T12:00:00`).getDay(),
              start: "08:00",
              end: "18:00",
            },
          ],
        }),
      });
      assert.equal(onboarding.status, 201);
      const onboarded = await onboarding.json();
      assert.equal(onboarded.user.role, "professional");
      const availabilityUpdate = await fetch(
        `${url}/api/professional/availability`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${onboarded.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([
            {
              day: new Date(`${onboardingDate}T12:00:00`).getDay(),
              start: "09:00",
              end: "17:00",
            },
          ]),
        },
      );
      assert.equal(availabilityUpdate.status, 200);
      const onboardedSlots = await fetch(
        `${url}/api/professionals/${onboarded.professional.id}/availability?date=${onboardingDate}`,
      );
      assert.equal(onboardedSlots.status, 200);
      assert.ok((await onboardedSlots.json()).slots.includes("09:00 - 11:00"));

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
      const professionalLogout = await fetch(`${url}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${professionalSession.token}` },
      });
      assert.equal(professionalLogout.status, 204);
      const revokedProfessional = await fetch(`${url}/api/dashboard`, {
        headers: { Authorization: `Bearer ${professionalSession.token}` },
      });
      assert.equal(revokedProfessional.status, 401);

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
