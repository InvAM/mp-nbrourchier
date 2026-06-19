import { MercadoPagoConfig, Preference } from "mercadopago";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { serverLog } from "@/lib/server-log";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

// Catálogo de productos — precios solo aquí (server-side)
const PRODUCTS = {
  "curso-marketing": {
    title: "Curso de Marketing Digital",
    description: "Acceso completo al curso de marketing digital",
    price: 150,
  },
  "curso-ventas": {
    title: "Curso de Ventas Online",
    description: "Acceso completo al curso de ventas online",
    price: 100,
  },
  default: {
    title: "Plan Premium - Servicio Digital",
    description: "Acceso completo a todas las funcionalidades premium",
    price: 50,
  },
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { product_id, session_id } = body;
    const product = PRODUCTS[product_id] || PRODUCTS["default"];
    serverLog.info("create-preference", "Incoming request", {
      productId: product_id || "default",
      sessionId: session_id || "",
    });

    const preference = new Preference(client);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const externalReference = session_id || `checkout-${product_id || "default"}-${randomUUID()}`;
    const notificationUrl = `${baseUrl}/api/webhook`;
    serverLog.info("create-preference", "Creating preference in Mercado Pago", {
      externalReference,
      notificationUrl,
      amount: product.price,
    });

    const result = await preference.create({
      body: {
        items: [
          {
            id: product_id || "default",
            title: product.title,
            description: product.description,
            quantity: 1,
            unit_price: product.price,
            currency_id: "PEN",
          },
        ],
        payment_methods: {
          excluded_payment_types: [],
          excluded_payment_methods: [],
        },
        external_reference: externalReference,
        notification_url: notificationUrl,
      },
    });

    return NextResponse.json({
      preferenceId: result.id,
      amount: product.price,
    });
  } catch (error) {
    serverLog.error("create-preference", "Failed to create preference", {
      error: error?.message || String(error),
    });
    return NextResponse.json(
      { error: "Error al crear la preferencia de pago" },
      { status: 500 }
    );
  }
}
