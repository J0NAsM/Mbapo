function normalizedProfile(profile, accountId) {
  return {
    ...(profile || {}),
    id: profile?.id || accountId,
    favorites: Array.isArray(profile?.favorites) ? profile.favorites : [],
    savedSearches: Array.isArray(profile?.savedSearches)
      ? profile.savedSearches
      : [],
  };
}

function serializedFilters(filters) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(filters || {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function sameSavedSearch(left, right) {
  return (
    left.query === right.query &&
    left.category === right.category &&
    serializedFilters(left.filters) === serializedFilters(right.filters)
  );
}

export function createProfilesRepository(pool) {
  if (!pool) return null;

  const lockProfile = async (client, accountId, fallbackProfile) => {
    const result = await client.query(
      "SELECT payload FROM user_profiles WHERE account_id = $1 FOR UPDATE",
      [accountId],
    );
    return normalizedProfile(
      result.rows[0]?.payload || fallbackProfile,
      accountId,
    );
  };

  const saveProfile = async (client, accountId, profile) => {
    await client.query(
      "INSERT INTO user_profiles (account_id, payload, updated_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT (account_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
      [accountId, JSON.stringify(profile)],
    );
  };

  return {
    async update(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const profile = await lockProfile(
          client,
          input.accountId,
          input.fallbackProfile,
        );
        const nextProfile = {
          ...profile,
          ...(input.changes.name ? { name: input.changes.name } : {}),
          ...(input.changes.skill ? { skill: input.changes.skill } : {}),
          ...(input.changes.hourlyRate
            ? { hourlyRate: input.changes.hourlyRate }
            : {}),
        };
        await saveProfile(client, input.accountId, nextProfile);
        await client.query("COMMIT");
        return nextProfile;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async toggleFavorite(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const professional = await client.query(
          "SELECT 1 FROM professionals WHERE id = $1",
          [input.professionalId],
        );
        if (!professional.rowCount) {
          await client.query("COMMIT");
          return { error: "professional" };
        }
        const profile = await lockProfile(
          client,
          input.accountId,
          input.fallbackProfile,
        );
        const favorites = [...profile.favorites];
        const index = favorites.indexOf(input.professionalId);
        if (index >= 0) favorites.splice(index, 1);
        else favorites.push(input.professionalId);
        const nextProfile = { ...profile, favorites };
        await saveProfile(client, input.accountId, nextProfile);
        await client.query("COMMIT");
        return { favorites };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listSavedSearches(accountId, fallbackProfile) {
      const result = await pool.query(
        "SELECT payload FROM user_profiles WHERE account_id = $1",
        [accountId],
      );
      return normalizedProfile(
        result.rows[0]?.payload || fallbackProfile,
        accountId,
      ).savedSearches;
    },

    async createSavedSearch(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const profile = await lockProfile(
          client,
          input.accountId,
          input.fallbackProfile,
        );
        if (
          profile.savedSearches.some((item) =>
            sameSavedSearch(item, input.search),
          )
        ) {
          await client.query("COMMIT");
          return { error: "duplicate" };
        }
        const nextProfile = {
          ...profile,
          savedSearches: [input.search, ...profile.savedSearches].slice(0, 10),
        };
        await saveProfile(client, input.accountId, nextProfile);
        await client.query(
          "INSERT INTO growth_events (id, payload, actor_account_id, occurred_at) VALUES ($1,$2::jsonb,$3,$4)",
          [
            input.event.id,
            JSON.stringify(input.event),
            input.event.actorId,
            input.event.occurredAt,
          ],
        );
        await client.query("COMMIT");
        return { search: input.search };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteSavedSearch(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const profile = await lockProfile(
          client,
          input.accountId,
          input.fallbackProfile,
        );
        const index = profile.savedSearches.findIndex(
          (search) => search.id === input.searchId,
        );
        if (index < 0) {
          await client.query("COMMIT");
          return { error: "missing" };
        }
        const savedSearches = [...profile.savedSearches];
        savedSearches.splice(index, 1);
        await saveProfile(client, input.accountId, {
          ...profile,
          savedSearches,
        });
        await client.query("COMMIT");
        return { removed: input.searchId };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async recordEvent(event) {
      await pool.query(
        "INSERT INTO growth_events (id, payload, actor_account_id, occurred_at) VALUES ($1,$2::jsonb,$3,$4)",
        [event.id, JSON.stringify(event), event.actorId, event.occurredAt],
      );
    },
  };
}
