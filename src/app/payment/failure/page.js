// =============================================================================
// Página de Pago Fallido
// El usuario es redirigido aquí cuando el pago falla
// =============================================================================

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

function FailureContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-slate-50 p-4">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <CircleX className="h-9 w-9 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-red-700">
            Pago Fallido
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">
            No se pudo procesar tu pago. Por favor verifica tu método de pago e
            intenta nuevamente.
          </p>
          {paymentId && (
            <p className="text-xs text-muted-foreground">
              ID de referencia: <span className="font-mono">{paymentId}</span>
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-center gap-3">
          <Link href="/">
            <Button>Reintentar pago</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function PaymentFailure() {
  return (
    <Suspense>
      <FailureContent />
    </Suspense>
  );
}
