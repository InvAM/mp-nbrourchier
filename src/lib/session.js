// =============================================================================
// lib/session.js
// Encripta y desencripta datos de sesión de checkout usando AES-256-GCM
// Usado para generar URLs seguras desde Systeme.io
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getSecret() {
	const secret = process.env.CHECKOUT_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error(
			"CHECKOUT_SECRET debe tener al menos 32 caracteres. Configúralo en .env.local",
		);
	}
	// Usar los primeros 32 bytes como key (AES-256 requiere 32 bytes)
	return Buffer.from(secret.slice(0, 32), "utf-8");
}

/**
 * Encripta un objeto de datos en un token string (URL-safe)
 * @param {object} data - { product, tag1, tag2, ... }
 * @returns {string} token encriptado en base64url
 */
export function encryptSession(data) {
	const key = getSecret();
	const iv = randomBytes(12); // GCM recomienda 12 bytes
	const cipher = createCipheriv(ALGORITHM, key, iv);

	const json = JSON.stringify(data);
	let encrypted = cipher.update(json, "utf8");
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Formato: iv(12) + authTag(16) + encrypted(N)
	const combined = Buffer.concat([iv, authTag, encrypted]);
	// base64url — seguro para URLs sin necesidad de encodeURIComponent
	return combined.toString("base64url");
}

/**
 * Desencripta un token y devuelve el objeto original
 * @param {string} token - token base64url
 * @returns {object|null} datos desencriptados o null si falla
 */
export function decryptSession(token) {
	try {
		const key = getSecret();
		const combined = Buffer.from(token, "base64url");

		// Extraer iv(12) + authTag(16) + encrypted(rest)
		const iv = combined.subarray(0, 12);
		const authTag = combined.subarray(12, 28);
		const encrypted = combined.subarray(28);

		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		let decrypted = decipher.update(encrypted);
		decrypted = Buffer.concat([decrypted, decipher.final()]);

		return JSON.parse(decrypted.toString("utf8"));
	} catch (error) {
		return null;
	}
}
