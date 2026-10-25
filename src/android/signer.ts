// Browser version of electron/crypto.ts (no node:crypto, no Buffer). Uses the same embedded WASM.
// Note: Chrome refuses synchronous WebAssembly.Module() for buffers over 4 KB on the main
// thread, so the module is instantiated asynchronously.
import { SIGNER_WASM_BASE64 } from "../../electron/signer";

interface SignerExports {
  liner_alloc: (len: number) => number;
  liner_dealloc: (ptr: number, len: number) => void;
  liner_get_result_ptr: () => number;
  liner_get_result_len: () => number;
  liner_sign_cover_url: (ptr: number, len: number) => number;
  liner_sign_request: (...args: [number, number, number, number, number, number, bigint, number, number]) => number;
  liner_sign_monitor_request: (...args: [number, number, number, number, number, number, bigint, number, number]) => number;
  liner_sign_raw_payload: (ptr: number, len: number) => number;
  memory: WebAssembly.Memory;
}

export interface SignRequestInput {
  method: string;
  path: string;
  body?: string | null;
  timestamp?: number;
}

let serverTimeOffsetMs = 0;
let loading: Promise<SignerExports> | null = null;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function load(): Promise<SignerExports> {
  loading ??= (async () => {
    const binary = atob(SIGNER_WASM_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return instance.exports as unknown as SignerExports;
  })();
  return loading;
}

function put(wasm: SignerExports, bytes: Uint8Array) {
  const ptr = wasm.liner_alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  return { ptr, len: bytes.length, free: () => wasm.liner_dealloc(ptr, bytes.length) };
}

function result(wasm: SignerExports): string {
  const ptr = wasm.liner_get_result_ptr();
  const len = wasm.liner_get_result_len();
  if (!ptr || len === 0) return "";
  return decoder.decode(new Uint8Array(wasm.memory.buffer, ptr, len));
}

function adjustedTimestamp(): number {
  return Math.floor((Date.now() + serverTimeOffsetMs) / 1000);
}

function randomNonce(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function signWith(kind: "request" | "monitor", input: SignRequestInput) {
  const wasm = await load();
  const timestamp = input.timestamp ?? adjustedTimestamp();
  const nonce = randomNonce();
  const method = put(wasm, encoder.encode(input.method));
  const path = put(wasm, encoder.encode(input.path));
  const body = put(wasm, encoder.encode(input.body ?? ""));
  const nonceBuf = put(wasm, encoder.encode(nonce));
  try {
    const fn = kind === "request" ? wasm.liner_sign_request : wasm.liner_sign_monitor_request;
    const code = fn(method.ptr, method.len, path.ptr, path.len, body.ptr, body.len, BigInt(timestamp), nonceBuf.ptr, nonceBuf.len);
    if (code !== 0) throw new Error(`wasm sign_${kind}_request failed with code ${code}`);
    return { signature: result(wasm), timestamp, nonce };
  } finally {
    method.free();
    path.free();
    body.free();
    nonceBuf.free();
  }
}

export async function signRequest(input: SignRequestInput) {
  try {
    return await signWith("request", input);
  } catch (err) {
    return { error: String((err as Error)?.message ?? err) };
  }
}

export async function signMonitorRequest(input: SignRequestInput) {
  try {
    return await signWith("monitor", input);
  } catch (err) {
    return { error: String((err as Error)?.message ?? err) };
  }
}

export async function signCoverUrl(payload: string): Promise<string> {
  try {
    const wasm = await load();
    const buf = put(wasm, encoder.encode(payload));
    try {
      const code = wasm.liner_sign_cover_url(buf.ptr, buf.len);
      if (code !== 0) throw new Error(`wasm sign_cover_url failed with code ${code}`);
      return result(wasm);
    } finally {
      buf.free();
    }
  } catch {
    return payload;
  }
}

export async function signRawPayload(payload: number[] | Uint8Array): Promise<string> {
  try {
    const wasm = await load();
    const buf = put(wasm, Uint8Array.from(payload));
    try {
      const code = wasm.liner_sign_raw_payload(buf.ptr, buf.len);
      if (code !== 0) throw new Error(`wasm sign_raw_payload failed with code ${code}`);
      return result(wasm);
    } finally {
      buf.free();
    }
  } catch {
    return "";
  }
}

export async function syncServerTime(dateHeaderOrMs: string | number): Promise<number> {
  const serverMs = typeof dateHeaderOrMs === "number" ? dateHeaderOrMs : Date.parse(dateHeaderOrMs);
  if (!Number.isNaN(serverMs) && serverMs > 0) serverTimeOffsetMs = serverMs - Date.now();
  return serverTimeOffsetMs;
}

export async function getServerTimeOffset(): Promise<number> {
  return serverTimeOffsetMs;
}
