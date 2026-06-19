import { NextResponse } from "next/server";

// =============================================================================
// API Route: /api/get-product
// Devuelve la info del producto de forma segura (precios solo server-side)
// =============================================================================

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
    const { product_id } = body;
    const product = PRODUCTS[product_id] || PRODUCTS["default"];

    return NextResponse.json({
      id: product_id || "default",
      title: product.title,
      description: product.description,
      price: product.price,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error al obtener el producto" },
      { status: 500 }
    );
  }
}
