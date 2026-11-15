"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Arial, Helvetica, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "1.5rem", textAlign: "center" }}>
          <div>
            <p style={{ color: "#dc2626", fontWeight: 700 }}>500</p>
            <h1>Something went wrong</h1>
            <p style={{ color: "#64748b" }}>We could not load Parallax. Please try again.</p>
            <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
              <button onClick={reset} style={{ cursor: "pointer", border: 0, borderRadius: "0.5rem", background: "#4f46e5", color: "white", padding: "0.625rem 1rem", fontWeight: 600 }}>
                Try again
              </button>
              <a href="/dashboard/bookings" style={{ border: "1px solid #e2e8f0", borderRadius: "0.5rem", background: "white", color: "#334155", padding: "0.625rem 1rem", fontWeight: 600, textDecoration: "none" }}>
                Back to dashboard
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
