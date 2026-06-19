// =============================================================================
// API Route: /api/decode-session
// Desencripta el token de sesión y devuelve los datos del checkout
// =============================================================================

import { NextResponse } from "next/server";
import { decryptSession } from "@/lib/session";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { serverLog, shortValue } from "@/lib/server-log";

const client = new MercadoPagoConfig({
	accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

async function getApprovedSessionCount(sessionId) {
	if (!sessionId) return false;
	const payment = new Payment(client);
	const result = await payment.search({
		options: {
			external_reference: sessionId,
			status: "approved",
			limit: 1,
		},
	});
	return Array.isArray(result?.results) ? result.results.length : 0;
}

export async function POST(request) {
	try {
		const body = await request.json();
		const { session } = body;
		serverLog.info("decode-session", "Incoming decode session request", {
			sessionToken: shortValue(session || ""),
		});

		if (!session) {
			serverLog.warn("decode-session", "Missing session token");
			return NextResponse.json(
				{ error: "Token de sesión requerido" },
				{ status: 400 },
			);
		}

		// Desencriptar
		const data = decryptSession(session);

		if (!data) {
			serverLog.warn("decode-session", "Invalid or expired encrypted token");
			return NextResponse.json(
				{
					error:
						"Sesión inválida o expirada. Vuelve a intentar desde el enlace original.",
				},
				{ status: 400 },
			);
		}

		// Opcional: verificar que no tenga más de 24h
		const maxAge = 24 * 60 * 60 * 1000; // 24 horas
		if (data.created && Date.now() - data.created > maxAge) {
			serverLog.warn("decode-session", "Session token expired", {
				createdAt: data.created,
			});
			return NextResponse.json(
				{
					error:
						"Esta sesión ha expirado. Vuelve a intentar desde el enlace original.",
				},
				{ status: 400 },
			);
		}

		// Validar si la sesión ya fue usada (pago aprobado)
		const sessionId = data.sessionId || data.session_id;
		if (!sessionId) {
			serverLog.warn("decode-session", "Session payload missing sessionId");
			return NextResponse.json(
				{ error: "Sesión inválida. Vuelve a intentar desde el enlace original." },
				{ status: 400 },
			);
		}

		try {
			const approvedCount = await getApprovedSessionCount(sessionId);
			if (approvedCount > 0) {
				serverLog.warn("decode-session", "Session already used", {
					sessionId,
					approvedCount,
				});
				return NextResponse.json(
					{
						error:
							"Esta sesión ya fue utilizada. Vuelve a intentar desde el enlace original.",
					},
					{ status: 400 },
				);
			}
		} catch (err) {
			serverLog.error("decode-session", "Failed to validate session usage with Mercado Pago", {
				sessionId,
				error: err?.message || String(err),
			});
			return NextResponse.json(
				{ error: "No se pudo validar la sesión. Intenta nuevamente." },
				{ status: 503 },
			);
		}
		serverLog.info("decode-session", "Session decoded successfully", {
			sessionId,
			product: data.product || "default",
			hasTag1: Boolean(data.tag1),
			hasTag2: Boolean(data.tag2),
			hasRedirectUrl: Boolean(data.redirectUrl || data.redirect_url),
			hasOffer: Boolean(data.offer),
		});

		return NextResponse.json({
			product: {
				id: data.product || "default",
				title: data.title,
				description: data.description || "",
				price: data.finalPrice,
				originalPrice: data.discount > 0 ? data.price : null,
				discount: data.discount || 0,
			},
			offer: (() => {
				if (!data.offer) return null;
				const rawOfferRegularPrice =
					data.offer.regularPrice ??
					data.offer.originalPrice ??
					data.offer.regular_price;
				const hasOfferRegularPrice =
					rawOfferRegularPrice !== undefined &&
					rawOfferRegularPrice !== null &&
					String(rawOfferRegularPrice).trim() !== "" &&
					!isNaN(Number(rawOfferRegularPrice));
				const parsedOfferRegularPrice = hasOfferRegularPrice
					? Number(rawOfferRegularPrice)
					: null;
				const offerFinalPrice =
					data.offer.finalPrice !== undefined
						? Number(data.offer.finalPrice)
						: Number(data.offer.price || 0);

				return {
					id: data.offer.id || "",
					title: data.offer.title || "",
					description: data.offer.description || "",
					imageUrl: data.offer.imageUrl || data.offer.image_url || "",
					price: offerFinalPrice,
					regularPrice: parsedOfferRegularPrice,
					originalPrice:
						parsedOfferRegularPrice !== null
							? parsedOfferRegularPrice
							: Number(data.offer.discount || 0) > 0
								? Number(data.offer.price || 0)
								: null,
					discount: Number(data.offer.discount || 0),
					tag1: data.offer.tag1 || "",
					tag2: data.offer.tag2 || "",
					preselected: Boolean(data.offer.preselected),
				};
			})(),
			sessionId: sessionId || "",
			redirectUrl: data.redirectUrl || data.redirect_url || "",
			tag1: data.tag1 || "",
			tag2: data.tag2 || "",
		});
	} catch (error) {
		serverLog.error("decode-session", "Unhandled decode session error", {
			error: error?.message || String(error),
		});
		return NextResponse.json(
			{ error: "Error al procesar la sesión" },
			{ status: 500 },
		);
	}
}
