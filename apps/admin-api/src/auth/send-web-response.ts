import type { FastifyReply } from "fastify";

// Web Response from auth.handler -> Fastify reply: status, headers, every Set-Cookie, body
export async function sendWebResponse(
  reply: FastifyReply,
  response: Response,
): Promise<FastifyReply> {
  reply.status(response.status);
  for (const [name, value] of response.headers) {
    // Set-Cookie is copied below, one header per cookie; Fastify sets the length itself
    if (name === "set-cookie" || name === "content-length") continue;
    reply.header(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
  const body = Buffer.from(await response.arrayBuffer());
  return reply.send(body.length > 0 ? body : undefined);
}
