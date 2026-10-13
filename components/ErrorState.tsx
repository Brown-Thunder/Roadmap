// Branded full-page error state, shown if Airtable can't be reached. Keeps a
// shared link looking intentional rather than broken.
export default function ErrorState({ error }: { error: string }) {
  return (
    <div className="page">
      <div className="error-card">
        <div className="brand-lockup" style={{ marginBottom: 18 }}>
          <img src="/brand/stasher-logo-icon-blue.svg" alt="Stasher" width={32} height={29} />
          <div className="brand-titles">
            <span className="brand-product">Pulse</span>
          </div>
        </div>
        <h2 className="error-title">We couldn’t load the board</h2>
        <p className="error-msg">
          There was a problem reaching Airtable. This is usually temporary — please refresh in a moment.
        </p>
        <details className="error-details">
          <summary>Technical details</summary>
          <code>{error}</code>
        </details>
      </div>
    </div>
  );
}
