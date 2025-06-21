import { instantiateTaggedType } from "@ethanresnick/type-party";
import fc from "fast-check";
import type { UUIDV4 } from "./helpers/utils.js";
import { makeUnscopedId } from "./id-kind-implementations/cross-tenant-entity-ids.js";
import { uuidV4ToTenantId } from "./id-kind-implementations/tenant-ids.js";
import { makeScopedId } from "./id-kind-implementations/tenant-scoped-entity-ids.js";
import type { EntityTypesConfig } from "./index.js";

// A date in the range of dates that can be represented in a ZingageId.
// TODO: this may need to be adjusted for different timestamp formats
// if/as we evolve more remaining bit type codes.
const IdDateArbitrary = fc.date({
  min: new Date(0),
  max: new Date(2 ** 42 - 1),
  noInvalidDate: true,
});

export function makeFastCheckArbitraries<T extends EntityTypesConfig>(
  entityConfigs: T
) {
  const { tenantScoped, crossTenant } = entityConfigs;
  const TenantScopedEntityTypeArbitrary = fc.constantFrom(
    ...(Object.keys(tenantScoped) as (keyof T["tenantScoped"] & string)[])
  );
  const CrossTenantEntityTypeArbitrary = fc.constantFrom(
    ...(Object.keys(crossTenant) as (keyof T["crossTenant"] & string)[])
  );

  // In this arbitrary, we _don't_ just call makeTenantId(), because we want the
  // arbitary's values to be a deterministic function of the underlying
  // fast-check-managed randomness seed. So, we have it generate a random UUID,
  // then convert it deterministically to a business ID.
  //
  // NB: don't have this arbitrary filter values by isBusinessId(), because its
  // output is used to test that function.
  const TenantIdArbitrary = fc
    .uuid({ version: 4 })
    .map((it) => uuidV4ToTenantId(instantiateTaggedType<UUIDV4>(it)));

  // NB: don't have this arbitrary filter values by isTenantScopedEntityId(), because
  // its output is used to test that function.
  const TenantScopedIdArbitrary = fc
    .tuple(TenantIdArbitrary, TenantScopedEntityTypeArbitrary, IdDateArbitrary)
    .map(([tenantId, type, date]) =>
      makeScopedId(tenantScoped, tenantId, type, date)
    );

  // NB: don't have this arbitrary filter values by isCrossTenantEntityId(),
  // because its output is used to test that function.
  const CrossTenantIdArbitrary = fc
    .tuple(CrossTenantEntityTypeArbitrary, IdDateArbitrary)
    .map(([type, date]) => makeUnscopedId(crossTenant, type, date));

  return {
    TenantScopedEntityTypeArbitrary,
    CrossTenantEntityTypeArbitrary,
    IdDateArbitrary,
    TenantIdArbitrary,
    TenantScopedIdArbitrary,
    CrossTenantIdArbitrary,
  };
}
