import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  environment: import.meta.env.MODE,
  sendDefaultPii: false,   // MANDATORY — no user email, IP, or auth headers
  tracesSampleRate: 0,     // no performance tracing (free-tier safe)
});

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please refresh the page.</p>}>
    <App />
  </Sentry.ErrorBoundary>
);
