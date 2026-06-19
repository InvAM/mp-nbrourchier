// =============================================================================
// Página de Pago Pendiente
// El usuario es redirigido aquí cuando el pago queda en estado pendiente
// =============================================================================

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

function PendingContent() {
  const searchParams = useSearchParams();
  const paymentId = searchParams.get("payment_id");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-slate-50 p-4">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Clock className="h-9 w-9 text-amber-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-amber-700">
            Pago Pendiente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground">
            Tu pago está siendo procesado. Te notificaremos por correo
            electrónico cuando se confirme.
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

export default function PaymentPending() {
  return (
    <Suspense>
      <PendingContent />
    </Suspense>
  );
}
