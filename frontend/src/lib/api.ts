export type UserRole = "host" | "guest";

export type AppUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
};

export type SignupPayload = {
  firstName: string;
  lastName: string;
};

export type UpdateProfilePayload = {
  firstName: string;
  lastName: string;
};

export type AuthSession = {
  customToken: string;
  user: AppUser;
};

export type SignupPendingResponse = {
  message: string;
};

export type ImageRecord = {
  id: number;
  imageUrl: string;
  date: string;
  uploadedAt: string;
};

export type SendEmailPayload = {
  to: string;
  subject: string;
  message: string;
};

export type SendEmailResponse = {
  id: string;
};

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "request failed";
    throw new Error(message);
  }

  return body as T;
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!(init?.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
  });

  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === "string" ? body.error : "request failed";
    throw new Error(message);
  }

  return body as T;
}

export function loginUser(email: string, password: string) {
  return publicFetch<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signupUser(email: string, password: string, profile: SignupPayload) {
  return publicFetch<SignupPendingResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, ...profile }),
  });
}

export function confirmSignup(token: string) {
  return publicFetch<AuthSession>("/auth/confirm-signup", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function getSession(token: string) {
  return apiFetch<AppUser>("/auth/session", token);
}

export function updateProfile(token: string, payload: UpdateProfilePayload) {
  return apiFetch<AppUser>("/users/me", token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listImages(token: string) {
  return apiFetch<ImageRecord[] | null>("/images", token).then((images) => images ?? []);
}

export function uploadImage(token: string, file: File, date: string) {
  const formData = new FormData();
  formData.append("image", file);
  if (date) {
    formData.append("date", date);
  }

  return apiFetch<ImageRecord>("/images", token, {
    method: "POST",
    body: formData,
  });
}

export function deleteImage(token: string, id: number) {
  return apiFetch<Record<string, never>>(`/images/${id}`, token, {
    method: "DELETE",
  });
}

export function sendHostEmail(token: string, payload: SendEmailPayload) {
  return apiFetch<SendEmailResponse>("/emails", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
