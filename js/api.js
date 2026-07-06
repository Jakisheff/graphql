const DOMAIN = "https://01.tomorrow-school.ai";
const SIGNIN_URL = `${DOMAIN}/api/auth/signin`;
const GRAPHQL_URL = `${DOMAIN}/api/graphql-engine/v1/graphql`;

const TOKEN_KEY = "jwt";

/* ---------- token storage ---------- */

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/* ---------- auth ---------- */

// btoa only handles latin1, so escape unicode credentials first
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

// POST /api/auth/signin with Basic auth; works with username:password
// and email:password. Returns the JWT string.
export async function signin(identifier, password) {
  const res = await fetch(SIGNIN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${b64(`${identifier}:${password}`)}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid username/email or password.");
    }
    throw new Error(`Sign in failed (${res.status}). Please try again.`);
  }

  const body = await res.json();
  const token = typeof body === "string" ? body : body?.token;
  if (!token) throw new Error("Sign in failed: no token received.");
  return token;
}

// Decode the JWT payload (base64url) to inspect the authenticated user
export function decodeJWT(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

export function userIdFromToken(token) {
  const payload = decodeJWT(token);
  if (!payload) return null;
  const hasura = payload["https://hasura.io/jwt/claims"];
  return Number(hasura?.["x-hasura-user-id"] ?? payload.sub) || null;
}

/* ---------- GraphQL ---------- */

export async function gql(query, variables = {}) {
  const token = getToken();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (res.status === 401 || res.status === 403) {
    const err = new Error("Session expired. Please sign in again.");
    err.unauthorized = true;
    throw err;
  }
  if (!res.ok) throw new Error(`GraphQL request failed (${res.status}).`);

  const body = await res.json();
  if (body.errors?.length) {
    // JWT rejected by hasura also surfaces as a GraphQL error
    if (body.errors.some((e) => /jwt|token|unauthor/i.test(e.message))) {
      const err = new Error("Session expired. Please sign in again.");
      err.unauthorized = true;
      throw err;
    }
    throw new Error(body.errors[0].message);
  }
  return body.data;
}
