import { NextResponse } from "next/server";

// Orígenes permitidos (Systeme.io + localhost para dev)
const ALLOWED_ORIGINS = [
  "https://systeme.io",
  /^https:\/\/.*\.systeme\.io$/,
  "http://localhost:3000",
  "https://curso.mamadecasa.com",
  "https://comprehensive-upon-leaving-managers.trycloudflare.com"
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((allowed) =>
    allowed instanceof RegExp ? allowed.test(origin) : allowed === origin
  );
}

export function proxy(request) {
  const origin = request.headers.get("origin") || "";
  const isAllowed = isAllowedOrigin(origin);

  // Preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": isAllowed ? origin : "",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Respuesta normal — agregar headers CORS
  const response = NextResponse.next();
  if (isAllowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }
  return response;
}

// Solo aplicar a rutas de API
export const config = {
  matcher: "/api/:path*",
};
