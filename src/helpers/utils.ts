import type { Tagged } from "type-fest";
import { instantiateTaggedType } from "type-party/runtime/tagged-types.js";
import { validate as uuidValidate, version as uuidVersion } from "uuid";
import type { ShortBinaryString } from "./config-agnostic-types.js";

/**
 * An ArrayBuffer known to be 16 bytes, for holding UUID data.
 */
export type UUIDBuffer = Tagged<
  ArrayBuffer,
  "FixedLengthArrayBuffer",
  { length: 16 }
>;

export function makeUUIDBuffer() {
  return instantiateTaggedType<UUIDBuffer>(new ArrayBuffer(16));
}

export type UUID = Tagged<string, "UUID">;
export type UUIDV4 = Tagged<UUID, "UUIDV4">;
export type UUIDV8 = Tagged<UUID, "UUIDV8">;

export function isUUIDV8(id: string): id is UUIDV8 {
  return uuidValidate(id) && uuidVersion(id) === 8;
}

/**
 * MODIFIES THE GIVEN BUFFER IN PLACE.
 *
 * Adds the version and variant bits at the place that the uuid spec mandates.
 * In the process, it shifts subsequent bits to the right, which means that the
 * last 6 bits of the buffer are discarded (so these should be data you don't
 * care about).
 */
export function interposeVersionAndVariant(buf: UUIDBuffer) {
  // The first 48 bits don't need to change; version + variant go after those.
  // So, just read the remaining 10 bytes and, for simplicity, work with them as
  // a string of bits.
  const view = new DataView(buf);
  const last10Bytes = (
    (view.getBigUint64(6, false) << 16n) |
    BigInt(view.getUint16(14, false))
  )
    .toString(2)
    .padStart(80, "0");

  // Replace last 10 bytes, inserting version and variant bits, per [RFC
  // 9562](https://www.rfc-editor.org/rfc/rfc9562), discarding last 6 bits of
  // the original last 10 bytes. Var names below are 0-indexed.
  const version8BitString = "1000" satisfies ShortBinaryString<4>;

  const bytes6And7 = parseInt(version8BitString + last10Bytes.slice(0, 12), 2);
  const bytes8To12 = parseInt("10" + last10Bytes.slice(12, 42), 2);
  const bytes12To15 = parseInt(last10Bytes.slice(42, 74), 2);

  view.setUint16(6, bytes6And7, false);
  view.setUint32(8, bytes8To12, false);
  view.setUint32(12, bytes12To15, false);

  return buf;
}

export function assertUnreachable(it: never, errorMessage?: string): never {
  throw new Error(errorMessage ?? "Should be unreachable");
}

/**
 * Creates a type representing a string where some set of allowed characters
 * repeat N times. Requires full padding to make all the strings N chars long.
 */
export type RepeatedString<
  Len extends number,
  LegalChars extends string,
  Arr extends LegalChars[] = [],
> = Arr["length"] extends Len
  ? ArrayJoin<Arr>
  : RepeatedString<Len, LegalChars, [...Arr, LegalChars]>;

type ArrayJoin<Arr extends string[]> = Arr extends [
  infer First extends string,
  ...infer Rest extends string[],
]
  ? `${First}${ArrayJoin<Rest>}`
  : "";
