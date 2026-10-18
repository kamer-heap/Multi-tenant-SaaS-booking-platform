import { cookies } from "next/headers";
import { verifySessionToken } from "./session-core";
import type { Session } from "./session-core";

export const SESSION_COOKIE = "session";
export type { Session };
export { verifySessionToken };

export async function getSession(): Promise<Session | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
