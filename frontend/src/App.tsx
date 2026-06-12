import { useEffect, useState } from "react";

type MessageResponse = {
  message: string;
};

export default function App() {
  const [message, setMessage] = useState("");
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
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <p className="eyebrow">Jacob &amp; Kirsten&apos;s House Party</p>
        <h1 className="title">The JK House</h1>
        <div className="divider" aria-hidden="true">
          <span className="divider-gem">♦</span>
        </div>
        <p className="tagline">Welcome to the House of JK</p>

        {error ? (
          <p className="message error">{error}</p>
        ) : message ? (
          <p className="message">{message}</p>
        ) : null}
      </section>
    </main>
  );
}
