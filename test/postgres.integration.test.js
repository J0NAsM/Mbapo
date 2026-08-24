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
      const booking = await fetch(`${url}/api/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          professionalId: 1,
          date: "2037-05-18",
          time: "09:00 - 11:00",
          place: "AsunciÃ³n",
        }),
      });
      assert.equal(booking.status, 201);

      const sentMessage = await fetch(`${url}/api/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          professionalId: 1,
          text: "Mensaje de persistencia PostgreSQL.",
        }),
      });
      assert.equal(sentMessage.status, 201);
      const thread = await fetch(`${url}/api/messages/1`, { headers });
      assert.equal(thread.status, 200);
      assert.equal((await thread.json()).at(-1).author, "client");
      const conversations = await fetch(`${url}/api/conversations`, {
        headers,
      });
      assert.equal(conversations.status, 200);
      assert.equal((await conversations.json())[0].professionalId, 1);

      const reviews = await fetch(`${url}/api/professionals/1/reviews?limit=5`);
      assert.equal(reviews.status, 200);
      assert.ok(Array.isArray((await reviews.json()).items));

      const dashboard = await fetch(`${url}/api/dashboard`, { headers });
      assert.equal(dashboard.status, 200);
      assert.ok((await dashboard.json()).bookings.length >= 1);

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
