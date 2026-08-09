export type UserRole = "host" | "guest";

export type AppUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  birthday: string | null;
  avatarUrl: string | null;
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
  eventId: number | null;
  teamId: number | null;
  userIds: number[];
  homepage: boolean;
  notes: string;
  uploadedAt: string;
};

export type PartyRecord = {
  id: number;
  label: string;
  date: string;
  html: string;
};

export type EventType = "0" | "1";

export const eventTypeLabels: Record<EventType, string> = {
  "0": "Costume Contest",
  "1": "Bracket",
};

export type EventRecord = {
  id: number;
  label: string;
  partyId: number | null;
  startDate: string | null;
  endDate: string | null;
  completedAt: string | null;
  type: EventType;
  description: string;
  metadata: Record<string, unknown>;
};

export function eventRouteIdentifier(event: EventRecord) {
  const slug = event.label
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `event-${event.id}`;
}

export type EventUserRecord = {
  eventId: number;
  userId: number;
  contestant: boolean;
  metadata: Record<string, unknown>;
};

export type EventTeamRecord = {
  id: number;
  eventId: number;
  name: string;
  userIds: number[];
  metadata: Record<string, unknown>;
};

export type EventVoteRecord = {
  eventId: number;
  userId: number;
  metadata: Record<string, unknown>;
};

export type BracketParticipant = {
  key: string;
  type: "individual" | "team";
  userIds: number[];
  teamId?: number | null;
  label: string;
};

export type EventRoundRecord = {
  id: number;
  eventId: number;
  roundNumber: number;
  position: number;
  participantOne: BracketParticipant | null;
  participantTwo: BracketParticipant | null;
  winner: BracketParticipant | null;
  completedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type EventDetail = {
  event: EventRecord;
  users: EventUserRecord[];
  teams: EventTeamRecord[];
  rounds: EventRoundRecord[];
};

export type CreateContestantPayload = {
  userIds: number[];
  teamName?: string;
  costume?: string;
  team: boolean;
};

export type CreateContestantResponse = {
  detail: EventDetail;
  team?: EventTeamRecord;
};

export type CreatePartyPayload = {
  label: string;
  date: string;
  html: string;
};

export type CreateEventPayload = {
  label: string;
  partyId?: number | null;
  startDate?: string;
  endDate?: string;
  type: EventType;
  description: string;
  metadata?: Record<string, unknown>;
};

export type UploadImageOptions = {
  partyId?: number | null;
  eventId?: number | null;
  teamId?: number | null;
  homepage?: boolean;
  notes?: string;
  userIds?: number[];
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

export type HTMLDraftPayload = {
  type: "homepage" | "party";
  instructions: string;
  existingHtml: string;
  imageUrls?: string[];
};

export type HTMLDraftResponse = {
  html: string;
};

export type AIImageUploadResponse = {
  imageUrl: string;
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

export function uploadAvatar(token: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);
  return apiFetch<AppUser>("/users/me/avatar", token, {
    method: "POST",
    body: formData,
  });
}

export function listImages(token: string) {
  return apiFetch<ImageRecord[] | null>("/images", token).then((images) => images ?? []);
}

export function listParties(token: string) {
  return apiFetch<PartyRecord[] | null>("/parties", token).then((parties) => parties ?? []);
}

export function createParty(token: string, payload: CreatePartyPayload) {
  return apiFetch<PartyRecord>("/parties", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateParty(token: string, id: number, payload: CreatePartyPayload) {
  return apiFetch<PartyRecord>(`/parties/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteParty(token: string, id: number) {
  return apiFetch<Record<string, never>>(`/parties/${id}`, token, {
    method: "DELETE",
  });
}

export function listEvents(token: string) {
  return apiFetch<EventRecord[] | null>("/events", token).then((events) => events ?? []);
}

export function createEvent(token: string, payload: CreateEventPayload) {
  return apiFetch<EventRecord>("/events", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteEvent(token: string, id: number) {
  return apiFetch<Record<string, never>>(`/events/${id}`, token, {
    method: "DELETE",
  });
}

export function startBracketEvent(token: string, id: number, participants: BracketParticipant[]) {
  return apiFetch<EventDetail>(`/events/${id}/bracket/start`, token, {
    method: "POST",
    body: JSON.stringify({ participants }),
  });
}

export function reportBracketWinner(token: string, id: number, roundId: number, winnerKey: string) {
  return apiFetch<EventDetail>(`/events/${id}/bracket/report`, token, {
    method: "POST",
    body: JSON.stringify({ roundId, winnerKey }),
  });
}

export function getEventDetail(token: string, id: number) {
  return apiFetch<EventDetail>(`/events/${id}`, token);
}

export function updateEventMetadata(token: string, id: number, metadata: Record<string, unknown>) {
  return apiFetch<EventRecord>(`/events/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ metadata }),
  });
}

export function startEvent(token: string, id: number) {
  return apiFetch<EventRecord>(`/events/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ startNow: true }),
  });
}

export function completeEvent(token: string, id: number) {
  return apiFetch<EventRecord>(`/events/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ completeNow: true }),
  });
}

export function createEventContestant(token: string, id: number, payload: CreateContestantPayload) {
  return apiFetch<CreateContestantResponse>(`/events/${id}/contestants`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteEventContestant(token: string, id: number, payload: { userIds: number[]; teamId?: number | null }) {
  return apiFetch<EventDetail>(`/events/${id}/contestants`, token, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export function submitEventVote(token: string, id: number, metadata: Record<string, unknown>) {
  return apiFetch<EventVoteRecord>(`/events/${id}/votes`, token, {
    method: "POST",
    body: JSON.stringify({ metadata }),
  });
}

export function listEventVotes(token: string, id: number) {
  return apiFetch<EventVoteRecord[] | null>(`/events/${id}/votes`, token).then((votes) => votes ?? []);
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

export function generateHTMLDraft(token: string, payload: HTMLDraftPayload) {
  return apiFetch<HTMLDraftResponse>("/ai/html-draft", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function uploadAIImage(token: string, file: File) {
  const formData = new FormData();
  formData.append("image", file);

  return apiFetch<AIImageUploadResponse>("/ai/images", token, {
    method: "POST",
    body: formData,
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
  if (options.eventId) {
    formData.append("eventId", String(options.eventId));
  }
  if (options.teamId) {
    formData.append("teamId", String(options.teamId));
  }
  if (options.homepage) {
    formData.append("homepage", "true");
  }
  if (options.notes) {
    formData.append("notes", options.notes);
  }
  if (options.userIds) {
    options.userIds.forEach((userId) => formData.append("userIds", String(userId)));
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

export function updateImageHomepage(token: string, id: number, homepage: boolean) {
  return apiFetch<ImageRecord>(`/images/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ homepage }),
  });
}

export function updateImageTags(token: string, id: number, userIds: number[]) {
  return apiFetch<ImageRecord>(`/images/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify({ userIds }),
  });
}

export function updateImageEventAssignment(token: string, id: number, payload: { eventId?: number; teamId?: number; userIds?: number[] }) {
  return apiFetch<ImageRecord>(`/images/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function sendHostEmail(token: string, payload: SendEmailPayload) {
  return apiFetch<SendEmailResponse>("/emails", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
