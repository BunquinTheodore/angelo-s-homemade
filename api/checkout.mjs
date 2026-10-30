/* Vercel function: POST /api/checkout. Logic lives in server/handlers.js. */
import shared from "../server/handlers.js";

const { createHandlers, createLogStore, loadEnv } = shared;
const handlers = createHandlers({ env: loadEnv(), store: createLogStore() });

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { status, body } = await handlers.checkout({ rawBody: await request.text(), ip });
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
