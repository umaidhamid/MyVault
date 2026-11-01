// Envelope v1: [0x01 suite][12 B random IV][AES-256-GCM ciphertext || tag]
// Plaintext is 4-byte length-prefixed and zero-padded to a multiple of 256 B.
const SUITE_AES_GCM_V1 = 1;
const PAD = 256;

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
const aad = (s: string) => new TextEncoder().encode(s) as BufferSource;

export async function seal(rawKey: Uint8Array, plaintext: Uint8Array, context: string): Promise<Uint8Array> {
  const padded = new Uint8Array(Math.ceil((4 + plaintext.length) / PAD) * PAD);
  new DataView(padded.buffer).setUint32(0, plaintext.length);
  padded.set(plaintext, 4);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(context) }, await aesKey(rawKey), padded),
  );
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = SUITE_AES_GCM_V1;
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

export async function open(rawKey: Uint8Array, envelope: Uint8Array, context: string): Promise<Uint8Array> {
  if (envelope[0] !== SUITE_AES_GCM_V1 || envelope.length < 13 + 16 + PAD) throw new Error("bad envelope");
  const padded = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.slice(1, 13), additionalData: aad(context) },
      await aesKey(rawKey),
      envelope.slice(13),
    ),
  );
  const len = new DataView(padded.buffer).getUint32(0);
  if (len > padded.length - 4) throw new Error("bad envelope");
  return padded.slice(4, 4 + len);
}
