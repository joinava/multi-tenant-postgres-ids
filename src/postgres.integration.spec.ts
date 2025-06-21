import fc from "fast-check";
import assert from "node:assert/strict";
import { exec } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";
import pg from "pg";
import { makeFastCheckArbitraries } from "./fast-check.js";
import {
  isUnscopedId,
  makeMakeUnscopedIdBound,
} from "./id-kind-implementations/cross-tenant-entity-ids.js";
import {
  getTenantShortIdFromFullId,
  isTenantId,
} from "./id-kind-implementations/tenant-ids.js";
import {
  isScopedId,
  makeMakeScopedIdBound,
} from "./id-kind-implementations/tenant-scoped-entity-ids.js";
import { exampleConfig } from "./test-helpers/exampleConfigFixture.js";

const {
  TenantIdArbitrary,
  TenantScopedIdArbitrary,
  CrossTenantIdArbitrary,
  IdDateArbitrary,
  TenantScopedEntityTypeArbitrary,
  CrossTenantEntityTypeArbitrary,
} = makeFastCheckArbitraries(exampleConfig);

const makeScopedId = makeMakeScopedIdBound(exampleConfig.tenantScoped);
const makeUnscopedId = makeMakeUnscopedIdBound(exampleConfig.crossTenant);

describe("Database generated Zingage ids", () => {
  let client: pg.Pool;

  before(async () => {
    // Start docker container if not running
    const dockerStartCmd = "docker compose up --wait";
    await promisify(exec)(dockerStartCmd);

    // Wait for DB to be ready
    client = new pg.Pool({
      connectionString:
        "postgres://postgres:postgres@localhost:9000/pg_ids_test",
    });
  });

  after(async () => {
    await client.end();
    await promisify(exec)("docker compose down");
  });

  describe("Tenant-scoped entity ids", () => {
    it("should agree with the js implementation, modulo random bits", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(
              TenantIdArbitrary,
              IdDateArbitrary,
              TenantScopedEntityTypeArbitrary
            ),
            { minLength: 50 }
          ),
          async (generatedData) => {
            const individualResultQueries = generatedData.map(
              ([tenantId, date, entityType]) => {
                const { entityTypeHint, insertRate } =
                  exampleConfig.tenantScoped[entityType];

                const jsGeneratedId = makeScopedId(tenantId, entityType, date);

                const pgUuidBytesExpression = `uuid_send(make_tenant_scoped_entity_id(
                    '${tenantId}', 
                    '${insertRate}',
                    B'${entityTypeHint}', 
                    '${date.toISOString()}'
                  ))`;
                const jsValUuidBytesExpression = `uuid_send('${jsGeneratedId}')`;

                // Compare only the first 93 (i.e., the non-random) bits.
                return `SELECT 
                  substring(${pgUuidBytesExpression} from 1 for 11) = 
                  substring(${jsValUuidBytesExpression} from 1 for 11) AND 
                  (get_byte(${pgUuidBytesExpression}, 11) & B'11111000'::integer) = 
                  (get_byte(${jsValUuidBytesExpression}, 11) & B'11111000'::integer) as res`;
              }
            );

            const allResultsQuery = individualResultQueries.join(" UNION ALL ");
            const allResults = await client.query(allResultsQuery);
            assert.ok(
              allResults.rows.every((row: { res: boolean }) => row.res)
            );
          }
        ),
        { numRuns: 1 }
      );
    });

    it("getting short tenant id from tenant-scoped id should agree with the js implementation", async () => {
      await fc.assert(
        fc.asyncProperty(TenantIdArbitrary, async (tenantId) => {
          const scopedId = makeScopedId(tenantId, "ACCOUNT", new Date());
          const query = `SELECT get_tenant_short_id_from_scoped_id('${scopedId}') as id`;

          const res = await client.query(query);
          assert.equal(res.rows[0]["id"], getTenantShortIdFromFullId(tenantId));
        })
      );
    });
  });

  describe("Cross-tenant entity ids", () => {
    it("should agree with the js implementation, modulo random bits", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.tuple(IdDateArbitrary, CrossTenantEntityTypeArbitrary), {
            minLength: 50,
          }),
          async (gens) => {
            const individualResultQueries = gens.map(([date, entityType]) => {
              const { entityTypeHint, insertRate } =
                exampleConfig.crossTenant[entityType];

              const jsGeneratedId = makeUnscopedId(entityType, date);

              const pgUuidBytesExpression = `uuid_send(make_cross_tenant_entity_id(
                '${insertRate}', 
                B'${entityTypeHint}', 
                '${date.toISOString()}'
              ))`;
              const jsValUuidBytesExpression = `uuid_send('${jsGeneratedId}')`;

              // Compare only the first 62 (i.e., the non-random) bits.
              return `SELECT 
                substring(${pgUuidBytesExpression} from 1 for 7) = 
                substring(${jsValUuidBytesExpression} from 1 for 7) AND 
                (get_byte(${pgUuidBytesExpression}, 7) & B'11111100'::integer) = 
                (get_byte(${jsValUuidBytesExpression}, 7) & B'11111100'::integer) as res`;
            });

            const allResultsQuery = individualResultQueries.join(" UNION ALL ");

            // run these manually in the db.
            const allResults = await client.query(allResultsQuery);
            assert.ok(
              allResults.rows.every((row: { res: boolean }) => row.res)
            );
          }
        ),
        { numRuns: 1 }
      );
    });
  });

  describe("is_xxx_id id classificationdb functions", () => {
    it("should agree with the js implementation", async () => {
      await fc.assert(
        fc.asyncProperty(
          TenantScopedIdArbitrary,
          CrossTenantIdArbitrary,
          TenantIdArbitrary,
          async (ownedId, unownedId, tenantId) => {
            const query = `
              SELECT 
                ARRAY[is_tenant_id('${ownedId}'), is_tenant_scoped_id('${ownedId}'), is_cross_tenant_id('${ownedId}')] as a,
                ARRAY[is_tenant_id('${unownedId}'), is_tenant_scoped_id('${unownedId}'), is_cross_tenant_id('${unownedId}')] as b,
                ARRAY[is_tenant_id('${tenantId}'), is_tenant_scoped_id('${tenantId}'), is_cross_tenant_id('${tenantId}')] as c;`;

            const res = await client.query<{
              a: [boolean, boolean, boolean];
              b: [boolean, boolean, boolean];
              c: [boolean, boolean, boolean];
            }>(query);

            const {
              a: ownedIdResults,
              b: unownedIdResults,
              c: tenantIdResults,
            } = res.rows[0]!;

            // Test tenant-scoped id
            assert.equal(ownedIdResults[0], isTenantId(ownedId));
            assert.equal(ownedIdResults[1], isScopedId(ownedId));
            assert.equal(ownedIdResults[2], isUnscopedId(ownedId));

            // Test unowned id
            assert.equal(unownedIdResults[0], isTenantId(unownedId));
            assert.equal(unownedIdResults[1], isScopedId(unownedId));
            assert.equal(unownedIdResults[2], isUnscopedId(unownedId));

            // Test tenant id
            assert.equal(tenantIdResults[0], isTenantId(tenantId));
            assert.equal(tenantIdResults[1], isScopedId(tenantId));
            assert.equal(tenantIdResults[2], isUnscopedId(tenantId));
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
