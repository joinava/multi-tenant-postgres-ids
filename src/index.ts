import type {
    EntityTypeHint,
    InsertRate,
    ScopedId,
    TenantId,
    TenantShortId,
    UnscopedId,
} from "./helpers/config-agnostic-types.js";
import type { UUIDV4, UUIDV8 } from "./helpers/utils.js";
import {
    isUnscopedId as _isUnscopedId,
    stringIsUnscopedId as _stringIsUnscopedId,
    makeMakeUnscopedIdBound,
} from "./id-kind-implementations/cross-tenant-entity-ids.js";
import {
    getTenantShortIdFromFullId,
    isTenantId,
    makeTenantId,
    stringIsTenantId,
    uuidV4ToTenantId,
} from "./id-kind-implementations/tenant-ids.js";
import {
    getTenantShortIdFromScopedId as _getTenantShortIdFromScopedId,
    isScopedId as _isScopedId,
    scopedIdsBelongToSameTenant as _scopedIdsBelongToSameTenant,
    stringIsScopedId as _stringIsScopedId,
    makeMakeScopedIdBound,
} from "./id-kind-implementations/tenant-scoped-entity-ids.js";

export type {
    Id,
    ScopedId,
    TenantId,
    TenantShortId,
    UnscopedId
} from "./helpers/config-agnostic-types.js";
export type { UUID, UUIDV4, UUIDV8 } from "./helpers/utils.js";

export function initialize<
  const TenantScopedEntityTypeConfigs extends NamedEntityTypeConfigs,
  const CrossTenantEntityTypeConfigs extends NamedEntityTypeConfigs,
>(
  config: Readonly<{
    tenantScoped: TenantScopedEntityTypeConfigs;
    crossTenant: CrossTenantEntityTypeConfigs;
  }>
) {
  type TenantScopedEntityType = keyof TenantScopedEntityTypeConfigs & string;
  type CrossTenantEntityType = keyof CrossTenantEntityTypeConfigs & string;

  return {
    config,
    makeScopedId: makeMakeScopedIdBound(config.tenantScoped),
    isScopedId: _isScopedId as <EntityType extends TenantScopedEntityType>(
      id: UUIDV8 | ScopedId<TenantScopedEntityTypeConfigs, EntityType>
    ) => id is ScopedId<TenantScopedEntityTypeConfigs, EntityType>,
    stringIsScopedId: _stringIsScopedId as <
      EntityType extends TenantScopedEntityType,
    >(
      id: string
    ) => id is ScopedId<TenantScopedEntityTypeConfigs, EntityType>,
    getTenantShortIdFromScopedId: _getTenantShortIdFromScopedId as <
      EntityType extends TenantScopedEntityType,
    >(
      id: ScopedId<TenantScopedEntityTypeConfigs, EntityType>
    ) => TenantShortId,
    scopedIdsBelongToSameTenant: _scopedIdsBelongToSameTenant as <
      EntityType extends TenantScopedEntityType,
    >(
      ids: ScopedId<TenantScopedEntityTypeConfigs, EntityType>[]
    ) => boolean,

    makeUnscopedId: makeMakeUnscopedIdBound(config.crossTenant),
    isUnscopedId: _isUnscopedId as <EntityType extends CrossTenantEntityType>(
      id: UUIDV8 | UnscopedId<CrossTenantEntityTypeConfigs, EntityType>
    ) => id is UnscopedId<CrossTenantEntityTypeConfigs, EntityType>,
    stringIsUnscopedId: _stringIsUnscopedId as <
      EntityType extends CrossTenantEntityType,
    >(
      id: string
    ) => id is UnscopedId<CrossTenantEntityTypeConfigs, EntityType>,

    // Upcasting is needed so that TS doesn't complain when a user of this type
    // tries to consume it. The issue is that, without the upcast, the type of
    // the export is simply `typeof makeTenantId`, but that's defined in
    // `tenant-ids.js` and it is not directly a public export, so TS complains
    // that there's no way for the consumer of this module (in its generated
    // declarations) to refer to that type.
    isTenantId: isTenantId satisfies (id: UUIDV8) => id is TenantId as (
      id: UUIDV8
    ) => id is TenantId,
    makeTenantId: makeTenantId satisfies () => TenantId as () => TenantId,
    uuidV4ToTenantId: uuidV4ToTenantId satisfies (id: UUIDV4) => TenantId as (
      id: UUIDV4
    ) => TenantId,
    getTenantShortIdFromFullId: getTenantShortIdFromFullId satisfies (
      id: TenantId
    ) => TenantShortId as (id: TenantId) => TenantShortId,
    stringIsTenantId: stringIsTenantId satisfies (
      id: string
    ) => id is TenantId as (id: string) => id is TenantId,
  };
}

export type EntityTypesConfig<
  TenantScopedConfigs extends NamedEntityTypeConfigs = NamedEntityTypeConfigs,
  CrossTenantConfigs extends NamedEntityTypeConfigs = NamedEntityTypeConfigs,
> = Readonly<{
  tenantScoped: TenantScopedConfigs;
  crossTenant: CrossTenantConfigs;
}>;

export type NamedEntityTypeConfigs = {
  [k: string]: EntityTypeConfig;
};

export type EntityTypeConfig = {
  insertRate: InsertRate;
  entityTypeHint: EntityTypeHint;
};

type DuplicateTypeHints<T extends NamedEntityTypeConfigs> = {
  [K in keyof T]: T[K]["entityTypeHint"] extends T[Exclude<
    keyof T,
    K
  >]["entityTypeHint"]
    ? K & string
    : never;
}[keyof T];

// Used by callers to apply DuplicateTypeHints as a type-level alarm.
export { type Satisfies } from "type-party";

export type Duplicates<T extends EntityTypesConfig> =
  | (DuplicateTypeHints<T["tenantScoped"]> extends never
      ? never
      : `ERROR: ${DuplicateTypeHints<T["tenantScoped"]>} has the same entity type hint as another tenant-scoped entity.`)
  | (DuplicateTypeHints<T["crossTenant"]> extends never
      ? never
      : `ERROR: ${DuplicateTypeHints<T["crossTenant"]>} has the same entity type hint as another cross-tenant entity.`);
