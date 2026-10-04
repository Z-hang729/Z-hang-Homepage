const encoder = new TextEncoder();

export function randomSecret(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

export async function digest(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function fromBase64(value) {
  return Uint8Array.from(atob(value.replace(/\s/g, '')), c => c.charCodeAt(0));
}

export async function challenge(verifier) {
  return toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function key(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret ?? '')) throw new Error('SESSION_ENCRYPTION_KEY must be 32 random bytes, encoded as 64 hexadecimal characters.');
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), x => parseInt(x, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(value, secret, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await key(secret), encoder.encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function unseal(value, secret, context) {
  const [iv, encrypted] = value.split('.');
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv), additionalData: encoder.encode(context) }, await key(secret), fromBase64(encrypted));
  return new TextDecoder().decode(bytes);
}
