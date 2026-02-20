# Observability Verification — Sentry + RequestId

Verifies that:
- Sentry captures unhandled exceptions from the Spring Boot backend
- The `requestId` MDC value (set by `MdcRequestFilter`) appears on the Sentry event
- The `X-Request-Id` response header matches the Sentry event's `requestId` tag

---

## Prerequisites

- Sentry project configured with a valid DSN (`SENTRY_DSN` set in Render env vars)
- Access to the Sentry dashboard for the project
- A valid Supabase JWT for the staging environment (all endpoints require auth)

---

## Step 1 — Enable the test endpoint in staging

In Render (or your staging environment), set the following environment variable:

```
SENTRY_TEST_ENABLED=true
```

> **Security note:** This variable must only be set in staging/dev. Never set it in production.
> The `SentryTestController` bean is conditionally registered only when this flag is `true`
> (`@ConditionalOnProperty(name="sentry.test.enabled", havingValue="true", matchIfMissing=false)`).

Redeploy the service after adding the variable.

---

## Step 2 — Obtain a JWT

Sign in via the Supabase Auth REST API or the staging app frontend to get a valid JWT.
All backend endpoints require a Bearer token.

```bash
# Example: extract JWT from Supabase auth response
ACCESS_TOKEN="<paste your JWT here>"
```

---

## Step 3 — Trigger the test exception

```bash
curl -i \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  https://<your-staging-service>.onrender.com/api/sentry/test
```

Expected response:
```
HTTP/1.1 500 Internal Server Error
X-Request-Id: <uuid>
...
```

Note the value of the `X-Request-Id` response header — this is the `requestId` that should
appear on the Sentry event.

---

## Step 4 — Verify in Sentry dashboard

1. Open your Sentry project → **Issues**
2. Find the most recent event with message:
   `Sentry test exception — triggered manually for observability verification`
3. Open the event detail and check:
   - **Tags** or **Context** section contains `requestId` matching the value from `X-Request-Id`
   - **Stack trace** shows `SentryTestController.test()`
   - **Environment** matches your staging environment name (`RENDER_SERVICE_NAME`)

---

## Step 5 — Clean up

After verification, remove `SENTRY_TEST_ENABLED` from staging env vars (or set to `false`)
and redeploy to disable the endpoint.

---

## How it works

`MdcRequestFilter` (registered at `Ordered.HIGHEST_PRECEDENCE`) assigns a `requestId` UUID
to every request and stores it in `MDC` before the filter chain runs. Sentry's Spring Boot
integration automatically includes MDC values in captured events. The `X-Request-Id` response
header (also set by `MdcRequestFilter`) lets you correlate the HTTP response to the Sentry event.
