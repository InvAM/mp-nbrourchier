"use client";

import { useEffect, useState, useCallback, Suspense, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Smartphone } from "lucide-react";
import { webLog, maskEmail, shortValue } from "@/lib/client-log";

const SCOPE = "checkout-page";

// CheckoutPage migrada a Tailwind — mantiene la lógica original
function CheckoutContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [productInfo, setProductInfo] = useState(null);
  const [sessionId, setSessionId] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const sessionTokenRef = useRef("");
  const [activeTab, setActiveTab] = useState("card"); // card | yape
  const [processing, setProcessing] = useState(false);
  const [cardFormReady, setCardFormReady] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);

  // Modal de confirmación de correo
  const [emailConfirm, setEmailConfirm] = useState(null); // { email } | null
  const emailConfirmResolverRef = useRef(null);
  const askEmailConfirm = useCallback((email) => {
    return new Promise((resolve) => {
      emailConfirmResolverRef.current = resolve;
      setEmailConfirm({ email });
    });
  }, []);
  const resolveEmailConfirm = useCallback((confirmed) => {
    setEmailConfirm(null);
    const resolver = emailConfirmResolverRef.current;
    emailConfirmResolverRef.current = null;
    if (resolver) resolver(confirmed);
  }, []);

  // Datos del comprador
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const firstNameValueRef = useRef("");
  const lastNameValueRef = useRef("");

  // Yape fields
  const [yapePhone, setYapePhone] = useState("");
  const [yapeOtp, setYapeOtp] = useState("");
  const [yapeEmail, setYapeEmail] = useState("");
  const yapeEmailValueRef = useRef("");
  const totalAmountRef = useRef(0);
  const offerSelectedRef = useRef(false);
  const offerInfoRef = useRef(null);
  const selectedExtraTagsRef = useRef([]);

  // Tags de Systeme.io
  const [tag1, setTag1] = useState("");
  const [tag2, setTag2] = useState("");
  const [offerInfo, setOfferInfo] = useState(null);
  const [offerSelected, setOfferSelected] = useState(false);

  const baseAmount = useMemo(() => Number(productInfo?.price || 0), [productInfo]);
  const offerAmount = useMemo(
    () => (offerSelected && offerInfo ? Number(offerInfo.price || 0) : 0),
    [offerSelected, offerInfo]
  );
  const totalAmount = useMemo(() => baseAmount + offerAmount, [baseAmount, offerAmount]);
  const totalDiscountAmount = useMemo(() => {
    const baseDiscount = Number(productInfo?.discount || 0);
    const extraDiscount = offerSelected && offerInfo ? Number(offerInfo.discount || 0) : 0;
    return baseDiscount + extraDiscount;
  }, [productInfo, offerSelected, offerInfo]);
  const totalOriginalAmount = useMemo(() => {
    const baseOriginal = Number(
      productInfo?.originalPrice !== null && productInfo?.originalPrice !== undefined
        ? productInfo.originalPrice
        : productInfo?.price || 0
    );
    const extraOriginal =
      offerSelected && offerInfo
        ? Number(
            offerInfo.originalPrice !== null && offerInfo.originalPrice !== undefined
              ? offerInfo.originalPrice
              : offerInfo.price || 0
          )
        : 0;
    return baseOriginal + extraOriginal;
  }, [productInfo, offerSelected, offerInfo]);
  const selectedExtraTags = useMemo(() => {
    if (!offerSelected || !offerInfo) return [];
    return [offerInfo.tag1, offerInfo.tag2].filter(Boolean);
  }, [offerSelected, offerInfo]);

  useEffect(() => {
    totalAmountRef.current = Number(totalAmount || 0);
    offerSelectedRef.current = Boolean(offerSelected);
    offerInfoRef.current = offerInfo;
    selectedExtraTagsRef.current = Array.isArray(selectedExtraTags)
      ? selectedExtraTags
      : [];
  }, [totalAmount, offerSelected, offerInfo, selectedExtraTags]);

  const handlePaymentResult = useCallback((data) => {
    if (data.error) {
      webLog.warn(SCOPE, "Payment result contains error", {
        error: data.error,
        details: data.details || "",
      });
      setError(data.error + (data.details ? ": " + data.details : ""));
      setProcessing(false);
      return;
    }
    if (data.status === "approved") {
      const successUrl = redirectUrl || process.env.NEXT_PUBLIC_SUCCESS_URL;
      webLog.info(SCOPE, "Payment approved, redirecting", {
        paymentId: data.id,
        target: successUrl || `/payment/success?payment_id=${data.id}`,
      });
      window.location.href = successUrl || `/payment/success?payment_id=${data.id}`;
    } else if (data.status === "in_process" || data.status === "pending") {
      webLog.info(SCOPE, "Payment pending, redirecting", {
        paymentId: data.id,
      });
      window.location.href = `/payment/pending?payment_id=${data.id}`;
    } else {
      webLog.warn(SCOPE, "Payment failed/rejected, redirecting", {
        paymentId: data.id,
        status: data.status,
      });
      window.location.href = `/payment/failure?payment_id=${data.id}`;
    }
  }, [redirectUrl]);

  useEffect(() => {
    const storedTab = window.sessionStorage.getItem("checkout_tab");
    webLog.info(SCOPE, "Restoring checkout tab", { storedTab });
    if (storedTab === "card" || storedTab === "yape") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore tab persisted right before full reload
      setActiveTab(storedTab);
      window.sessionStorage.removeItem("checkout_tab");
    }
  }, []);

  useEffect(() => {
    const sessionToken = searchParams.get("session");
    if (!sessionToken) {
      webLog.warn(SCOPE, "Session token missing, redirecting to fallback page");
      window.location.replace("https://www.nbourchier.com/guiadecompras");
      return;
    }
    sessionTokenRef.current = sessionToken;
    webLog.info(SCOPE, "Decoding checkout session", {
      sessionToken: shortValue(sessionToken),
    });
    fetch("/api/decode-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session: sessionToken }),
    })
      .then(async (res) => {
        const data = await res.json();
        webLog.info(SCOPE, "Decode session response", {
          httpStatus: res.status,
          hasError: Boolean(data?.error),
          sessionId: data?.sessionId || "",
          hasTag1: Boolean(data?.tag1),
          hasTag2: Boolean(data?.tag2),
          hasOffer: Boolean(data?.offer),
        });
        return data;
      })
      .then((data) => {
        if (data.error) {
          webLog.warn(SCOPE, "Session decode returned error", {
            error: data.error,
          });
          setError(data.error);
          setLoading(false);
          return;
        }
        setProductInfo(data.product);
        setSessionId(data.sessionId || "");
        setRedirectUrl(data.redirectUrl || "");
        setTag1(data.tag1 || "");
        setTag2(data.tag2 || "");
        setOfferInfo(data.offer || null);
        setOfferSelected(Boolean(data.offer?.preselected));
        setLoading(false);
        webLog.info(SCOPE, "Session loaded successfully", {
          sessionId: data.sessionId || "",
          productTitle: data?.product?.title || "",
          finalPrice: data?.product?.price || 0,
          hasRedirectUrl: Boolean(data?.redirectUrl),
          offerTitle: data?.offer?.title || "",
          offerPreselected: Boolean(data?.offer?.preselected),
          hasOfferImage: Boolean(data?.offer?.imageUrl),
        });
      })
      .catch((err) => {
        webLog.error(SCOPE, "Session decode request failed", {
          error: err?.message || String(err),
        });
        setError("Enlace inválido. Vuelve a intentar desde el enlace original.");
        setLoading(false);
      });
  }, [searchParams]);

  // Inicializa CardForm cuando sea necesario
  useEffect(() => {
    if (!productInfo || activeTab !== "card") return;

    webLog.info(SCOPE, "Initializing Mercado Pago card form", {
      amount: Number(totalAmountRef.current || 0),
      baseAmount: Number(baseAmount || 0),
      offerAmount: Number((totalAmountRef.current || 0) - Number(baseAmount || 0)),
      offerSelected: Boolean(offerSelectedRef.current),
      sessionId,
      hasTag1: Boolean(tag1),
      hasTag2: Boolean(tag2),
      extraTagCount: Array.isArray(selectedExtraTagsRef.current)
        ? selectedExtraTagsRef.current.length
        : 0,
    });

    const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY, { locale: "es-PE" });

    const cardForm = mp.cardForm({
      amount: String(totalAmountRef.current || baseAmount || 0),
      iframe: true,
      form: {
        id: "form-checkout",
        cardNumber: { id: "form-checkout__cardNumber", placeholder: "Número de tarjeta" },
        expirationDate: { id: "form-checkout__expirationDate", placeholder: "MM/YY" },
        securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
        cardholderName: { id: "form-checkout__cardholderName", placeholder: "Nombre como aparece en la tarjeta" },
        issuer: { id: "form-checkout__issuer", placeholder: "Banco emisor" },
        installments: { id: "form-checkout__installments", placeholder: "Cuotas" },
        identificationType: { id: "form-checkout__identificationType", placeholder: "Tipo de documento" },
        identificationNumber: { id: "form-checkout__identificationNumber", placeholder: "Número de documento" },
        cardholderEmail: { id: "form-checkout__cardholderEmail", placeholder: "Email" },
      },
      callbacks: {
        onFormMounted: (err) => {
          if (err) {
            webLog.error(SCOPE, "Card form mount failed", {
              error: err?.message || String(err),
            });
            return;
          }
          setCardFormReady(true);
          webLog.info(SCOPE, "Card form ready");
        },
        onSubmit: async (event) => {
          event.preventDefault();
          const safeFirstName = (firstNameValueRef.current || "").trim();
          const safeLastName = (lastNameValueRef.current || "").trim();
          if (!safeFirstName || !safeLastName) {
            setError("Por favor ingresa tu nombre y apellido.");
            return;
          }
          setError(null);
          const { paymentMethodId: payment_method_id, issuerId: issuer_id, cardholderEmail: email, amount, token, installments, identificationNumber, identificationType } = cardForm.getCardFormData();
          const confirmedEmail = await askEmailConfirm(email);
          if (!confirmedEmail) {
            webLog.info(SCOPE, "Card payment cancelled at email confirmation");
            return;
          }
          setProcessing(true);
          const currentTotal = Number(
            totalAmountRef.current || productInfo.price || amount || 0
          );
          const currentOfferSelected = Boolean(offerSelectedRef.current);
          const currentOfferInfo = offerInfoRef.current;
          const currentExtraTags = Array.isArray(selectedExtraTagsRef.current)
            ? selectedExtraTagsRef.current
            : [];

          webLog.info(SCOPE, "Submitting card payment", {
            paymentMethod: payment_method_id,
            issuerId: issuer_id || "",
            amount: currentTotal,
            installments: Number(installments || 1),
            email: maskEmail(email),
            token: shortValue(token),
            sessionId,
            hasTag1: Boolean(tag1),
            hasTag2: Boolean(tag2),
            offerSelected: currentOfferSelected,
            offerTitle: currentOfferInfo?.title || "",
            extraTagCount: currentExtraTags.length,
          });

          fetch("/api/process-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              issuer_id,
              payment_method_id,
              transaction_amount: currentTotal,
              installments: Number(installments),
              description:
                currentOfferSelected && currentOfferInfo?.title
                  ? `Total compra: ${productInfo.title} + ${currentOfferInfo.title}`
                  : productInfo.title,
              payer: {
                email,
                first_name: safeFirstName,
                last_name: safeLastName,
                identification: { type: identificationType, number: identificationNumber },
              },
              buyer: {
                first_name: safeFirstName,
                last_name: safeLastName,
              },
              session_id: sessionId,
              session_token: sessionTokenRef.current,
              offer: currentOfferSelected ? currentOfferInfo : null,
              tags: { tag1, tag2, extra: currentExtraTags },
            }),
          })
            .then(async (r) => {
              const data = await r.json();
              webLog.info(SCOPE, "Card payment API response", {
                httpStatus: r.status,
                paymentId: data?.id || "",
                status: data?.status || "",
                error: data?.error || "",
              });
              return data;
            })
            .then((data) => {
              handlePaymentResult(data);
            })
            .catch((err) => {
              webLog.error(SCOPE, "Card payment request failed", {
                error: err?.message || String(err),
              });
              setError("Error al procesar el pago con tarjeta.");
              setProcessing(false);
            });
        },
        onFetching: (resource) => {
          const progressBar = document.querySelector(".progress-bar");
          if (progressBar) progressBar.removeAttribute("value");
          return () => {
            if (progressBar) progressBar.setAttribute("value", "0");
          };
        },
      },
    });

    return () => {
      webLog.info(SCOPE, "Card form cleanup");
      if (typeof cardForm?.unmount === "function") {
        try {
          cardForm.unmount();
        } catch (error) {
          webLog.warn(SCOPE, "Card form unmount failed", {
            error: error?.message || String(error),
          });
        }
      }
      setCardFormReady(false);
    };
  }, [
    productInfo,
    activeTab,
    sessionId,
    tag1,
    tag2,
    baseAmount,
    handlePaymentResult,
    askEmailConfirm,
  ]);

  const handleYapeSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!productInfo) return;
      const safeFirstName = (firstNameValueRef.current || "").trim();
      const safeLastName = (lastNameValueRef.current || "").trim();
      const safeEmail = (yapeEmailValueRef.current || "").trim();
      if (!safeFirstName || !safeLastName || !safeEmail) {
        setError("Por favor ingresa nombre, apellido y email.");
        return;
      }
      const confirmedEmail = await askEmailConfirm(safeEmail);
      if (!confirmedEmail) {
        webLog.info(SCOPE, "Yape payment cancelled at email confirmation");
        return;
      }
      setError(null);
      setProcessing(true);
      setError(null);

      try {
        webLog.info(SCOPE, "Submitting Yape payment", {
          amount: Number(totalAmount || 0),
          baseAmount: Number(baseAmount || 0),
          offerAmount: Number(offerAmount || 0),
          offerSelected,
          offerTitle: offerInfo?.title || "",
          email: maskEmail(safeEmail),
          phone: shortValue(yapePhone),
          otpLength: yapeOtp?.length || 0,
          sessionId,
          hasTag1: Boolean(tag1),
          hasTag2: Boolean(tag2),
          extraTagCount: selectedExtraTags.length,
        });
        const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY, { locale: "es-PE" });
        const yape = mp.yape({ otp: yapeOtp, phoneNumber: yapePhone });
        const yapeToken = await yape.create();

        if (!yapeToken?.id) {
          webLog.warn(SCOPE, "Yape token creation returned empty token");
          setError("No se pudo generar el token de Yape. Verifica los datos.");
          setProcessing(false);
          return;
        }
        webLog.info(SCOPE, "Yape token created", {
          token: shortValue(yapeToken.id),
        });

        const res = await fetch("/api/process-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: yapeToken.id,
            payment_method_id: "yape",
            transaction_amount: Number(totalAmount),
            installments: 1,
            description:
              offerSelected && offerInfo?.title
                ? `Total compra: ${productInfo.title} + ${offerInfo.title}`
                : productInfo.title,
            payer: {
              email: safeEmail,
              first_name: safeFirstName,
              last_name: safeLastName,
            },
            buyer: {
              first_name: safeFirstName,
              last_name: safeLastName,
            },
            session_id: sessionId,
            session_token: sessionTokenRef.current,
            offer: offerSelected ? offerInfo : null,
            tags: { tag1, tag2, extra: selectedExtraTags },
          }),
        });
        const data = await res.json();
        webLog.info(SCOPE, "Yape payment API response", {
          httpStatus: res.status,
          paymentId: data?.id || "",
          status: data?.status || "",
          error: data?.error || "",
        });
        handlePaymentResult(data);
      } catch (err) {
        webLog.error(SCOPE, "Yape payment failed", {
          error: err?.message || String(err),
        });
        setError("Error al procesar el pago con Yape: " + (err.message || ""));
        setProcessing(false);
      }
    },
    [
      productInfo,
      yapePhone,
      yapeOtp,
      tag1,
      tag2,
      sessionId,
      totalAmount,
      baseAmount,
      offerAmount,
      offerSelected,
      offerInfo,
      selectedExtraTags,
      handlePaymentResult,
      askEmailConfirm,
    ]
  );

  if (loading) {
    return (
      <div className="max-w-[480px] mx-auto mt-8 px-4 font-sans">
        <p className="text-center text-gray-500 mt-16">Cambiando de método de pago...</p>
      </div>
    );
  }

  if (error && !productInfo) {
    return (
      <div className="max-w-[480px] mx-auto mt-8 px-4 font-sans">
        <p className="text-center text-red-600 bg-red-50 p-2 rounded mb-3 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#dfe4ea] py-8">
      <div className="max-w-[480px] mx-auto px-4 font-sans">
        {productInfo && (
          <div className="bg-gray-50 border border-[#960621] rounded-xl p-5 mb-5 text-center">
            <img
              src="/assets/1200x900.jpg"
              alt="Banner"
              className="w-full rounded-lg mb-4"
            />
            <h2 className="mb-1 text-lg text-gray-900 font-semibold">{productInfo.title}</h2>
            {String(productInfo.description || "").trim() ? (
              <p className="mb-3 text-sm text-gray-500">{productInfo.description}</p>
            ) : null}
            {totalDiscountAmount > 0 ? (
            <div>
              <p className="text-lg text-gray-400 line-through mb-1">S/ {Number(totalOriginalAmount || 0).toFixed(2)}</p>
              <p className="text-2xl font-bold text-[#960621] mb-0">S/ {Number(totalAmount || 0).toFixed(2)}</p>
              <p className="inline-block bg-green-100 text-green-600 text-xs font-semibold px-3 py-1 rounded-full mt-2">Ahorras S/ {Number(totalDiscountAmount || 0).toFixed(2)}</p>
            </div>
          ) : (
            <p className="text-2xl font-bold text-[#960621] mb-0">S/ {Number(totalAmount || 0).toFixed(2)}</p>
          )}
          {offerSelected && offerInfo ? (
            <p className="mt-2 text-xs text-gray-600">
              Total compra: {productInfo.title} + {offerInfo.title}
            </p>
          ) : null}
          </div>
        )}

      {offerInfo && (
        <div
          className={
            offerSelected
              ? "mb-4 rounded-xl border border-green-500 bg-green-50 p-4"
              : "mb-4 rounded-xl border border-[#960621] bg-white p-4"
          }
        >
          <label className="block cursor-pointer">
            <div
              className={
                offerSelected
                  ? "mb-3 flex items-center justify-between rounded-lg bg-green-100 px-3 py-2"
                  : "mb-3 flex items-center justify-between rounded-lg bg-[#e0e5eb] px-3 py-2"
              }
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                Oferta especial
              </span>
              <span
                className={
                  offerSelected
                    ? "text-xs font-semibold text-green-700"
                    : "text-xs font-semibold text-[#960621]"
                }
              >
                {offerSelected ? "Agregado al carrito" : "Agregar a tu carrito"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={offerSelected}
                onChange={(e) => {
                  const nextValue = e.target.checked;
                  setOfferSelected(nextValue);
                  webLog.info(SCOPE, "Offer selection changed", {
                    offerSelected: nextValue,
                    offerTitle: offerInfo?.title || "",
                    totalAmount: Number(baseAmount + (nextValue ? Number(offerInfo?.price || 0) : 0)),
                  });
                }}
                className="h-4 w-4 shrink-0 accent-[#960621]"
              />
              <div className="flex flex-1 items-center gap-3">
                {String(offerInfo.imageUrl || "").trim() ? (
                  <div className="shrink-0 overflow-hidden  p-1">
                    <img
                      src={offerInfo.imageUrl}
                      alt={offerInfo.title || "Oferta"}
                      className="block h-24 w-auto max-w-[8rem] object-contain sm:h-28 sm:max-w-[9rem]"
                      loading="lazy"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold leading-snug text-gray-900">{offerInfo.title}</p>
                  {offerInfo.description ? (
                    <p className="text-xs leading-snug text-gray-600">{offerInfo.description}</p>
                  ) : null}
                  <p className="text-lg font-bold text-[#960621] leading-none">
                    + S/ {Number(offerInfo.price || 0).toFixed(2)}
                  </p>
                  {offerInfo.originalPrice ? (
                    <p className="text-xs text-gray-400 line-through">
                      Antes S/ {Number(offerInfo.originalPrice).toFixed(2)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </label>
        </div>
      )}

      {/* Tabs de método de pago */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => {
            if (activeTab !== "card") {
              setTabLoading(true);
              window.sessionStorage.setItem("checkout_tab", "card");
              setTimeout(() => window.location.reload(), 300);
            }
          }}
          disabled={tabLoading}
          className={activeTab === "card" ? "flex-1 py-3 border-2 border-[#960621] rounded-lg bg-[#e0e5eb] text-base font-semibold text-[#960621] flex items-center justify-center cursor-pointer" : "flex-1 py-3 border-2 border-[#960621] rounded-lg bg-white text-base font-medium text-gray-500 flex items-center justify-center cursor-pointer"}
        >
          <CreditCard size={18} style={{ marginRight: 6 }} /> Tarjeta
        </button>
        <button
          onClick={() => {
            if (activeTab !== "yape") {
              setTabLoading(true);
              window.sessionStorage.setItem("checkout_tab", "yape");
              setTimeout(() => window.location.reload(), 300);
            }
          }}
          disabled={tabLoading}
          className={activeTab === "yape" ? "flex-1 py-3 border-2 border-[#960621] rounded-lg bg-[#e0e5eb] text-base font-semibold text-[#960621] flex items-center justify-center cursor-pointer" : "flex-1 py-3 border-2 border-[#960621] rounded-lg bg-white text-base font-medium text-gray-500 flex items-center justify-center cursor-pointer"}
        >
          <Smartphone size={18} style={{ marginRight: 6 }} /> Yape
        </button>
      </div>

      {error && <p className="text-center text-red-600 bg-red-50 p-2 rounded mb-3 text-sm">{error}</p>}

      {/* TAB: Tarjeta */}
      {activeTab === "card" && (
        <form id="form-checkout" className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Nombres</label>
              <input
                type="text"
                placeholder="Ingrese su nombre"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  firstNameValueRef.current = e.target.value;
                }}
                required
                className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Apellidos</label>
              <input
                type="text"
                placeholder="Ingrese su apellido"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  lastNameValueRef.current = e.target.value;
                }}
                required
                className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Número de tarjeta</label>
            <div id="form-checkout__cardNumber" className="h-10 border border-[#960621] rounded-md px-3 bg-white"></div>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-gray-700">Vencimiento</label>
              <div id="form-checkout__expirationDate" className="h-10 border border-[#960621] rounded-md px-3 bg-white"></div>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-gray-700">CVV</label>
              <div id="form-checkout__securityCode" className="h-10 border border-[#960621] rounded-md px-3 bg-white"></div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Titular de la tarjeta</label>
            <input id="form-checkout__cardholderName" type="text" className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white" />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium text-gray-700">Tipo doc.</label>
              <select id="form-checkout__identificationType" className="h-10 border border-[#960621] rounded-md px-2 text-base bg-white" />
            </div>
            <div className="flex flex-col gap-1 flex-2">
              <label className="text-xs font-medium text-gray-700">Nro. documento</label>
              <input id="form-checkout__identificationNumber" type="text" className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Email</label>
            <input id="form-checkout__cardholderEmail" type="email" className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white" />
          </div>
          <select id="form-checkout__issuer" className="hidden" />
          <select id="form-checkout__installments" className="hidden" />
          <progress value="0" className="progress-bar w-full h-1 appearance-none" />
          <button type="submit" id="form-checkout__submit" disabled={processing || !cardFormReady} className={processing ? "mt-2 h-12 rounded-lg bg-gray-400 text-white text-lg font-semibold cursor-not-allowed" : "mt-2 h-12 rounded-lg bg-[#960621] text-white text-lg font-semibold cursor-pointer"}>
            {processing ? "Procesando..." : `Pagar S/ ${Number(totalAmount || 0).toFixed(2)}`}
          </button>
        </form>
      )}

      {/* TAB: Yape */}
      {activeTab === "yape" && (
        <form onSubmit={handleYapeSubmit} className="flex flex-col gap-3">
          <div className="flex items-start gap-3 py-3">
            <div className="mt-0.5 shrink-0">
              <Smartphone size={44} color="#6c2eb9" />
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Abre tu app de <strong>Yape</strong>, ve a la sección de pagos y genera un código OTP de 6 dígitos.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Nombres</label>
              <input
                type="text"
                placeholder="Ingrese su nombre"
                value={firstName}
                onChange={(e) => {
                  setFirstName(e.target.value);
                  firstNameValueRef.current = e.target.value;
                }}
                required
                className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-700">Apellidos</label>
              <input
                type="text"
                placeholder="Ingrese su apellido"
                value={lastName}
                onChange={(e) => {
                  setLastName(e.target.value);
                  lastNameValueRef.current = e.target.value;
                }}
                required
                className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Email</label>
            <input
              type="email"
              placeholder="Ej: correo@dominio.com"
              value={yapeEmail}
              onChange={(e) => {
                setYapeEmail(e.target.value);
                yapeEmailValueRef.current = e.target.value;
              }}
              required
              className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Número de celular</label>
            <input type="tel" placeholder="Ej: 999888777" value={yapePhone} onChange={(e) => setYapePhone(e.target.value)} maxLength={9} required className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-700">Código OTP (6 dígitos)</label>
            <input type="text" placeholder="Ej: 123456" value={yapeOtp} onChange={(e) => setYapeOtp(e.target.value)} maxLength={6} required className="h-10 border border-[#960621] rounded-md px-3 text-base outline-none bg-white" />
          </div>
          <button type="submit" disabled={processing || yapePhone.length < 9 || yapeOtp.length < 6 || !yapeEmail.trim() || !firstName.trim() || !lastName.trim()} className={processing ? "mt-2 h-12 rounded-lg bg-gray-400 text-white text-lg font-semibold cursor-not-allowed" : "mt-2 h-12 rounded-lg bg-purple-700 text-white text-lg font-semibold cursor-pointer"}>
            {processing ? "Procesando..." : `Pagar con Yape S/ ${Number(totalAmount || 0).toFixed(2)}`}
          </button>
        </form>
      )}
      </div>

      {emailConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => resolveEmailConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900">Confirma tu correo</h3>
            <p className="mt-2 text-sm text-gray-500">
              Aquí recibirás tu compra. Asegúrate de que esté bien escrito.
            </p>
            <div className="mt-4 rounded-lg bg-[#e0e5eb] px-4 py-3 text-center">
              <span className="break-all text-base font-semibold text-[#960621]">
                {emailConfirm.email || "(sin correo)"}
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => resolveEmailConfirm(true)}
                className="h-11 flex-1 rounded-lg bg-[#960621] text-base font-semibold text-white cursor-pointer hover:opacity-90"
              >
                Sí, es correcto
              </button>
              <button
                type="button"
                onClick={() => resolveEmailConfirm(false)}
                className="h-11 flex-1 rounded-lg border border-gray-300 bg-white text-base font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
              >
                Corregir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p className="text-center mt-10">Cargando...</p>}>
      <CheckoutContent />
    </Suspense>
  );
}
