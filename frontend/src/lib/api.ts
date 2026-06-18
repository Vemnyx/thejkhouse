export type UserRole = "host" | "guest";

export type AppUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  birthday: string | null;
  role: UserRole;
  createdAt: string;
};

export type SignupPayload = {
  firstName: string;
  lastName: string;
  birthday: string;
};

export type UpdateProfilePayload = {
  firstName: string;
  lastName: string;
  birthday: string;
};

export type AuthSession = {
  customToken: string;
  user: AppUser;
};

export type SignupPendingResponse = {
  message: string;
};

export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export type ImageRecord = {
  id: number;
  imageUrl: string;
  date: string;
  partyId: number | null;
  homepage: boolean;
  uploadedAt: string;
};

export type PartyRecord = {
  id: number;
  label: string;
  date: string;
  imageUrl: string;
  partifulUrl: string;
};

export type UploadImageOptions = {
  partyId?: number | null;
  homepage?: boolean;
};

export type SendEmailPayload = {
  to: string;
  subject: string;
  message: string;
};

export type SendEmailResponse = {
  id: string;
};

export type HomepageContent = {
  html: string;
  images: ImageRecord[];
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
    const code = typeof body.code === "string" ? body.code : undefined;
    throw new ApiError(message, code);
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
    const code = typeof body.code === "string" ? body.code : undefined;
    throw new ApiError(message, code);
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

export function resendSignupConfirmation(email: string) {
  return publicFetch<SignupPendingResponse>("/auth/resend-confirmation", {
    method: "POST",
    body: JSON.stringify({ email }),
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

export function listParties(token: string) {
  return apiFetch<PartyRecord[] | null>("/parties", token).then((parties) => parties ?? []);
}

export function getHomepage(token: string) {
  return apiFetch<HomepageContent>("/homepage", token);
}

export function getHomepageImages() {
  return publicFetch<ImageRecord[] | null>("/homepage/images").then((images) => images ?? []);
}

export function updateHomepage(token: string, html: string) {
  return apiFetch<HomepageContent>("/homepage", token, {
    method: "PATCH",
    body: JSON.stringify({ html }),
  });
}

export function listUsers(token: string) {
  return apiFetch<AppUser[] | null>("/users", token).then((users) => users ?? []);
}

export function deleteUser(token: string, id: number) {
  return apiFetch<Record<string, never>>(`/users/${id}`, token, {
    method: "DELETE",
  });
}

export function uploadImage(token: string, file: File, date: string, options: UploadImageOptions = {}) {
  const formData = new FormData();
  formData.append("image", file);
  if (date) {
    formData.append("date", date);
  }
  if (options.partyId) {
    formData.append("partyId", String(options.partyId));
  }
  if (options.homepage) {
    formData.append("homepage", "true");
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
