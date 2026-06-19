// =============================================================================
// Página de Pago Exitoso
// El usuario es redirigido aquí cuando el pago se aprueba
// =============================================================================

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

function SuccessContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-slate-50 p-4">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CircleCheck className="h-9 w-9 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-green-700">
            ¡Pago Exitoso!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">
            Tu pago ha sido procesado correctamente. Recibirás un correo de
            confirmación con los detalles de tu compra.
          </p>
          {paymentId && (
            <p className="text-xs text-muted-foreground">
              ID de pago: <span className="font-mono">{paymentId}</span>
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/">
            <Button variant="outline">Volver al inicio</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PaymentSuccess() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
