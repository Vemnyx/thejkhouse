import { Link } from "react-router-dom";

export default function EventPage() {
  return (
    <main className="page app-shell-page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card app-shell-card event-detail-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>
        <Link className="auth-secondary event-detail-back" to="/events">
          Back to Events
        </Link>
        <div className="under-construction">
          <p>No Event Data Yet</p>
        </div>
      </section>
    </main>
  );
}
