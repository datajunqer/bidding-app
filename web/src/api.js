const API = import.meta.env.VITE_API_BASE;

/**
 * Generic helper to handle JSON responses
 */
async function jsonFetch(url, options = {}) {
    const res = await fetch(url, {
        credentials: "include", // 🔴 REQUIRED for cookies
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data?.error || "Request failed");
    }
    return data;
}

/**
 * Auth APIs
 */
export function register(userId, password) {
    return jsonFetch(`${API}/auth/register`, {
        method: "POST",
        body: JSON.stringify({ userId, password })
    });
}

export function login(userId, password) {
    return jsonFetch(`${API}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ userId, password })
    });
}

export function logout() {
    return jsonFetch(`${API}/auth/logout`, {
        method: "POST"
    });
}

export function me() {
    return jsonFetch(`${API}/auth/me`);
}

/**
 * Auction APIs
 */
export function getItems() {
    return jsonFetch(`${API}/items`);
}
