/* Vercel function: POST /api/paymongo/webhook. Reads the raw body so the signature can be verified. */
import shared from "../../server/handlers.js";

const { createHandlers, createLogStore, loadEnv } = shared;
const handlers = createHandlers({ env: loadEnv(), store: createLogStore() });

export async function POST(request) {
  const rawBody = await request.text();
  const { status, body } = await handlers.webhook({ rawBody, signature: request.headers.get("paymongo-signature") });
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
