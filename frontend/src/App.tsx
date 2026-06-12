import { useEffect, useState } from "react";

type MessageResponse = {
  message: string;
};

export default function App() {
  const [message, setMessage] = useState("Loading...");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/message")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return response.json() as Promise<MessageResponse>;
      })
      .then((data) => setMessage(data.message))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">Jacob &amp; Kirsten&apos;s House Party</p>
        <h1>The JK House</h1>
        {error ? <p className="error">{error}</p> : <p className="message">{message}</p>}
      </section>
    </main>
  );
}
