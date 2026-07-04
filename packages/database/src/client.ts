import { Pool } from "pg";

export type DatabaseClient = {
  pool: Pool;
  databaseUrl: string;
};

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL ?? "postgres://sp_agent:sp_agent@localhost:54329/sp_agent"): DatabaseClient {
  return {
    pool: new Pool({ connectionString: databaseUrl }),
    databaseUrl
  };
}

export async function checkDatabaseReachable(client: DatabaseClient): Promise<{ reachable: boolean; degradedReason?: string }> {
  try {
    await client.pool.query("select 1");
    return { reachable: true };
  } catch (error) {
    return {
      reachable: false,
      degradedReason: error instanceof Error ? error.message : "Database reachability check failed."
    };
  }
}

