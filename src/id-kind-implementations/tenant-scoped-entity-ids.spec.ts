import fc from "fast-check";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { makeFastCheckArbitraries } from "../fast-check.js";
import { exampleConfig } from "../test-helpers/exampleConfigFixture.js";
import { uuidToBitString } from "../test-helpers/helpers.js";
import { getTenantShortIdFromFullId, makeTenantId } from "./tenant-ids.js";
import {
  getTenantShortIdFromScopedId,
  isScopedId,
  makeScopedId,
} from "./tenant-scoped-entity-ids.js";

const {
  TenantIdArbitrary,
  TenantScopedIdArbitrary,
  TenantScopedEntityTypeArbitrary,
  CrossTenantIdArbitrary,
  IdDateArbitrary,
} = makeFastCheckArbitraries(exampleConfig);

describe("Tenant-Scoped Entity IDs", () => {
  describe("makeScopedId", () => {
    it("should generate a valid id", () => {
      const allIds: string[] = [];

      for (const _i of Array(100)) {
        const tenantId = makeTenantId();
        const ownedId = makeScopedId(
          exampleConfig.tenantScoped,
          tenantId,
          "ACCOUNT"
        );

        const ownedIdBits = uuidToBitString(ownedId);
        const tenantIdBits = uuidToBitString(tenantId);

        allIds.push(ownedIdBits);

        assert.equal(uuidValidate(ownedId), true);
        assert.equal(uuidVersion(ownedId), 8);

        // Leading bit (for id type)
        assert.equal(ownedIdBits[0], "1");

        // Owning tenant id bits
        assert.equal(ownedIdBits.slice(1, 32), tenantIdBits.slice(-31));

        // Remaining bits code
        assert.equal(ownedIdBits.slice(32, 35), "000");

        // Timestamp bits, which will have gotten split by the version and
        // variant bits. (That's annoying to test, but doesn't effect sort
        // order.)
        const timestampBitsPreVersion = ownedIdBits.slice(35, 48);
        const timestampBitsPostVersionPreVariant = ownedIdBits.slice(52, 64);
        const timestampBitsPostVariant = ownedIdBits.slice(66, 83);
        const timestampBits =
          timestampBitsPreVersion +
          timestampBitsPostVersionPreVariant +
          timestampBitsPostVariant;

        const timestamp = parseInt(timestampBits, 2);

        assert.ok(Date.now() - timestamp >= 0);
        assert.ok(Date.now() - timestamp < 100);

        // Entity type code (not meant to be parsed by code; just for
        // debugging) This comes after the leading 1 bit + owning tenant id
        // bits + 000 + timestamp bits + version + variant bits.
        assert.equal(ownedIdBits.slice(83, 93), "0000000001");
      }

      // Assert that the bits we expect to be random are not the same between
      // all of the generated ids. (If they are being generated randomly, the
      // chance that they are the same is astronomically low.)
      for (let i = 93; i < 128; i++) {
        assert.equal(
          allIds[0] && allIds.every((idBits) => idBits[i] === allIds[0]![i]),
          false
        );
      }
    });
  });

  describe("isScopedId", () => {
    it("should return true iff it's given a scoped id", () => {
      fc.assert(
        fc.property(
          TenantScopedIdArbitrary,
          TenantIdArbitrary,
          CrossTenantIdArbitrary,
          (ownedId, tenantId, unownedId) => {
            assert.equal(isScopedId(ownedId), true);
            assert.equal(isScopedId(tenantId), false);
            assert.equal(isScopedId(unownedId), false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("getTenantShortIdFromScopedId", () => {
    it("should extract the tenant short id from a scoped id", () => {
      fc.assert(
        fc.property(
          fc.tuple(
            TenantIdArbitrary,
            TenantScopedEntityTypeArbitrary,
            IdDateArbitrary
          ),
          ([tenantId, entityType, date]) => {
            const scopedId = makeScopedId(
              exampleConfig.tenantScoped,
              tenantId,
              entityType,
              date
            );
            const tenantShortId = getTenantShortIdFromScopedId(scopedId);
            assert.equal(tenantShortId, getTenantShortIdFromFullId(tenantId));
          }
        )
      );
    });
  });
});
