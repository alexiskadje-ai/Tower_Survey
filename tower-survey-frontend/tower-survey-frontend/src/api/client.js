const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

function getToken() {
  return localStorage.getItem("ti_token");
}

async function request(path, { method = "GET", body, isForm = false, raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isForm) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      // réponse vide ou non-JSON
    }
    const err = new Error(data?.error || `Erreur réseau (${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (raw) return res;

  try {
    return await res.json();
  } catch {
    return null;
  }
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
  getCompletionStatus: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/sites/completion-status${qs ? `?${qs}` : ""}`);
  },
  getActiveTemplates: () => request("/templates/active"),
  syncResponses: (responses) => request("/responses/sync", { method: "POST", body: { responses } }),
  listResponses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/responses${qs ? `?${qs}` : ""}`);
  },
  uploadMedia: (responseId, formData) =>
    request(`/responses/${responseId}/media`, { method: "POST", body: formData, isForm: true }),
  adminListResponses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/responses${qs ? `?${qs}` : ""}`);
  },
  adminResponseDetail: (id) => request(`/admin/responses/${id}`),
  adminExportCsv: (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    return request(`/admin/responses/export/csv${qs ? `?${qs}` : ""}`, { raw: true }).then((res) => handleDownload(res, "csv"));
  },
  adminExportExcel: (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    return request(`/admin/responses/export/excel${qs ? `?${qs}` : ""}`, { raw: true }).then((res) => handleDownload(res, "xlsx"));
  },
  adminEmailExport: (body) => request("/admin/responses/email", { method: "POST", body }),

  // --- Check-in (dual-technician) ----------------------------------------
  // Toutes les méthodes renvoient une réponse JSON.
  // Pour l'upload selfie (multipart), on utilise un fetch direct avec
  // un FormData, comme uploadMedia.
  createCheckinSession: ({ client_uuid, site_id }) =>
    request("/checkin/session", { method: "POST", body: { client_uuid, site_id } }),
  attachSiteToCheckinSession: (sessionId, site_id) =>
    request(`/checkin/session/${sessionId}`, { method: "PATCH", body: { site_id } }),
  getCheckinSession: (sessionId) => request(`/checkin/session/${sessionId}`),
  verifySecondTechnician: (body) =>
    request("/checkin/verify-second-technician", { method: "POST", body }),
  uploadCheckinSelfie: (formData) =>
    fetch(`${API_BASE}/checkin`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    }).then(async (res) => {
      const data = res.ok ? await res.json() : await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(data?.error || `Erreur checkin (${res.status})`);
        err.status = res.status;
        throw err;
      }
      return data;
    }),
};

async function handleDownload(res, ext) {
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-responses-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  return { success: true };
}

export { getToken };
