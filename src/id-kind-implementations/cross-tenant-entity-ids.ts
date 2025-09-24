import type { Satisfies } from "type-party";
import { instantiateTaggedType } from "type-party/runtime/tagged-types.js";
import { stringify as uuidStringify } from "uuid";
import type {
  ShortBinaryString,
  UnscopedId,
} from "../helpers/config-agnostic-types.js";
import {
  assertUnreachable,
  interposeVersionAndVariant,
  isUUIDV8,
  makeUUIDBuffer,
  type UUIDV8,
} from "../helpers/utils.js";
import { type NamedEntityTypeConfigs } from "../index.js";

export function makeMakeUnscopedIdBound<T extends NamedEntityTypeConfigs>(
  crossTenantEntityTypeConfigs: T
) {
  return <K extends keyof T & string>(
    entityType: K,
    date: Date = new Date()
  ) => {
    return makeUnscopedId(crossTenantEntityTypeConfigs, entityType, date);
  };
}

export function makeUnscopedId<
  T extends NamedEntityTypeConfigs,
  K extends keyof T & string,
>(
  crossTenantEntityTypeConfigs: T,
  entityType: K,
  date: Date = new Date()
): UnscopedId<T, K> {
  const buf = makeUUIDBuffer();
  const bytes = new Uint8Array(buf);
  const { entityTypeHint, insertRate } =
    crossTenantEntityTypeConfigs[entityType]!;

  // Type-level alarm to make sure the entity type hint
  // is the length that we're assuming below.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type _TypeLevelCheck = Satisfies<
    typeof entityTypeHint,
    ShortBinaryString<10>
  >;

  // Other insert rates may need different remaining bits codes, and/or
  // different ways of filling the opaque data after the entity type hint.
  if (insertRate !== "VERY_LOW") {
    assertUnreachable(insertRate, "Only very low insert rate is supported");
  }

  const timestamp = date.valueOf().toString(2).padStart(42, "0");
  const randomBytes = crypto.getRandomValues(new Uint8Array(9));

  // Set leading bits to 001, per unowned id rules.
  // Then, at the same time, add the 000 remaining bits code,
  // and the first two bits of the timestamp
  bytes[0] = parseInt(`001000${timestamp.slice(0, 2)}`, 2);

  bytes[1] = parseInt(timestamp.slice(2, 10), 2);
  bytes[2] = parseInt(timestamp.slice(10, 18), 2);
  bytes[3] = parseInt(timestamp.slice(18, 26), 2);
  bytes[4] = parseInt(timestamp.slice(26, 34), 2);
  bytes[5] = parseInt(timestamp.slice(34, 42), 2);

  // Then, add the leading bits of the entity type hint
  bytes[6] = parseInt(entityTypeHint.slice(0, 8), 2);

  // And the rest of the entity type hint and the start of the random bytes
  bytes[7] =
    (parseInt(entityTypeHint.slice(8), 2) << 6) | (randomBytes[0]! >> 2);

  bytes.set(randomBytes.subarray(1), 8);

  interposeVersionAndVariant(buf);
  return instantiateTaggedType<UnscopedId<T, K>>(uuidStringify(bytes));
}

/**
 * NB: filling in T is just a convenient way to do a cast if you (think you)
 * know what type of id you're getting from the outside world.
 */
export function isUnscopedId<
  CrossTenantEntityTypeConfigs extends NamedEntityTypeConfigs,
  K extends keyof CrossTenantEntityTypeConfigs & string,
>(id: UUIDV8): id is UnscopedId<CrossTenantEntityTypeConfigs, K> {
  // validate leading bits are 001000xx
  return id[0] === "2" && parseInt(id[1]!, 16) < 4;
}

/**
 * NB: filling in T is just a convenient way to do a cast if you (think you)
 * know what type of id you're getting from the outside world.
 */
export function stringIsUnscopedId<
  CrossTenantEntityTypeConfigs extends NamedEntityTypeConfigs,
  K extends keyof CrossTenantEntityTypeConfigs & string,
>(id: string): id is UnscopedId<CrossTenantEntityTypeConfigs, K> {
  return isUUIDV8(id) && isUnscopedId(id);
}
