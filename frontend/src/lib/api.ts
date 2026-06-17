export type UserRole = "host" | "guest";

export type AppUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;
};

export type RegisterPayload = {
  firstName: string;
  lastName: string;
};

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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

export function registerUser(token: string, payload: RegisterPayload) {
  return apiFetch<AppUser>("/users/register", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCurrentUser(token: string) {
  return apiFetch<AppUser>("/users/me", token);
}
