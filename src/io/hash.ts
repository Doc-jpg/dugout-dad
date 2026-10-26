/** SHA-256 as lowercase hex, using the platform WebCrypto (browsers and Node 19+). */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const subtle = (globalThis as any).crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto subtle API is not available in this environment');
  // Copy into a fresh ArrayBuffer-backed view so subarrays/SharedArrayBuffers are accepted.
  const buf = new Uint8Array(bytes.byteLength);
  buf.set(bytes);
  const digest = await subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
