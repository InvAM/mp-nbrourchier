// =============================================================================
// lib/systemeio.js
// Helper para interactuar con la API de Systeme.io
// Docs: https://developer.systeme.io/reference/api
// =============================================================================

import { maskEmail, serverLog } from "@/lib/server-log";

const SYSTEMEIO_BASE_URL = "https://api.systeme.io/api";

function getContactFieldValue(contact, slug) {
	const fields = contact?.fields;
	if (!Array.isArray(fields)) return "";

	for (const field of fields) {
		if (field?.slug === slug) return field?.value || "";
		if (field?.field?.slug === slug) return field?.value || "";
	}
	return "";
}

function getHeaders(contentType = "application/json") {
	const apiKey = process.env.SYSTEMEIO_API_KEY;
	if (!apiKey) {
		serverLog.error("systemeio", "SYSTEMEIO_API_KEY is missing");
		throw new Error("SYSTEMEIO_API_KEY no está configurada en .env.local");
	}
	return {
		"X-API-Key": apiKey,
		"Content-Type": contentType,
		Accept: "application/json",
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Buscar contacto por email
// GET /api/contacts?email={email}
// ─────────────────────────────────────────────────────────────────────────────
export async function findContactByEmail(email) {
	const url = `${SYSTEMEIO_BASE_URL}/contacts?email=${encodeURIComponent(email)}`;
	serverLog.info("systemeio", "Finding contact by email", {
		email: maskEmail(email),
	});
	const res = await fetch(url, { method: "GET", headers: getHeaders() });

	if (!res.ok) {
		const text = await res.text();
		serverLog.warn("systemeio", "findContactByEmail failed", {
			email: maskEmail(email),
			status: res.status,
			response: text,
		});
		return null;
	}

	const data = await res.json();
	serverLog.info("systemeio", "findContactByEmail response", {
		email: maskEmail(email),
		totalItems: Array.isArray(data?.items) ? data.items.length : 0,
	});

	if (data.items && data.items.length > 0) {
		const found = data.items[0];
		return found;
	}

	return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crear contacto
// POST /api/contacts
// ─────────────────────────────────────────────────────────────────────────────
export async function createContact(email, firstName = "", lastName = "") {
	const url = `${SYSTEMEIO_BASE_URL}/contacts`;
	const body = { email };
	const fields = [];
	if (firstName) fields.push({ slug: "first_name", value: firstName });
	if (lastName) fields.push({ slug: "surname", value: lastName });
	if (fields.length) body.fields = fields;
	serverLog.info("systemeio", "Creating contact", {
		email: maskEmail(email),
		firstName: firstName || "",
		lastName: lastName || "",
	});

	const res = await fetch(url, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		serverLog.warn("systemeio", "createContact failed", {
			email: maskEmail(email),
			status: res.status,
			response: text,
		});
		if (res.status === 422) {
			return await findContactByEmail(email);
		}
		return null;
	}

	const contact = await res.json();
	const createdFirst =
		contact.firstName ||
		contact.first_name ||
		getContactFieldValue(contact, "first_name") ||
		"";
	const createdLast =
		contact.lastName ||
		contact.last_name ||
		contact.surname ||
		getContactFieldValue(contact, "surname") ||
		"";
	return contact;
}

// ─────────────────────────────────────────────────────────────────────────────
// Actualizar contacto (solo campos provistos)
// PATCH /api/contacts/{contactId} (fallback PUT)
// ─────────────────────────────────────────────────────────────────────────────
export async function updateContact(contactId, updateFields) {
	const url = `${SYSTEMEIO_BASE_URL}/contacts/${contactId}`;
	const payload = updateFields || {};
	if (!Object.keys(payload).length) return null;
	serverLog.info("systemeio", "Updating contact", {
		contactId,
		updateFieldsCount: Array.isArray(payload?.fields) ? payload.fields.length : 0,
	});

	const tryUpdate = async (method) => {
		const res = await fetch(url, {
			method,
			headers:
				method === "PATCH"
					? getHeaders("application/merge-patch+json")
					: getHeaders("application/json"),
			body: JSON.stringify(payload),
		});
		return res;
	};

	let res = await tryUpdate("PATCH");
	serverLog.info("systemeio", "Update contact PATCH response", {
		contactId,
		status: res.status,
	});
	if (res.status === 404 || res.status === 405) {
		res = await tryUpdate("PUT");
		serverLog.info("systemeio", "Update contact fallback PUT response", {
			contactId,
			status: res.status,
		});
	}

	if (!res.ok) {
		const text = await res.text();
		serverLog.warn("systemeio", "updateContact failed", {
			contactId,
			status: res.status,
			response: text,
		});
		return null;
	}

	// Algunas APIs responden 204 sin body
	try {
		const updated = await res.json();
		return updated;
	} catch {
		return { id: contactId };
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Asignar tag a contacto
// POST /api/contacts/{contactId}/tags
// Body: { tagId: integer }
// Returns: 204 on success
// ─────────────────────────────────────────────────────────────────────────────
export async function assignTagToContact(contactId, tagId) {
	const url = `${SYSTEMEIO_BASE_URL}/contacts/${contactId}/tags`;
	serverLog.info("systemeio", "Assigning tag to contact", {
		contactId,
		tagId: Number(tagId),
	});
	const res = await fetch(url, {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify({ tagId: Number(tagId) }),
	});

	if (res.status === 204 || res.ok) {
		serverLog.info("systemeio", "Tag assigned successfully", {
			contactId,
			tagId: Number(tagId),
			status: res.status,
		});
		return true;
	}

	const text = await res.text();
	serverLog.warn("systemeio", "assignTagToContact failed", {
		contactId,
		tagId: Number(tagId),
		status: res.status,
		response: text,
	});
	return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flujo completo: buscar/crear contacto + asignar uno o varios tags
// tagIds puede ser un string (un tag) o un array de strings (varios tags)
// ─────────────────────────────────────────────────────────────────────────────
export async function tagContactByEmail(email, tagIds, names = {}) {
	if (!email || !tagIds) {
		serverLog.warn("systemeio", "tagContactByEmail called without email/tagIds", {
			email: maskEmail(email),
			tagIds,
		});
		return false;
	}

	// Normalizar a array
	const tags = Array.isArray(tagIds) ? tagIds : [tagIds];
	const validTags = tags.filter(Boolean);

	if (validTags.length === 0) {
		serverLog.warn("systemeio", "tagContactByEmail has no valid tags", {
			email: maskEmail(email),
			tagIds,
		});
		return false;
	}
	serverLog.info("systemeio", "Starting tagContactByEmail flow", {
		email: maskEmail(email),
		tagIds: validTags,
		firstName: names?.firstName || "",
		lastName: names?.lastName || "",
	});

	try {
		// 1. Buscar contacto por email
		let contact = await findContactByEmail(email);
		let created = false;

		// 2. Si no existe, crearlo
		if (!contact) {
			contact = await createContact(email, names.firstName || "", names.lastName || "");
			created = true;
			serverLog.info("systemeio", "Contact did not exist and was created", {
				email: maskEmail(email),
				contactId: contact?.id || "",
			});
		}

		if (!contact || !contact.id) {
			serverLog.error("systemeio", "Unable to resolve contact id", {
				email: maskEmail(email),
			});
			return false;
		}

		// 3. Si ya existía pero faltan nombres, actualizar solo los vacíos
		if (!created) {
			const currentFirst =
				contact.firstName ||
				contact.first_name ||
				getContactFieldValue(contact, "first_name") ||
				"";
			const currentLast =
				contact.lastName ||
				contact.last_name ||
				contact.surname ||
				getContactFieldValue(contact, "surname") ||
				"";
			const needsFirst = !String(currentFirst).trim() && names.firstName;
			const needsLast = !String(currentLast).trim() && names.lastName;
			if (contact && contact.id && (needsFirst || needsLast)) {
				const updateFields = { fields: [] };
				if (needsFirst) updateFields.fields.push({ slug: "first_name", value: names.firstName });
				if (needsLast) updateFields.fields.push({ slug: "surname", value: names.lastName });
				await updateContact(contact.id, updateFields);
			}
		}

		// 4. Asignar cada tag
		let allSuccess = true;
		for (const tagId of validTags) {
			const success = await assignTagToContact(contact.id, tagId);
			if (!success) {
				allSuccess = false;
			}
		}
		serverLog.info("systemeio", "tagContactByEmail completed", {
			email: maskEmail(email),
			contactId: contact.id,
			tagIds: validTags,
			success: allSuccess,
		});
		return allSuccess;
	} catch (error) {
		serverLog.error("systemeio", "tagContactByEmail failed with exception", {
			email: maskEmail(email),
			error: error?.message || String(error),
		});
		return false;
	}
}
