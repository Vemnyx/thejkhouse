import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  AppUser,
  PartyRecord,
  PartySignupItemRecord,
  createPartySignupItem,
  deletePartySignupItem,
  listPartySignupItems,
  updatePartySignupItem,
} from "../lib/api";
import SignupItemPicker from "./SignupItemPicker";

const addItemIconUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/add-item.png";

type PartySignupModalProps = {
  party: PartyRecord;
  users: AppUser[];
  hostEdit?: boolean;
  onClose: () => void;
};

export default function PartySignupModal({ party, users, hostEdit = false, onClose }: PartySignupModalProps) {
  const { appUser, firebaseUser } = useAuth();
  const [items, setItems] = useState<PartySignupItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [openPickerId, setOpenPickerId] = useState<number | null>(null);

  const usersById = useMemo(() => {
    const map = new Map<number, AppUser>();
    for (const user of users) {
      map.set(user.id, user);
    }
    return map;
  }, [users]);

  const usedLabels = useMemo(() => items.map((item) => item.label), [items]);

  const applyItems = (nextItems: PartySignupItemRecord[]) => {
    setItems(nextItems);
    setNoteDrafts(Object.fromEntries(nextItems.map((item) => [item.id, item.note])));
  };

  useEffect(() => {
    let cancelled = false;

    async function loadItems() {
      if (!firebaseUser) {
        setError("You need to be signed in to view the sign up sheet.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const token = await firebaseUser.getIdToken();
        const nextItems = await listPartySignupItems(token, party.id);
        if (!cancelled) {
          applyItems(nextItems);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load sign up sheet");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadItems();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, party.id]);

  const closeModal = () => {
    if (saving || loading) {
      return;
    }
    onClose();
  };

  const replaceItem = (updated: PartySignupItemRecord) => {
    const nextItems = items.map((item) => (item.id === updated.id ? updated : item));
    applyItems(nextItems);
  };

  const handleAddItem = async () => {
    if (!firebaseUser || saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const created = await createPartySignupItem(token, party.id, hostEdit ? { hostCreated: true } : {});
      applyItems([...items, created]);
      setOpenPickerId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add item");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectLabel = async (item: PartySignupItemRecord, label: string) => {
    if (!firebaseUser || saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await updatePartySignupItem(token, party.id, item.id, { label });
      replaceItem(updated);
      setOpenPickerId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const handleClaim = async (item: PartySignupItemRecord) => {
    if (!firebaseUser || saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await updatePartySignupItem(token, party.id, item.id, { claim: true });
      replaceItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to claim item");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async (item: PartySignupItemRecord) => {
    if (!firebaseUser || saving) {
      return;
    }
    const nextNote = (noteDrafts[item.id] ?? "").trim();
    if (nextNote === item.note.trim()) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await updatePartySignupItem(token, party.id, item.id, { note: nextNote });
      replaceItem(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save note");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (item: PartySignupItemRecord) => {
    if (!firebaseUser || saving) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      await deletePartySignupItem(token, party.id, item.id);
      applyItems(items.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to remove item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
      <section
        className="upload-modal gothic-card party-signup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="party-signup-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="host-section-title" id="party-signup-title">
            {hostEdit ? "Edit Sign Up Sheet" : "Sign Up Sheet"}
          </h2>
          <button className="modal-close" type="button" onClick={closeModal} aria-label="Close sign up sheet">
            x
          </button>
        </div>
        <p className="party-signup-intro">
          Claim an item we need for this party, or add something you just want to bring
        </p>

        {loading ? <p className="dashboard-copy">Loading sign up sheet...</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {!loading ? (
          <div className="party-signup-table-wrap">
            <table className="party-signup-table" aria-label="Sign up sheet">
              <tbody>
                {items.map((item) => {
                  const linkedUser =
                    item.userId != null
                      ? usersById.get(item.userId) ?? (appUser?.id === item.userId ? appUser : null)
                      : null;
                  const isOwnRow = Boolean(appUser && item.userId === appUser.id);
                  const unclaimed = item.userId == null;
                  const canEditItem = (isOwnRow && !item.hostCreated) || (hostEdit && item.hostCreated && unclaimed);
                  const canEditNote = isOwnRow || (hostEdit && (unclaimed || item.hostCreated));
                  const canRemove = (isOwnRow && !item.hostCreated) || (hostEdit && item.hostCreated);

                  return (
                    <tr key={item.id}>
                      <td className="party-signup-table-person">
                        {unclaimed ? (
                          hostEdit ? (
                            <span className="party-signup-unclaimed">Unclaimed</span>
                          ) : (
                            <button
                              className="auth-submit party-signup-claim-button"
                              type="button"
                              onClick={() => void handleClaim(item)}
                              disabled={saving}
                            >
                              Claim Me
                            </button>
                          )
                        ) : (
                          <SignupPersonCell user={linkedUser} fallbackName="Guest" />
                        )}
                      </td>
                      <td>
                        {canEditItem ? (
                          <SignupItemPicker
                            value={item.label}
                            usedLabels={usedLabels}
                            autoOpen={openPickerId === item.id}
                            onChange={(label) => void handleSelectLabel(item, label)}
                          />
                        ) : (
                          <span className="party-signup-item-locked">{item.label || "—"}</span>
                        )}
                      </td>
                      <td>
                        {canEditNote ? (
                          <input
                            value={noteDrafts[item.id] ?? item.note}
                            onChange={(event) =>
                              setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                            }
                            onBlur={() => void handleSaveNote(item)}
                            placeholder="Optional note"
                            maxLength={2000}
                            disabled={saving}
                            aria-label="Optional note"
                          />
                        ) : (
                          <span className="party-signup-note-readonly">{item.note || "—"}</span>
                        )}
                      </td>
                      <td className="party-signup-table-actions">
                        {canRemove ? (
                          <button
                            className="auth-secondary table-action-button"
                            type="button"
                            onClick={() => void handleRemove(item)}
                            disabled={saving}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                <tr className="party-signup-add-row">
                  <td colSpan={4}>
                    <button
                      className="party-signup-add-button"
                      type="button"
                      onClick={() => void handleAddItem()}
                      disabled={saving}
                      aria-label="Add item"
                    >
                      <img src={addItemIconUrl} alt="" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function SignupPersonCell({ user, fallbackName }: { user: AppUser | null; fallbackName: string }) {
  const firstName = (user?.firstName || "").trim();
  const lastName = (user?.lastName || "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ") || user?.email || fallbackName;
  const initial = (firstName || name).charAt(0).toUpperCase() || "?";
  const colorId = user?.id ?? 0;

  return (
    <div className="party-signup-person">
      {user?.avatarUrl ? (
        <img className="party-attendee-avatar party-signup-avatar" src={user.avatarUrl} alt="" />
      ) : (
        <span
          className="party-attendee-avatar party-attendee-avatar-fallback party-signup-avatar"
          style={{ backgroundColor: avatarColorFromUserId(colorId) }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      <span>{name}</span>
    </div>
  );
}

function avatarColorFromUserId(userId: number): string {
  let n = userId | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = (n ^ (n >>> 16)) >>> 0;

  const r = 72 + (n & 0x7f);
  const g = 72 + ((n >>> 8) & 0x7f);
  const b = 72 + ((n >>> 16) & 0x7f);

  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
