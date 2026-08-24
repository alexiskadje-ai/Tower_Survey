const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken() {
  return localStorage.getItem("ti_token");
}

async function request(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // réponse vide (ex: 204)
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Erreur réseau (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  login: (matricule, password) => request("/auth/login", { method: "POST", body: { matricule, password } }),
  register: (fullName, email, password) =>
    request("/auth/register", { method: "POST", body: { full_name: fullName, email, password } }),
  verifyOtp: (email, otp) =>
    request("/auth/verify-otp", { method: "POST", body: { email, otp } }),
  resendOtp: (email) =>
    request("/auth/resend-otp", { method: "POST", body: { email } }),
  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (email, otp, newPassword) =>
    request("/auth/reset-password", { method: "POST", body: { email, otp, new_password: newPassword, confirm_password: newPassword } }),
  getSites: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/sites${qs ? `?${qs}` : ""}`);
  },
  getActiveTemplates: () => request("/templates/active"),
  syncResponses: (responses) => request("/responses/sync", { method: "POST", body: { responses } }),
  listResponses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/responses${qs ? `?${qs}` : ""}`);
  },
  uploadMedia: (responseId, formData) =>
    request(`/responses/${responseId}/media`, { method: "POST", body: formData, isForm: true }),
};

export { getToken };
