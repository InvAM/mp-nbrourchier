import { MercadoPagoConfig, Payment } from "mercadopago";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { maskEmail, serverLog, shortValue } from "@/lib/server-log";
import { tagContactByEmail } from "@/lib/systemeio";
import { decryptSession } from "@/lib/session";

// =============================================================================
// API Route: /api/process-payment
// Procesa pagos de Checkout API — Tarjetas + Yape
// Recibe directamente los datos del pago (token, payment_method_id, etc.)
// =============================================================================

const client = new MercadoPagoConfig({
	accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

function hasNonEmptyValue(value) {
	return value !== undefined && value !== null && String(value).trim() !== "";
}

function toAmount(value) {
	const parsed = Number(value);
	if (Number.isNaN(parsed)) return 0;
	return Math.round(parsed * 100) / 100;
}

function getFinalAmount(data) {
	if (!data || typeof data !== "object") return 0;
	if (hasNonEmptyValue(data.finalPrice)) return toAmount(data.finalPrice);
	return toAmount(Number(data.price || 0) - Number(data.discount || 0));
}

export async function POST(request) {
	try {
		const body = await request.json();
		const mergedTagIds = [
			body?.tags?.tag1,
			body?.tags?.tag2,
			...(Array.isArray(body?.tags?.extra) ? body.tags.extra : []),
			...(Array.isArray(body?.tags?.all) ? body.tags.all : []),
		]
			.map((tag) => String(tag || "").trim())
			.filter(Boolean);
		const uniqueTagIds = [...new Set(mergedTagIds)];
		const hasOfferSelected = Boolean(body?.offer);
		const clientTransactionAmount = toAmount(body?.transaction_amount || 0);

		let trustedTagIds = [...uniqueTagIds];
		let trustedSessionId = String(body?.session_id || "").trim();
		let trustedDescription = String(body?.description || "Compra en línea").trim() || "Compra en línea";
		let trustedTransactionAmount = clientTransactionAmount;

		serverLog.info("process-payment", "Incoming payment request", {
			paymentMethod: body?.payment_method_id || "",
			transactionAmount: clientTransactionAmount,
			installments: Number(body?.installments || 1),
			hasSessionId: Boolean(body?.session_id),
			hasSessionToken: Boolean(body?.session_token),
			hasTag1: Boolean(body?.tags?.tag1),
			hasTag2: Boolean(body?.tags?.tag2),
			tagCount: uniqueTagIds.length,
			payerEmail: maskEmail(body?.payer?.email),
			token: shortValue(body?.token || ""),
			hasOffer: hasOfferSelected,
		});

		if (body?.session_token) {
			const sessionToken = String(body.session_token);
			const sessionData = decryptSession(sessionToken);

			if (!sessionData) {
				serverLog.warn("process-payment", "Invalid encrypted session in process-payment", {
					sessionToken: shortValue(sessionToken),
				});
				return NextResponse.json(
					{ error: "Sesión inválida. Recarga la página e intenta nuevamente." },
					{ status: 400 },
				);
			}

			if (
				hasNonEmptyValue(sessionData.created) &&
				Date.now() - Number(sessionData.created) > MAX_SESSION_AGE_MS
			) {
				serverLog.warn("process-payment", "Expired session in process-payment", {
					createdAt: sessionData.created,
				});
				return NextResponse.json(
					{ error: "Sesión expirada. Vuelve a ingresar desde el enlace original." },
					{ status: 400 },
				);
			}

			const sessionIdFromToken = String(sessionData.sessionId || sessionData.session_id || "").trim();
			if (!sessionIdFromToken) {
				serverLog.warn("process-payment", "Session token missing sessionId", {
					sessionToken: shortValue(sessionToken),
				});
				return NextResponse.json(
					{ error: "Sesión inválida. Vuelve a intentar desde el enlace original." },
					{ status: 400 },
				);
			}

			if (trustedSessionId && trustedSessionId !== sessionIdFromToken) {
				serverLog.warn("process-payment", "Session mismatch between session_id and session_token", {
					bodySessionId: trustedSessionId,
					tokenSessionId: sessionIdFromToken,
				});
				return NextResponse.json(
					{ error: "Sesión inconsistente. Recarga la página e intenta nuevamente." },
					{ status: 400 },
				);
			}

			trustedSessionId = sessionIdFromToken;

			const offerFromToken =
				sessionData.offer && typeof sessionData.offer === "object"
					? sessionData.offer
					: null;
			const includeOffer = hasOfferSelected && Boolean(offerFromToken);
			const baseAmountFromToken = getFinalAmount(sessionData);
			const offerAmountFromToken = includeOffer ? getFinalAmount(offerFromToken) : 0;

			trustedTransactionAmount = toAmount(baseAmountFromToken + offerAmountFromToken);

			const productTitle = String(sessionData.title || "").trim();
			const offerTitle = String(offerFromToken?.title || "").trim();
			trustedDescription =
				includeOffer && productTitle && offerTitle
					? `Total compra: ${productTitle} + ${offerTitle}`
					: productTitle || trustedDescription;

			const tokenTags = [
				sessionData.tag1,
				sessionData.tag2,
				...(includeOffer ? [offerFromToken?.tag1, offerFromToken?.tag2] : []),
			]
				.map((tag) => String(tag || "").trim())
				.filter(Boolean);

			if (tokenTags.length > 0) {
				trustedTagIds = [...new Set(tokenTags)];
			}

			serverLog.info("process-payment", "Trusted payment values resolved from session", {
				sessionId: trustedSessionId,
				includeOffer,
				baseAmount: baseAmountFromToken,
				offerAmount: offerAmountFromToken,
				trustedTransactionAmount,
				trustedTagCount: trustedTagIds.length,
			});

			if (Math.abs(trustedTransactionAmount - clientTransactionAmount) > 0.001) {
				serverLog.warn("process-payment", "Client amount differs from trusted session amount, overriding", {
					clientTransactionAmount,
					trustedTransactionAmount,
				});
			}
		} else {
			serverLog.warn("process-payment", "Missing session_token, using client-provided amount", {
				clientTransactionAmount,
				sessionId: trustedSessionId || "",
			});
		}

		// Construir el payload para Mercado Pago
		const paymentData = {
			token: body.token,
			issuer_id: body.issuer_id || undefined,
			payment_method_id: body.payment_method_id,
			transaction_amount: trustedTransactionAmount,
			installments: Number(body.installments) || 1,
			description: trustedDescription,
			payer: {
				email: body.payer?.email,
				first_name: body.payer?.first_name,
				last_name: body.payer?.last_name,
			},
		};
		if (trustedSessionId) {
			paymentData.external_reference = trustedSessionId;
		}

		// Si vienen datos de identificación (tarjetas), agregarlos
		if (
			body.payer?.identification?.type &&
			body.payer?.identification?.number
		) {
			paymentData.payer.identification = {
				type: body.payer.identification.type,
				number: body.payer.identification.number,
			};
		}

		// Pasar tags y datos del comprador como metadata para auditoría
		if (
			trustedTagIds.length > 0 ||
			body.buyer?.first_name ||
			body.buyer?.last_name ||
			trustedSessionId
		) {
			paymentData.metadata = {
				systemeio_tag1: trustedTagIds[0] || "",
				systemeio_tag2: trustedTagIds[1] || "",
				systemeio_tag3: trustedTagIds[2] || "",
				systemeio_tag4: trustedTagIds[3] || "",
				systemeio_tags_csv: trustedTagIds.join(","),
				systemeio_first_name: body.buyer?.first_name || "",
				systemeio_last_name: body.buyer?.last_name || "",
				systemeio_session_id: trustedSessionId || "",
			};
		}
		serverLog.info("process-payment", "Calling Mercado Pago create payment", {
			paymentMethod: paymentData.payment_method_id,
			transactionAmount: paymentData.transaction_amount,
			externalReference: paymentData.external_reference || "",
			hasMetadata: Boolean(paymentData.metadata),
			metadataTagCount: trustedTagIds.length,
			metadataTags: trustedTagIds,
		});

		const payment = new Payment(client);
		const idempotencyKey = randomUUID();
		serverLog.info("process-payment", "Using idempotency key", {
			idempotencyKey,
		});

		const result = await payment.create({
			body: paymentData,
			requestOptions: {
				idempotencyKey: idempotencyKey,
			},
		});
		serverLog.info("process-payment", "Mercado Pago payment created", {
			paymentId: result?.id || "",
			status: result?.status || "",
			statusDetail: result?.status_detail || "",
			paymentMethod: result?.payment_method_id || "",
			paymentType: result?.payment_type_id || "",
		});

		// Tagging en Systeme.io en tiempo real (sin depender de webhook)
		if (result?.status === "approved") {
			const email = body?.payer?.email || "";
			const firstName = body?.buyer?.first_name || body?.payer?.first_name || "";
			const lastName = body?.buyer?.last_name || body?.payer?.last_name || "";
			const tagIds = trustedTagIds;

			if (email && tagIds.length > 0) {
				const tagged = await tagContactByEmail(email, tagIds, {
					firstName,
					lastName,
				});
				serverLog.info("process-payment", "Systeme.io tagging after approved payment", {
					paymentId: result?.id || "",
					email: maskEmail(email),
					tagIds,
					success: Boolean(tagged),
				});
			} else {
				serverLog.warn("process-payment", "Skipping Systeme.io tagging in process-payment", {
					paymentId: result?.id || "",
					email: maskEmail(email),
					hasTag1: Boolean(body?.tags?.tag1),
					hasTag2: Boolean(body?.tags?.tag2),
				});
			}
		}

		return NextResponse.json({
			id: result.id,
			status: result.status,
			status_detail: result.status_detail,
			payment_method_id: result.payment_method_id,
			payment_type_id: result.payment_type_id,
		});
	} catch (error) {
		serverLog.error("process-payment", "Payment creation failed", {
			error: error?.message || String(error),
			cause: error?.cause || null,
		});
		return NextResponse.json(
			{
				error: "Error al procesar el pago",
				details: error.message,
				cause: error.cause || null,
			},
			{ status: 500 },
		);
	}
}
