import { LOGO_URL } from "../config";

export default function HomePage() {
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

        <img className="logo" src={LOGO_URL} alt="The JK House" width={512} height={512} />
        <p className="eyebrow">Jacob &amp; Kirsten&apos;s House Party</p>
        <h1 className="title">The JK House</h1>
        <div className="divider" aria-hidden="true">
          <span className="divider-gem">♦</span>
        </div>
        <p className="tagline">Welcome to the House of JK</p>
        <p className="coming-soon">Coming Soon</p>
      </section>
    </main>
  );
}
