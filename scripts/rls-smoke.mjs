import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error('DATABASE_URL is required');

const adminPgUrl = new URL(adminUrl);\nadminPgUrl.searchParams.delete('schema');\nconst admin = new Client({ connectionString: adminPgUrl.toString() });
await admin.connect();

const tenantA = crypto.randomUUID();
const tenantB = crypto.randomUUID();
const slugA = `ci-a-${tenantA.slice(0, 8)}`;
const slugB = `ci-b-${tenantB.slice(0, 8)}`;
const runtimeRole = 'ltw_runtime_ci';

try {
  const rlsSql = await fs.readFile(new URL('../prisma/rls.sql', import.meta.url), 'utf8');
  await admin.query(rlsSql);

  await admin.query(`DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtimeRole}') THEN
      CREATE ROLE ${runtimeRole} LOGIN;
    END IF;
  END $$;`);
  await admin.query(`GRANT CONNECT ON DATABASE ${admin.connectionParameters.database} TO ${runtimeRole}`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${runtimeRole}`);
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${runtimeRole}`);
  await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${runtimeRole}`);

  await admin.query(
    'INSERT INTO "Tenant" (id,name,slug,"isActive","createdAt","updatedAt") VALUES ($1,$2,$3,true,NOW(),NOW()),($4,$5,$6,true,NOW(),NOW())',
    [tenantA, 'CI Tenant A', slugA, tenantB, 'CI Tenant B', slugB],
  );

  const runtimeUrl = new URL(adminPgUrl.toString());
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = '';
  const runtime = new Client({ connectionString: runtimeUrl.toString() });
  await runtime.connect();
  try {
    await runtime.query(`SET app.is_platform_admin = 'false'`);
    await runtime.query(`SET app.current_tenant_id = '${tenantA}'`);

    const visible = await runtime.query('SELECT id FROM "Tenant" WHERE id = ANY($1::uuid[]) ORDER BY id', [[tenantA, tenantB]]);
    if (visible.rows.length !== 1 || visible.rows[0].id !== tenantA) {
      throw new Error(`RLS tenant read isolation failed: ${JSON.stringify(visible.rows)}`);
    }

    const crossTenant = await runtime.query('SELECT id FROM "Tenant" WHERE id=$1', [tenantB]);
    if (crossTenant.rowCount !== 0) throw new Error('Cross-tenant row was visible');

    let denied = false;
    try {
      await runtime.query(
        'INSERT INTO "Tenant" (id,name,slug,"isActive","createdAt","updatedAt") VALUES ($1,$2,$3,true,NOW(),NOW())',
        [crypto.randomUUID(), 'Wrong Tenant', `wrong-${crypto.randomUUID().slice(0, 8)}`],
      );
    } catch (error) {
      denied = error?.code === '42501';
    }
    if (!denied) throw new Error('RLS WITH CHECK did not reject cross-tenant insert');

    console.log(JSON.stringify({ ok: true, tenantA, tenantB, runtimeRole }, null, 2));
  } finally {
    await runtime.end();
  }
} finally {
  await admin.query('DELETE FROM "Tenant" WHERE id = ANY($1::uuid[])', [[tenantA, tenantB]]).catch(() => undefined);
  await admin.end();
}
