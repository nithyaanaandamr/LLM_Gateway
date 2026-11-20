import type { FastifyReply } from "fastify";

// Headers that describe the connection or the framing of the original body, not the response.
// We send the body as one buffer on Fastify's own connection, so copying them would give
// conflicting framing (e.g. transfer-encoding and content-length together).
const SKIPPED_HEADERS = new Set([
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

// Web Response from auth.handler -> Fastify reply: status, headers, every Set-Cookie, body
export async function sendWebResponse(
  reply: FastifyReply,
  response: Response,
): Promise<FastifyReply> {
  reply.status(response.status);
  for (const [name, value] of response.headers) {
    // Set-Cookie is copied below, one header per cookie
    if (name === "set-cookie" || SKIPPED_HEADERS.has(name)) continue;
    reply.header(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
  const body = Buffer.from(await response.arrayBuffer());
  return reply.send(body.length > 0 ? body : undefined);
}
