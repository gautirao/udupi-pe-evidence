# Local code quality & coverage (SonarQube)

Local, no-cost SonarQube analysis for this repo — backend (Java/JaCoCo) and
frontend (TypeScript/Vitest) coverage feed into a single dashboard. No cloud
Sonar account or paid service is required.

## 1. Start SonarQube locally

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:community
```

Wait for it to come up, then open http://localhost:9000 (default login
`admin` / `admin`, you'll be forced to change the password on first login).

## 2. Generate a token

In SonarQube: **My Account → Security → Generate Tokens**. Copy the token —
it's shown only once.

```bash
export SONAR_TOKEN=<token-from-local-sonarqube>
```

Do not commit this token anywhere. It is only ever passed as an environment
variable.

## 3. Backend coverage (JaCoCo)

This repo has no Maven wrapper — use the system `mvn` (Maven 3.9+, Java 21):

```bash
mvn -f backend/pom.xml clean test
```

`backend/pom.xml` binds `org.jacoco:jacoco-maven-plugin` (`prepare-agent` +
`report`, bound to the `test` phase), so a plain `mvn -f backend/pom.xml test`
now produces:

```text
backend/target/site/jacoco/index.html   # human-readable report
backend/target/site/jacoco/jacoco.xml   # machine report Sonar reads
```

Existing Maven profiles (`broker-focus-it`, `failsafe-it`, `demand-signal-it`,
`broker-demand-gap-it`, `within-polygon-srid-it`) are untouched — JaCoCo only
adds instrumentation to whichever tests actually run under the active
profile.

## 4. Frontend coverage (Vitest + V8)

The frontend lives at the repo root (`src/`, not `frontend/`). Coverage uses
`@vitest/coverage-v8`, already added to `devDependencies`, and
`vitest.config.ts` has a `test.coverage` block (`provider: "v8"`, reporters
`text`/`html`/`lcov`).

```bash
npm test -- --coverage
```

Produces:

```text
coverage/index.html   # human-readable report
coverage/lcov.info     # machine report Sonar reads
```

`coverage/` is already gitignored.

## 5. Run the local Sonar scan

```bash
export SONAR_TOKEN=<token-from-local-sonarqube>
./scripts/quality/run-local-sonar.sh
```

This runs backend tests, frontend tests with coverage, then scans the repo
via the `sonarsource/sonar-scanner-cli` Docker image using
`sonar-project.properties` at the repo root. On a Mac, `SONAR_HOST_URL`
defaults to `http://host.docker.internal:9000` so the containerized scanner
can reach the SonarQube container/process on the host.

## 6. View the dashboard

http://localhost:9000/dashboard?id=udupi-property-explorer

## `sonar-project.properties`

Key paths, matching the actual repo layout (frontend at root, backend under
`backend/`):

- `sonar.sources=backend/src/main,src,tests`
- `sonar.tests=backend/src/test` (frontend tests are colocated inside
  `sonar.sources` and picked up via `sonar.test.inclusions` patterns —
  `**/*.test.tsx`, `**/*.spec.ts`, etc. — not a separate `sonar.tests` entry)
- `sonar.coverage.jacoco.xmlReportPaths=backend/target/site/jacoco/jacoco.xml`
- `sonar.javascript.lcov.reportPaths` / `sonar.typescript.lcov.reportPaths` →
  `coverage/lcov.info`

## Troubleshooting

**`No plugin found for prefix 'jacoco'`**
JaCoCo wasn't declared in `backend/pom.xml` at all, so a bare
`mvnw jacoco:report` had nothing to resolve. Fixed by adding the
`org.jacoco:jacoco-maven-plugin` plugin block with `prepare-agent` + `report`
executions — a plain `./mvnw test` now produces the report automatically.

**Scanner can't connect to SonarQube**
Check the container/process is up (`docker ps` / http://localhost:9000).
From inside the scanner container on Mac, `localhost` refers to the
container itself, not the host — use `host.docker.internal` (already the
default in the helper script). On Linux, `host.docker.internal` isn't
available by default; either run the scanner with
`--add-host=host.docker.internal:host-gateway` or set
`SONAR_HOST_URL=http://172.17.0.1:9000` (the Docker bridge gateway IP).

**Missing `jacoco.xml`**
Confirm `backend/pom.xml` has the JaCoCo plugin bound to the `test` phase and
that `mvn -f backend/pom.xml clean test` actually ran (not skipped via
`-DskipTests`).

**Missing `lcov.info`**
Confirm `@vitest/coverage-v8` is installed (`npm ls @vitest/coverage-v8`) and
run with `npm test -- --coverage`, not plain `npm test`.

**Docker `localhost` vs `host.docker.internal`**
The scanner runs inside a container; it cannot reach a SonarQube instance
bound to the host's `localhost` unless you pass `host.docker.internal`
(Mac/Windows) or the bridge gateway IP (Linux). `SONAR_HOST_URL` in the
helper script is overridable via env var if your setup differs.
