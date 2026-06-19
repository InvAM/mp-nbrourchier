// =============================================================================
// API Route: /api/webhook
// Webhook de Mercado Pago para auditoria/reconciliacion.
// El tagging en Systeme.io se ejecuta en /api/process-payment cuando el pago
// queda approved.
//
// Configura esta URL en tu panel de Mercado Pago:
// https://tu-dominio.com/api/webhook
// =============================================================================

import { MercadoPagoConfig, Payment } from "mercadopago";
import { NextResponse } from "next/server";
import { maskEmail, serverLog } from "@/lib/server-log";

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const paymentId = body.data?.id;
    serverLog.info("webhook", "Webhook received", {
      type: body?.type || "",
      action: body?.action || "",
      topic: body?.topic || "",
      paymentId: paymentId || "",
      hasData: Boolean(body?.data),
    });

    if (body.type === "payment") {
      if (!paymentId) {
        serverLog.warn("webhook", "Payment webhook without paymentId");
        return NextResponse.json({ error: "No payment ID" }, { status: 400 });
      }

      const payment = new Payment(client);
      const paymentInfo = await payment.get({ id: paymentId });
      serverLog.info("webhook", "Payment fetched from Mercado Pago", {
        paymentId: paymentInfo?.id || paymentId,
        status: paymentInfo?.status || "",
        statusDetail: paymentInfo?.status_detail || "",
        externalReference: paymentInfo?.external_reference || "",
        payerEmail: maskEmail(paymentInfo?.payer?.email),
        hasMetadata: Boolean(paymentInfo?.metadata),
      });

      if (paymentInfo.status === "approved") {
        serverLog.info("webhook", "Approved payment received (tagging handled in process-payment)", {
          paymentId: paymentInfo?.id || paymentId,
          externalReference: paymentInfo?.external_reference || "",
          payerEmail: maskEmail(paymentInfo?.payer?.email),
        });
      } else if (paymentInfo.status === "rejected") {
        serverLog.warn("webhook", "Payment rejected", {
          paymentId: paymentInfo?.id || paymentId,
          statusDetail: paymentInfo?.status_detail || "",
        });
      } else {
        serverLog.info("webhook", "Payment status not final approved/rejected", {
          paymentId: paymentInfo?.id || paymentId,
          status: paymentInfo?.status || "",
          statusDetail: paymentInfo?.status_detail || "",
        });
      }
    } else {
      serverLog.info("webhook", "Webhook ignored because type is not payment", {
        receivedType: body?.type || "",
      });
    }

    serverLog.info("webhook", "Returning 200 to Mercado Pago");
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    serverLog.error("webhook", "Unhandled webhook error", {
      error: error?.message || String(error),
    });
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
