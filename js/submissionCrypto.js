// Cifrado de entregas con clave publica en la ficha y clave privada protegida
// por la contrasena del profesor.

const KDF = 'PBKDF2-SHA256';
const WRAP_ALG = 'AES-GCM';
const CONTENT_ALG = 'AES-GCM';
const PUBLIC_ALG = 'RSA-OAEP-SHA256';
const MANIFEST_ALG = 'AES-GCM';
const ITERATIONS = 250000;

function bytesToB64(bytes) {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
}

function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomB64(n) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytesToB64(bytes);
}

async function deriveWrapKey(password, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: b64ToBytes(saltB64),
      iterations
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function aesEncryptJson(key, value, ivB64) {
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    key,
    plain
  );
  return bytesToB64(new Uint8Array(encrypted));
}

async function aesDecryptJson(key, ciphertextB64, ivB64) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(ciphertextB64)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function createSubmissionCrypto(password) {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const salt = randomB64(16);
  const privateIv = randomB64(12);
  const wrapKey = await deriveWrapKey(password, salt, ITERATIONS);

  return {
    enabled: true,
    publicAlg: PUBLIC_ALG,
    contentAlg: CONTENT_ALG,
    wrapAlg: WRAP_ALG,
    kdf: KDF,
    iterations: ITERATIONS,
    salt,
    privateIv,
    publicKey,
    encryptedPrivateKey: await aesEncryptJson(wrapKey, privateKey, privateIv)
  };
}

export async function encryptSubmission(data, cryptoCfg) {
  if (!cryptoCfg?.enabled || !cryptoCfg.publicKey) return data;

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    cryptoCfg.publicKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  const contentKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawContentKey = await crypto.subtle.exportKey('raw', contentKey);
  const contentIv = randomB64(12);
  const ciphertext = await aesEncryptJson(contentKey, data, contentIv);
  const encryptedContentKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawContentKey
  );

  return {
    formato: 'workpdf-entrega-cifrada',
    version: 1,
    crypto: {
      publicAlg: cryptoCfg.publicAlg || PUBLIC_ALG,
      contentAlg: cryptoCfg.contentAlg || CONTENT_ALG,
      wrapAlg: cryptoCfg.wrapAlg || WRAP_ALG,
      kdf: cryptoCfg.kdf || KDF,
      iterations: cryptoCfg.iterations || ITERATIONS,
      salt: cryptoCfg.salt,
      privateIv: cryptoCfg.privateIv,
      publicKey: cryptoCfg.publicKey,
      encryptedPrivateKey: cryptoCfg.encryptedPrivateKey,
      encryptedContentKey: bytesToB64(new Uint8Array(encryptedContentKey)),
      contentIv
    },
    ciphertext
  };
}

export async function decryptSubmission(data, password) {
  if (!data || data.formato !== 'workpdf-entrega-cifrada') {
    throw new Error('No es una entrega cifrada de OpenWorksheets.');
  }
  const cfg = data.crypto || {};
  const wrapKey = await deriveWrapKey(password, cfg.salt, cfg.iterations || ITERATIONS);
  const privateJwk = await aesDecryptJson(wrapKey, cfg.encryptedPrivateKey, cfg.privateIv);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );
  const rawContentKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    b64ToBytes(cfg.encryptedContentKey)
  );
  const contentKey = await crypto.subtle.importKey(
    'raw',
    rawContentKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  return aesDecryptJson(contentKey, data.ciphertext, cfg.contentIv);
}

export function isEncryptedSubmission(data) {
  return data?.formato === 'workpdf-entrega-cifrada';
}

export async function encryptManifestForStudent(manifest, password) {
  if (!password) return manifest;
  const salt = randomB64(16);
  const iv = randomB64(12);
  const key = await deriveWrapKey(password, salt, ITERATIONS);
  const access = { ...(manifest.access || {}) };
  delete access.password;
  const payload = {
    author: manifest.author || '',
    instructions: manifest.instructions || '',
    settings: manifest.settings || {},
    access,
    submissionCrypto: manifest.submissionCrypto || null,
    pages: manifest.pages || []
  };
  return {
    format: manifest.format,
    version: manifest.version,
    id: manifest.id,
    title: manifest.title || '',
    lang: manifest.lang || '',
    encryptedManifest: {
      version: 1,
      alg: MANIFEST_ALG,
      kdf: KDF,
      iterations: ITERATIONS,
      salt,
      iv,
      ciphertext: await aesEncryptJson(key, payload, iv)
    }
  };
}

export async function decryptManifestForStudent(manifest, password, { keepPassword = false } = {}) {
  if (!isEncryptedManifest(manifest)) return manifest;
  const cfg = manifest.encryptedManifest;
  const key = await deriveWrapKey(password, cfg.salt, cfg.iterations || ITERATIONS);
  const payload = await aesDecryptJson(key, cfg.ciphertext, cfg.iv);
  return {
    ...manifest,
    encryptedManifest: undefined,
    author: payload.author || '',
    instructions: payload.instructions || '',
    settings: payload.settings || {},
    access: {
      ...(payload.access || {}),
      password: keepPassword ? password : ''
    },
    submissionCrypto: payload.submissionCrypto || undefined,
    pages: payload.pages || []
  };
}

export function isEncryptedManifest(manifest) {
  return Boolean(manifest?.encryptedManifest?.ciphertext);
}
