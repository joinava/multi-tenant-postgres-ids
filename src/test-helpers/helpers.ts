import { parse as uuidParse } from "uuid";

export function uuidToBitString(uuid: string): string {
  return [...uuidParse(uuid)]
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("");
}
