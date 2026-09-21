export function getRequestId(request: Request): string {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId || `req_${crypto.randomUUID()}`;
}
