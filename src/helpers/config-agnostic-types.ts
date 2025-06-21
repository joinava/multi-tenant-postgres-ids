import type { Tagged } from "type-fest";
import type { EntityTypesConfig, NamedEntityTypeConfigs } from "../index.js";
import type { RepeatedString, UUIDV8 } from "./utils.js";

/**
 * A tenant (user) ID. This is a long (122-bit) random id meant to be
 * unguessable, so that it's impossible for someone to enumerate tenants;
 * compare that to the {@see TenantShortId} below, which would be guessable, but
 * isn't useful on its own, as it only shows up embedded in other, longer ids
 * that are sufficiently unguessable for their context.
 */
export type TenantId = Tagged<UUIDV8, "TenantId">;

/**
 * The unique, 31-bit id that also identifies a tenant, is a pure function of
 * its full Tenant Id, and is embedded into tenant-scoped entity ids.
 */
export type TenantShortId = Tagged<number, "TenantShortId">;

/**
 * An id for any entity besides a tenant (known to follow all the rules outlined
 * above) that lives wholly inside a single tenant. We refer to these as
 * "tenant-scoped entity ids", or just "scoped ids" for short.
 *
 * NOTE: The entity type is a type parameter here, but there's NO WAY to verify
 * it at runtime, as the entity types stored in ids are HINTS that are not safe
 * to rely on in code. Instead, having a parameter here is just useful as a way
 * for us to prevent mixing up one entity's id for another when we're passing
 * them around.
 *
 * If `T` is a union type, the resulting type is NOT equivalent to distributing
 * `T` over the union. We could use a distributive conditional type to acheive
 * that, but that ends up causing more trouble than its worth because it runs
 * into other TS limitations.
 */
export type ScopedId<
  ScopedEntityTypeConfigs extends NamedEntityTypeConfigs,
  T extends keyof ScopedEntityTypeConfigs & string,
> = Tagged<UUIDV8, `TenantScopedEntityId<${T}>`>;

/**
 * An id for any entity besides a tenant (known to follow all the rules outlined
 * above) but that is usable from/by more than one tenant. We refer to these as
 * "cross-tenant entity ids", or just "unscoped ids" for short.
 *
 * NOTE: The entity type is a type parameter here, but there's NO WAY to verify
 * it at runtime, as the entity types stored in ids are HINTS that are not safe
 * to rely on in code. Instead, having a parameter here is just useful as a way
 * for us to prevent mixing up one entity's id for another when we're passing
 * them around.
 *
 * If `T` is a union type, the resulting type is NOT equivalent to distributing
 * `T` over the union. We could use a distributive conditional type to acheive
 * that, but that ends up causing more trouble than its worth because it runs
 * into other TS limitations.
 */
export type UnscopedId<
  CrossTenantEntityTypeConfigs extends NamedEntityTypeConfigs,
  T extends keyof CrossTenantEntityTypeConfigs & string,
> = Tagged<UUIDV8, `CrossTenantEntityId<${T}>`>;

/**
 * An id for any entity. Note that, unlike `ScopedId` and `UnscopedId`, this
 * type does distribute over unions. In other words `Id<'A_ENTITY' | 'B_ENTITY'>`
 * is equivalent to `Id<'A_ENTITY'> | Id<'B_ENTITY'>`, which is the same as
 * `ScopedId<'A_ENTITY'> | ScopedId<'B_ENTITY'>`.
 *
 * (Because this type has to use conditional types to handle `T` being a mix of
 * tenant-scoped and cross-tenant entity types, we'd _already_ paid the cost of
 * using conditional types -- i.e., that they limit TS inference in some cases
 * -- unlike in the other types mentioned, so there was no reason not to make it
 * distribute over unions.)
 */
export type Id<
  C extends EntityTypesConfig,
  K extends (keyof C["tenantScoped"] | keyof C["crossTenant"]) & string,
> =
  | (K & keyof C["tenantScoped"] extends never
      ? never
      : K & keyof C["tenantScoped"] extends infer T2 extends string
        ? { [K in T2]: ScopedId<C["tenantScoped"], K> }[T2]
        : never)
  | (K & keyof C["crossTenant"] extends never
      ? never
      : K & keyof C["crossTenant"] extends infer T2 extends string
        ? { [K in T2]: UnscopedId<C["crossTenant"], K> }[T2]
        : never);

/**
 * The core types of ids, mapped to the leading bits that identify them..
 */
export const IdType = {
  TENANT_ID: "000",
  TENANT_SCOPED_ENTITY_ID: "1",
  CROSS_TENANT_ENTITY_ID: "001",
} as const;
export type IdType = (typeof IdType)[keyof typeof IdType];

/**
 * A 10-bit code hinting at -- but not guaranteeing anything about -- the type
 * of entity that the ID belongs to. Excluding {@link ReservedEntityTypeHint}
 * below, this gives us 1022 possible entity types. We represent these as bit
 * strings for better type checking (i.e., because TS can actually
 * represent/enumerate a union of all the possible legal codes).
 *
 * This is a _hint_, usable for debugging but not something that our code will
 * actually parse and validate or otherwise rely on. The reasons not to rely on
 * this are:
 *
 * - It's pretty common to _split_ an entity type. E.g., we had workflow
 *   templates that got split into "public workflow templates" and "internal,
 *   per-business workflow templates", which were different enough in their
 *   fields and business rules that it was useful to store them in different
 *   tables/think of them different. If we had had an entity type hint code for
 *   "workflow template", we could've kept using the same code after the split,
 *   but that wouldn't have given maximal debugging information; or, we could've
 *   made up new, more preciise entity type hint codes, but then, if code were
 *   introspecting the entity type and validating based on it, all that code
 *   would break. So, the solution is to not have code introspecting this entity
 *   type hint.
 *
 * - It's possible that we might decide that some existing entities should be
 *   able to _change_ types. E.g., we might hypothetically decide that we want
 *   to convert an internal workflow template to a public template, and having
 *   the type hard-coded in the id (in an introspectable-to-code way) would
 *   obviously make that impossible w/o some extra system.
 *
 * - Entity type codes could even get reused if we run out (reassigning one from
 *   a deprecated/little-used entity to a new one that's more common), or we
 *   might even start using some of the bits of the entity type hint for random
 *   data, if we end up needing more collision resistance.
 *
 * - Grouping multiple of the long-tail entities under an "other" entity type
 *   hint, since knowing the exact entity type may be less useful in deugging
 *   contexts.
 */
export type EntityTypeHint = Exclude<
  ShortBinaryString<10>,
  // We reserve 00000000000 and 11111111111.
  RepeatedString<10, "0"> | RepeatedString<10, "1">
>;

/**
 * The rate at which we expect to insert entities of a given type. This dictates
 * how the remaining bits of the id will be filled to offer sufficient collision
 * resistance while preserving as much unguessability of the id as possible.
 */
export type InsertRate =
  // Very low means we insert under 1000 in a typical day
  // and almost never insert more than 10 at once.
  "VERY_LOW";

/**
 * However, for short binary strings, we can actually represent the set of all
 * possible strings of a given length as a union of string literals, so we use a
 * helper type to make that easier.
 */
export type ShortBinaryString<Length extends number> = RepeatedString<
  Length,
  "0" | "1"
>;
