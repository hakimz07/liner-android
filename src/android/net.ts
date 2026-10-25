// Replaces window.fetch on Android. Every cross-origin request goes through the native HTTP
// client, so CORS never applies (Electron switched CORS off the same way) and the Origin/Referer
// /User-Agent headers can be set, which Electron's webRequest hook did on desktop.
import { Capacitor, CapacitorHttp } from "@capacitor/core";

const YOUTUBE_HOST = /^(?:[\w-]+\.)*(?:youtube\.com|googlevideo\.com)$/i;
const APPLE_HOST = /^(?:amp-api|api)\.music\.apple\.com$/i;
// electron/youtube/* runs on a www.youtube.com page on desktop, so it uses relative paths
const YOUTUBE_RELATIVE = /^\/(?:tv(?:_config)?(?:[/?]|$)|youtubei\/|api\/jnn\/|s\/player\/)/;
const UA_OVERRIDE_HEADER = "x-liner-user-agent";
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

function spoofedOrigin(url: URL): string | null {
  if (APPLE_HOST.test(url.hostname)) return "https://music.apple.com";
  if (YOUTUBE_HOST.test(url.hostname)) {
    return url.hostname === "www.youtube.com"
      ? "https://www.youtube.com"
      : "https://music.youtube.com";
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface BodyPayload {
  data?: string;
  dataType?: "file";
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<BodyPayload> {
  const body = init?.body;
  if (body == null) {
    if (input instanceof Request && input.body) {
      const contentType = input.headers.get("content-type") ?? "";
      if (/json|text|urlencoded/i.test(contentType)) return { data: await input.clone().text() };
      return { data: toBase64(new Uint8Array(await input.clone().arrayBuffer())), dataType: "file" };
    }
    return {};
  }
  if (typeof body === "string") return { data: body };
  if (body instanceof URLSearchParams) return { data: body.toString() };
  const bytes =
    body instanceof Blob
      ? new Uint8Array(await body.arrayBuffer())
      : body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : ArrayBuffer.isView(body)
          ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
          : new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
  return { data: toBase64(bytes), dataType: "file" };
}

export function installNativeFetch(): void {
  if (!Capacitor.isNativePlatform()) return;
  const webFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try {
      url = new URL(YOUTUBE_RELATIVE.test(raw) ? `https://www.youtube.com${raw}` : raw, window.location.href);
    } catch {
      return webFetch(input, init);
    }
    const isRemote = /^https?:$/.test(url.protocol) && url.origin !== window.location.origin;
    if (!isRemote) return webFetch(input, init);
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const userAgent = headers.get(UA_OVERRIDE_HEADER);
    headers.delete(UA_OVERRIDE_HEADER);
    const origin = spoofedOrigin(url);
    if (origin) {
      headers.set("Origin", origin);
      headers.set("Referer", `${origin}/`);
    }
    if (userAgent) headers.set("User-Agent", userAgent);
    else if (!headers.has("user-agent")) headers.set("User-Agent", navigator.userAgent);

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const payload = method === "GET" || method === "HEAD" ? {} : await readBody(input, init);

    const result = await CapacitorHttp.request({
      url: url.href,
      method,
      headers: Object.fromEntries(headers.entries()),
      responseType: "arraybuffer",
      ...payload,
    });

    const bytes =
      typeof result.data === "string"
        ? fromBase64(result.data)
        : new TextEncoder().encode(JSON.stringify(result.data ?? ""));
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(result.headers ?? {})) {
      try {
        responseHeaders.append(key, String(value));
      } catch {
        /* skip headers the runtime rejects */
      }
    }
    for (const name of ["content-encoding", "content-length", "transfer-encoding"]) {
      responseHeaders.delete(name);
    }
    return new Response(NULL_BODY_STATUS.has(result.status) ? null : (bytes as unknown as BodyInit), {
      status: result.status,
      headers: responseHeaders,
    });
  };
}
