import fc from "fast-check";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import { makeFastCheckArbitraries } from "../fast-check.js";
import { exampleConfig } from "../test-helpers/exampleConfigFixture.js";
import { uuidToBitString } from "../test-helpers/helpers.js";
import { isUnscopedId, makeUnscopedId } from "./cross-tenant-entity-ids.js";

const { TenantIdArbitrary, TenantScopedIdArbitrary, CrossTenantIdArbitrary } =
  makeFastCheckArbitraries(exampleConfig);

describe("Cross-Tenant Entity Ids", () => {
  describe("makeUnscopedId", () => {
    it("should generate a valid id", () => {
      const allIds: string[] = [];

      for (const _i of Array(100)) {
        const id = makeUnscopedId(exampleConfig.crossTenant, "ASSET");
        const idBits = uuidToBitString(id);

        allIds.push(idBits);

        assert.equal(uuidValidate(id), true);
        assert.equal(uuidVersion(id), 8);

        const expectedIdTypeBits = "001";
        const expectedRemainingBitsCode = "000";
        const expectedEntityTypeHint =
          exampleConfig.crossTenant["ASSET"].entityTypeHint;

        assert.equal(
          idBits.startsWith(expectedIdTypeBits + expectedRemainingBitsCode),
          true
        );

        // Timestamp bits, which nestle in perfectly just before the version.
        const timestampBits = idBits.slice(6, 48);
        const timestamp = parseInt(timestampBits, 2);

        assert.ok(Date.now() - timestamp >= 0);
        assert.ok(Date.now() - timestamp < 1000);

        // Entity type hint bits, which'll fit right in between the version and
        // variant bits.
        const entityTypeHintBits = idBits.slice(52, 62);
        assert.equal(entityTypeHintBits, expectedEntityTypeHint);
      }

      // Assert that the bits we expect to be random are not the same between
      // all of the generated ids. (If they are being generated randomly, the
      // chance that they are the same is astronomically low.)
      for (let i = 62; i < 128; i++) {
        // skip variant bits
        if (i === 64 || i === 65) {
          continue;
        }

        assert.equal(
          allIds[0] && allIds.every((idBits) => idBits[i] === allIds[0]![i]),
          false
        );
      }
    });
  });

  describe("isCrossTenantEntityId", () => {
    it("should return true iff it's given an unowned id", () => {
      fc.assert(
        fc.property(
          TenantScopedIdArbitrary,
          TenantIdArbitrary,
          CrossTenantIdArbitrary,
          (scopedId, tenantId, unscopedId) => {
            assert.equal(isUnscopedId(unscopedId), true);
            assert.equal(isUnscopedId(tenantId), false);
            assert.equal(isUnscopedId(scopedId), false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
