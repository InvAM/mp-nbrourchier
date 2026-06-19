// lib/tags.js
// Helper para obtener el ID de un tag de Systeme.io por nombre

import { serverLog } from "@/lib/server-log";

const SYSTEMEIO_BASE_URL = "https://api.systeme.io/api";

export async function getTagIdByName(tagName, apiKey) {
  if (!tagName) return null;
  if (!apiKey) throw new Error("API Key requerida para buscar tags");
  const url = `${SYSTEMEIO_BASE_URL}/tags`;
  serverLog.info("systemeio-tags", "Fetching tags list from Systeme.io", {
    tagName,
  });
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    serverLog.warn("systemeio-tags", "Systeme.io tags request failed", {
      status: res.status,
      tagName,
    });
    return null;
  }
  const data = await res.json();
  const tag = data.items.find((t) => t.name === tagName);
  serverLog.info("systemeio-tags", "Tag resolution completed", {
    tagName,
    tagId: tag ? tag.id : null,
  });
  return tag ? tag.id : null;
}
