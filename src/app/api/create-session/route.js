// =============================================================================
// API Route: /api/create-session
// Recibe datos del producto + tags, los encripta y devuelve URL segura
// Se llama desde el botón embebido en Systeme.io
// =============================================================================

import { NextResponse } from "next/server";
import { encryptSession } from "@/lib/session";
import { getTagIdByName } from "@/lib/tags";
import { randomUUID } from "crypto";
import { serverLog, shortValue } from "@/lib/server-log";

export async function POST(request) {
	try {
		const body = await request.json();
		const { title, description, price, discount, tag1, tag2, offer } = body;
		const redirectUrlRaw = String(
			body?.redirectUrl ?? body?.redirect_url ?? body?.successUrl ?? body?.success_url ?? "",
		).trim();
		const redirectUrl = /^(https?:\/\/|\/)/i.test(redirectUrlRaw)
			? redirectUrlRaw
			: "";
		serverLog.info("create-session", "Incoming request", {
			title: title || "",
			description: description || "",
			price,
			discount,
			hasRedirectUrl: Boolean(redirectUrlRaw),
			tag1Type: typeof tag1,
			tag2Type: typeof tag2,
			hasTag1: Boolean(tag1),
			hasTag2: Boolean(tag2),
			hasOffer: Boolean(offer),
		});

		if (redirectUrlRaw && !redirectUrl) {
			return NextResponse.json(
				{ error: "'redirectUrl' debe iniciar con http(s):// o /" },
				{ status: 400 },
			);
		}

		const resolveTag = async (rawTag, options = {}) => {
			const { required = false, label = "tag", silentIfMissing = false } = options;
			if (!rawTag) return "";
			if (!isNaN(Number(rawTag))) return Number(rawTag);
			serverLog.info("create-session", "Resolving tag by name", {
				label,
				tag: rawTag,
			});
			const resolved = await getTagIdByName(rawTag, process.env.SYSTEMEIO_API_KEY);
			if (!resolved) {
				if (required) {
					throw new Error(`No se encontró ${label} '${rawTag}' en Systeme.io`);
				}
				if (!silentIfMissing) {
					serverLog.warn("create-session", "Optional tag not found in Systeme.io", {
						label,
						tag: rawTag,
					});
				}
				return "";
			}
			return resolved;
		};

		// Adaptar: Si tag1/tag2 no son números, buscar su ID por nombre
		const resolvedTag1 = await resolveTag(tag1, { required: Boolean(tag1), label: "tag1" });
		const resolvedTag2 = await resolveTag(tag2, {
			required: false,
			label: "tag2",
			silentIfMissing: true,
		});

		// Validar campos obligatorios
		if (!title) {
			return NextResponse.json(
				{ error: "Se requiere 'title'" },
				{ status: 400 },
			);
		}

		if (price === undefined || price === null) {
			return NextResponse.json(
				{ error: "Se requiere 'price'" },
				{ status: 400 },
			);
		}

		const basePrice = Number(price);
		const discountAmount = Number(discount) || 0;

		if (isNaN(basePrice)) {
			return NextResponse.json(
				{ error: "'price' debe ser un número" },
				{ status: 400 },
			);
		}

		if (isNaN(discountAmount)) {
			return NextResponse.json(
				{ error: "'discount' debe ser un número" },
				{ status: 400 },
			);
		}

		if (basePrice - discountAmount <= 0) {
			return NextResponse.json(
				{ error: "El precio final debe ser mayor a 0" },
				{ status: 400 },
			);
		}

		const finalPrice = basePrice - discountAmount;
		let offerData = null;

		if (offer && typeof offer === "object") {
			const offerTitle = String(offer.title || "").trim();
			const offerDescription = String(offer.description || "").trim();
			const offerImageRaw = String(offer.imageUrl || offer.image_url || "").trim();
			const offerImageUrl = /^(https?:\/\/|\/)/i.test(offerImageRaw)
				? offerImageRaw
				: "";
			const offerPrice = Number(offer.price);
			const offerDiscount = Number(offer.discount) || 0;
			const offerRegularPriceRaw =
				offer.regularPrice ?? offer.originalPrice ?? offer.regular_price;
			const hasNonEmptyValue = (value) =>
				value !== undefined &&
				value !== null &&
				String(value).trim() !== "";
			const hasOfferRegularPrice = hasNonEmptyValue(offerRegularPriceRaw);
			const offerRegularPrice = hasOfferRegularPrice
				? Number(offerRegularPriceRaw)
				: null;
			const hasOfferPayload =
				Boolean(offerTitle) ||
				Boolean(offerDescription) ||
				Boolean(offerImageRaw) ||
				Boolean(String(offer.tag1 || "").trim()) ||
				Boolean(String(offer.tag2 || "").trim()) ||
				hasNonEmptyValue(offer.price) ||
				hasNonEmptyValue(offer.discount) ||
				hasOfferRegularPrice;

			// Compatibilidad: si envían offer vacío, lo ignoramos (sin romper flujos previos)
			if (!hasOfferPayload) {
				serverLog.info("create-session", "Empty offer payload received, ignoring");
			} else {

				if (!offerTitle) {
					return NextResponse.json(
						{ error: "Si envías 'offer', debes incluir 'offer.title'" },
						{ status: 400 },
					);
				}
				if (offer.price === undefined || offer.price === null || isNaN(offerPrice)) {
					return NextResponse.json(
						{ error: "Si envías 'offer', 'offer.price' debe ser un número" },
						{ status: 400 },
					);
				}
				if (isNaN(offerDiscount)) {
					return NextResponse.json(
						{ error: "Si envías 'offer', 'offer.discount' debe ser un número" },
						{ status: 400 },
					);
				}
				if (offerPrice - offerDiscount <= 0) {
					return NextResponse.json(
						{ error: "El precio final de la oferta debe ser mayor a 0" },
						{ status: 400 },
					);
				}
				if (
					hasOfferRegularPrice &&
					(isNaN(offerRegularPrice) || Number(offerRegularPrice) <= 0)
				) {
					return NextResponse.json(
						{
							error:
								"Si envías 'offer.regularPrice', debe ser un número mayor a 0",
						},
						{ status: 400 },
					);
				}

				const offerTag1 = await resolveTag(offer.tag1, {
					required: Boolean(offer.tag1),
					label: "offer.tag1",
				});
				const offerTag2 = await resolveTag(offer.tag2, {
					required: false,
					label: "offer.tag2",
					silentIfMissing: true,
				});
				const offerProductId = offerTitle
					.toLowerCase()
					.normalize("NFD")
					.replace(/[\u0300-\u036f]/g, "")
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/(^-|-$)/g, "");

				offerData = {
					id: offerProductId,
					title: offerTitle,
					description: offerDescription,
					imageUrl: offerImageUrl,
					price: offerPrice,
					discount: offerDiscount,
					finalPrice: offerPrice - offerDiscount,
					regularPrice: hasOfferRegularPrice ? Number(offerRegularPrice) : null,
					tag1: offerTag1 || "",
					tag2: offerTag2 || "",
					preselected: Boolean(offer.preselected),
				};
			}
		}

		// Generar ID del producto a partir del título
		const productId = title
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "");

		// Crear payload encriptado con timestamp

		   const sessionData = {
			   sessionId: randomUUID(),
			   product: productId,
			   title,
			   description: description || "",
			   price: basePrice,
			   discount: discountAmount,
			   finalPrice,
			   redirectUrl,
			   tag1: resolvedTag1 || "",
			   tag2: resolvedTag2 || "",
			   offer: offerData,
			   created: Date.now(),
		   };

		const token = encryptSession(sessionData);
		const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
		const checkoutUrl = `${baseUrl}/?session=${token}`;
		serverLog.info("create-session", "Session generated", {
			sessionId: sessionData.sessionId,
			product: productId,
			finalPrice,
			tag1: resolvedTag1 || "",
			tag2: resolvedTag2 || "",
			hasOffer: Boolean(offerData),
			offerTitle: offerData?.title || "",
			offerPrice: offerData?.finalPrice || 0,
			offerRegularPrice: offerData?.regularPrice || null,
			hasOfferImage: Boolean(offerData?.imageUrl),
			redirectUrl: redirectUrl || "",
			checkoutUrl,
			token: shortValue(token),
		});

		return NextResponse.json({ url: checkoutUrl, token });
	} catch (error) {
		serverLog.error("create-session", "Unhandled error", {
			error: error?.message || String(error),
		});
		if (String(error?.message || "").includes("No se encontró")) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		return NextResponse.json(
			{ error: "Error al crear sesión: " + error.message },
			{ status: 500 },
		);
	}
}
