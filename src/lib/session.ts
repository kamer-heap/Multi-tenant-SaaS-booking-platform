import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./session-core";
import type { Session } from "./session-core";

export type { Session };
export { SESSION_COOKIE, verifySessionToken };

export async function getSession(): Promise<Session | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}
