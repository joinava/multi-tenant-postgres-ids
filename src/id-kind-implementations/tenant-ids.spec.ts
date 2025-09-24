import fc from "fast-check";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { instantiateTaggedType } from "type-party/runtime/tagged-types.js";
import {
  parse as uuidParse,
  validate as uuidValidate,
  version as uuidVersion,
} from "uuid";
import { makeFastCheckArbitraries } from "../fast-check.js";
import type { UUIDV4 } from "../helpers/utils.js";
import { exampleConfig } from "../test-helpers/exampleConfigFixture.js";
import { uuidToBitString } from "../test-helpers/helpers.js";
import {
  getTenantShortIdFromFullId,
  isTenantId,
  makeTenantId,
  stringIsTenantId,
  uuidV4ToTenantId,
} from "./tenant-ids.js";

const { CrossTenantIdArbitrary, TenantIdArbitrary, TenantScopedIdArbitrary } =
  makeFastCheckArbitraries(exampleConfig);

describe("TenantIds", () => {
  describe("makeTenantId", () => {
    it("should generate a valid id", () => {
      const allIds: string[] = [];

      for (const _i of Array(100)) {
        const id = makeTenantId();

        // Make sure it's a valid uuid
        assert.strictEqual(uuidValidate(id), true);

        const idBits = uuidToBitString(id);
        allIds.push(idBits);

        // check for leading bits
        assert.strictEqual(idBits.startsWith("000"), true);

        // check version bits, as mandated by uuid rfc 9562 for v8 ids.
        const version8BitString = "1000";
        assert.strictEqual(uuidVersion(id), 8);
        assert.strictEqual(idBits.slice(48, 52), version8BitString);

        // check variant bits, as mandated by uuid rfc 9562.
        assert.strictEqual(idBits[64], "1");
        assert.strictEqual(idBits[65], "0");
      }

      // Assert that, except for leading bits + version + variant bits, there
      // are no other bits that are always the same. This is a basic/imperfect
      // check that we're filling in the randomness correctly. The chance that
      // any of the 119 bits that are supposed to be filled randomly are filled
      // the same in all 100 generated ids is astronomically low.
      for (let i = 0; i < 128; i++) {
        if ([0, 1, 2, 48, 49, 50, 51, 64, 65].includes(i)) {
          continue;
        }

        assert.strictEqual(
          allIds.every((idBits) => idBits[i] === allIds[0]![i]),
          false
        );
      }
    });
  });

  describe("getTenantShortIdFromFullId", () => {
    it("should extract the tenant short id from a tenant id", () => {
      const tenantId = makeTenantId();
      const tenantShortId = getTenantShortIdFromFullId(tenantId);
      const idParsed = uuidParse(tenantId);
      const trailing32Bits = new DataView(idParsed.buffer).getUint32(12);
      // Use BigInts to make sure that the actual code, which uses standard JS
      // numbers, isn't subject to any overflow bugs.
      assert.strictEqual(
        BigInt(tenantShortId),
        BigInt(trailing32Bits) & BigInt(0x7fffffff)
      );
    });
  });

  describe("isTenantId", () => {
    it("should return true iff it's given a tenant id", () => {
      fc.assert(
        fc.property(
          TenantScopedIdArbitrary,
          TenantIdArbitrary,
          CrossTenantIdArbitrary,
          (ownedId, tenantId, unownedId) => {
            assert.strictEqual(isTenantId(tenantId), true);
            assert.strictEqual(isTenantId(ownedId), false);
            assert.strictEqual(isTenantId(unownedId), false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("uuidV4ToTenantId", () => {
    it("should simply + deterministically convert uuid v4 ids to tenant ids", () => {
      const legacyPublicId = instantiateTaggedType<UUIDV4>(
        "56dddf8a-604c-4594-889f-f3d6d1e1c8d4"
      );

      const tenantId = uuidV4ToTenantId(legacyPublicId);
      assert.strictEqual(stringIsTenantId(tenantId), true);
      assert.strictEqual(tenantId, "16dddf8a-604c-8594-889f-f3d6d1e1c8d4");
    });
  });
});
