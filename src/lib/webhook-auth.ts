/** Verifica el secreto compartido de los webhooks de correo (comparación en tiempo constante). */
export function autorizadoWebhook(request: Request): boolean {
  const secreto = process.env.CORREO_WEBHOOK_SECRET;
  const recibido = request.headers.get("x-webhook-secret") ?? "";
  if (!secreto || recibido.length !== secreto.length) return false;
  let r = 0;
  for (let i = 0; i < secreto.length; i++) r |= recibido.charCodeAt(i) ^ secreto.charCodeAt(i);
  return r === 0;
}
