import SignupItemPicker from "./SignupItemPicker";

const addItemIconUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/add-item.png";

export type PartySignupDraftItem = {
  key: string;
  label: string;
  note: string;
};

type PartySignupDraftEditorProps = {
  items: PartySignupDraftItem[];
  onChange: (items: PartySignupDraftItem[]) => void;
};

export default function PartySignupDraftEditor({ items, onChange }: PartySignupDraftEditorProps) {
  const usedLabels = items.map((item) => item.label);

  const updateItem = (key: string, patch: Partial<PartySignupDraftItem>) => {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    onChange([
      ...items,
      {
        key: `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        note: "",
      },
    ]);
  };

  return (
    <div className="party-setup-signup">
      <p className="dashboard-copy">
        Add food or drinks guests can claim. You can skip this and let people add their own items later.
      </p>
      <div className="party-signup-table-wrap">
        <table className="party-signup-table" aria-label="Sign up sheet">
          <tbody>
            {items.map((item, index) => (
              <tr key={item.key}>
                <td className="party-signup-table-item">
                  <SignupItemPicker
                    value={item.label}
                    usedLabels={usedLabels}
                    autoOpen={!item.label && index === items.length - 1}
                    onChange={(label) => updateItem(item.key, { label })}
                  />
                </td>
                <td>
                  <input
                    value={item.note}
                    onChange={(event) => updateItem(item.key, { note: event.target.value })}
                    placeholder="Optional note"
                    maxLength={2000}
                    aria-label="Optional note"
                  />
                </td>
                <td className="party-signup-table-actions">
                  <button
                    className="auth-secondary table-action-button"
                    type="button"
                    onClick={() => onChange(items.filter((row) => row.key !== item.key))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            <tr className="party-signup-add-row">
              <td colSpan={3}>
                <button className="party-signup-add-button" type="button" onClick={addItem}>
                  <img src={addItemIconUrl} alt="" />
                  <span>Add item</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
