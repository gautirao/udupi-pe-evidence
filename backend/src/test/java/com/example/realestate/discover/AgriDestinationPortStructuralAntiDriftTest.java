package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.context.annotation.Primary;
import org.springframework.core.type.filter.AssignableTypeFilter;

import java.io.File;
import java.io.IOException;
import java.lang.annotation.Annotation;
import java.lang.reflect.GenericArrayType;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D3-T1 (#2151 PR B, AC15(a)) and D3-T2 (#2151 PR B, AC15(b)): plain-JUnit, Docker-free structural
 * contract tests for {@link AgriDestinationPort}. Nothing in this class requires a Spring context or
 * a database — every assertion here is a static classpath/reflection check, so it runs on any
 * runner, with or without Docker.
 *
 * <p><b>D3-T1 — adapter-agnostic shape (AC15(a)).</b> {@link #agriDestinationPort_isAdapterAgnostic()}
 * proves {@link AgriDestinationPort} is adapter-agnostic — no Postgres-only construct appears in any
 * port method signature or in any type reachable from one. Mirrors {@link
 * CityActivationStructuralAntiDriftTest}'s fail-closed shape: an empty allowlist so a future
 * exception is a visible diff, not a loosened regex.
 *
 * <p><b>What D3-T1 proves.</b> Starting from every {@link AgriDestinationPort} method, this test
 * walks the FULL reachable type graph — return types, parameter types, declared exception types,
 * and (recursively) every generic type argument and every record component — and asserts, for
 * every type encountered:
 * <ol>
 *   <li>no out-of-project type is in {@link #PACKAGE_DENYLIST} (JDBC/Postgres/Spring
 *       Data/JPA/Hibernate/PostGIS/Jackson/Spring MVC/OpenSearch/Elasticsearch);</li>
 *   <li>no annotation on a reachable type or record component is in that same denylist (catches
 *       {@code @Entity}/{@code @Column}/{@code @JsonInclude});</li>
 *   <li>every in-project reachable type is a {@code record} or an {@code enum} — no plain class,
 *       no mutable POJO;</li>
 *   <li>no {@code Object}, raw {@code List}, raw {@code Map}, or {@code Map<String,Object>}
 *       component;</li>
 *   <li>no SQL-smell name ({@code Sql}, {@code Query}, {@code Predicate}, {@code RowMapper},
 *       {@code ResultSet}, {@code Jdbc}, {@code Statement}) and no hard-denied FQN ({@code
 *       DiscoverListingPredicateBuilder$Sql}, {@code DiscoverListingPredicateBuilder$Filters}).</li>
 * </ol>
 * Plus two source-text checks: no file on this path (the interface + its Postgres adapter) contains
 * the literal {@code discover.opensearch.enabled}, and the adapter never imports {@code
 * GeoCoarsener} (anon coarsening belongs strictly above the port).
 *
 * <p><b>Sanity floor.</b> A refactor that accidentally empties the walk (e.g. a method whose
 * signature no longer references any of the port's value objects) must FAIL this test, not pass it
 * vacuously — {@link #agriDestinationPort_isAdapterAgnostic()} asserts at least 2 methods, at least
 * 9 reachable in-project types, and at least 25 walked components.
 *
 * <p><b>Proven able to fail.</b> Two deliberate violations were introduced and reverted while
 * authoring this test (see the PR B report for the exact command/exit-code/assertion-message
 * evidence for each): (a) COARSE — changing {@code findParcels} to return {@code
 * org.springframework.data.domain.Page<AgriParcel>} trips the package denylist; (b) FINE — adding a
 * {@code DiscoverListingPredicateBuilder.Sql} component to {@code ParcelQuery} trips BOTH the
 * record-component-must-not-leak-implementation-types check (via the hard-denied-FQN rule) and the
 * SQL-smell name heuristic. (a) alone would not demonstrate this design's real purpose — (b) is the
 * violation class this test exists to catch.
 *
 * <p><b>D3-T2 — production-bean-graph guard (AC15(b)), relocated here in the #2151 PR B correction
 * pass.</b> {@link #productionBeanGraph_exactlyOneAgriDestinationPortImplementation_noPrimary()}
 * scans every class under {@code com.example.realestate} (main + test compiled output — the same
 * classpath the real Spring Boot application boots from) for concrete classes assignable to {@link
 * AgriDestinationPort}, and asserts exactly ONE such class exists (with zero {@code @Primary}
 * annotations among them). This method previously lived in {@code AgriDestinationPortFlagFlipSafetyIT},
 * a {@code @DataJpaTest}+{@code @Testcontainers(disabledWithoutDocker = true)} class — meaning on any
 * runner without Docker, the ENTIRE class (this guard included) was silently skipped rather than run,
 * so AC15(b)'s headline structural guard reported nothing on such a runner. The assertion itself never
 * needed a database or a Spring context — {@link ClassPathScanningCandidateComponentProvider} +
 * {@link AssignableTypeFilter} are pure classpath/reflection tools — so it belongs in this plain-JUnit
 * class alongside D3-T1's own static structural walk, where it now runs unconditionally, Docker or
 * not. See this method's own javadoc for the deliberate-failure demonstration re-run in this new
 * location.
 */
class AgriDestinationPortStructuralAntiDriftTest {

    private static final List<String> PACKAGE_DENYLIST = List.of(
            "java.sql", "javax.sql", "org.postgresql", "org.springframework.jdbc",
            "org.springframework.data", "org.springframework.orm", "jakarta.persistence",
            "org.hibernate", "org.postgis", "org.locationtech", "com.fasterxml.jackson",
            "org.springframework.web", "org.opensearch", "org.elasticsearch"
    );

    /**
     * NOTE: "query" is deliberately NOT in this list — the pinned port interface itself names two
     * of its own value objects {@code ParcelQuery}/{@code DestinationScopeQuery} (legitimate
     * port-vocabulary "a request for X", not a SQL query object), so a bare "query" substring
     * would flag the port's own pinned types. "sql" and "predicate" DO catch the real leak this
     * heuristic exists for (e.g. {@code DiscoverListingPredicateBuilder.Sql}/{@code .Filters}).
     */
    private static final List<String> SQL_SMELL_NAME_FRAGMENTS = List.of(
            "sql", "predicate", "rowmapper", "resultset", "jdbc", "statement", "wherefragment"
    );

    private static final Set<String> HARD_DENIED_FQNS = Set.of(
            "com.example.realestate.discover.DiscoverListingPredicateBuilder$Sql",
            "com.example.realestate.discover.DiscoverListingPredicateBuilder$Filters"
    );

    /** Empty at merge — a future exception must appear here as a visible diff, not a loosened regex. */
    private record Allowance(String typeOrAnnotationFqn, String justification) {}

    private static final List<Allowance> ALLOWLIST = List.of();

    private static final String SRC_MAIN_JAVA = "src/main/java/";
    private static final String PORT_FILE = "com/example/realestate/discover/AgriDestinationPort.java";
    private static final String ADAPTER_FILE =
            "com/example/realestate/discover/AgriDestinationPortPostgresAdapter.java";
    private static final String BASE_PACKAGE = "com.example.realestate";

    /**
     * <b>Proven able to fail, in this new home (#2151 PR B correction pass, B4 relocation).</b> A
     * second, deliberately-added {@code AgriDestinationPort} implementation (a trivial concrete
     * class in this same package, returning empty results, with NO {@code @Component}/{@code
     * @Primary} annotation at all — the weakest, most-likely-to-slip-through case) was compiled
     * alongside the production adapter and this test re-run:
     * <pre>
     * command: mvn -o -q -f backend/pom.xml test -Dtest=AgriDestinationPortStructuralAntiDriftTest#productionBeanGraph_exactlyOneAgriDestinationPortImplementation_noPrimary
     * exit code: 1 (BUILD FAILURE — "There are test failures.")
     * actual assertion message:
     *   java.lang.AssertionError:
     *   [exactly ONE concrete class must implement AgriDestinationPort on the production
     *    classpath — a second implementation (e.g. a future OpenSearch adapter or routing port)
     *    reaching the classpath is exactly the AC15(b) regression this test exists to catch]
     *   Expected size: 1 but was: 2 in:
     *   [com.example.realestate.discover.AgriDestinationPortDeliberateSecondImplForB4Proof,
     *       com.example.realestate.discover.AgriDestinationPortPostgresAdapter]
     * </pre>
     * The deliberate second implementation was then deleted and this test re-run to confirm GREEN
     * (exit code 0) — see the #2151 PR B correction-pass report for that command/exit-code pair, and
     * for the separate demonstration that this test runs (and this deliberate-failure re-run above
     * executed) without Docker / without a Spring context being involved at all.
     */
    @Test
    @DisplayName("production bean graph: exactly ONE concrete class implements AgriDestinationPort, "
            + "and NONE of them is annotated @Primary")
    void productionBeanGraph_exactlyOneAgriDestinationPortImplementation_noPrimary() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AssignableTypeFilter(AgriDestinationPort.class));

        Set<BeanDefinition> candidates = scanner.findCandidateComponents(BASE_PACKAGE);

        List<Class<?>> implementations = new ArrayList<>();
        for (BeanDefinition candidate : candidates) {
            Class<?> clazz = Class.forName(candidate.getBeanClassName());
            // The scanner's default candidate filter already excludes interfaces/abstract types
            // (AgriDestinationPort itself never appears here), but the guard is kept explicit —
            // defence in depth against a future scanner-behaviour change silently including it.
            if (clazz.isInterface() || Modifier.isAbstract(clazz.getModifiers())) {
                continue;
            }
            implementations.add(clazz);
        }

        assertThat(implementations)
                .as("exactly ONE concrete class must implement AgriDestinationPort on the "
                        + "production classpath — a second implementation (e.g. a future "
                        + "OpenSearch adapter or routing port) reaching the classpath is exactly "
                        + "the AC15(b) regression this test exists to catch")
                .hasSize(1);
        assertThat(implementations.get(0)).isEqualTo(AgriDestinationPortPostgresAdapter.class);

        for (Class<?> implementation : implementations) {
            assertThat(implementation.isAnnotationPresent(Primary.class))
                    .as("no AgriDestinationPort implementation may be annotated @Primary — "
                            + "@Primary exists to silently resolve ambiguity between two "
                            + "candidate beans, and AC15(b) requires there be no ambiguity to "
                            + "resolve in the first place")
                    .isFalse();
        }
    }

    @Test
    void agriDestinationPort_isAdapterAgnostic() {
        List<String> violations = new ArrayList<>();
        Set<Class<?>> visitedInProject = new LinkedHashSet<>();
        Set<Class<?>> annotationChecked = new LinkedHashSet<>();
        Deque<Type> queue = new ArrayDeque<>();
        int methodCount = 0;
        int walkedComponentCount = 0;

        for (Method m : AgriDestinationPort.class.getDeclaredMethods()) {
            methodCount++;
            queue.add(m.getGenericReturnType());
            for (Type p : m.getGenericParameterTypes()) {
                queue.add(p);
            }
            for (Class<?> ex : m.getExceptionTypes()) {
                queue.add(ex);
            }
        }

        while (!queue.isEmpty()) {
            Type type = queue.poll();
            walkedComponentCount++;
            walk(type, visitedInProject, annotationChecked, queue, violations);
        }

        long inProjectCount = visitedInProject.stream()
                .filter(c -> c.getName().startsWith("com.example.realestate"))
                .count();

        // Violations are asserted FIRST, deliberately, ahead of the three sanity-floor checks
        // below (#2151 PR B correction pass, GAP 2). AssertJ's non-soft assertThat(...) throws on
        // the FIRST failing assertion, so a genuine violation (package-denylist / hard-denied-FQN /
        // SQL-smell / shape rule) must be reported before a floor check ever gets a chance to fire
        // and mask it. A run that observed this in practice: changing findParcels's return type
        // (rather than ADDING a component) shrank the reachable-type graph below the floor AT THE
        // SAME TIME it introduced a package-denylisted type — with the floor assertion ordered
        // first, the reported failure was "7L < 9L", not the actual denylist violation, which is
        // the wrong-reason-fails mode this suite exists to avoid. Ordering violations.isEmpty()
        // first means a genuine violation is ALWAYS visible in the failure message even when a
        // change happens to also shrink the graph; the floor checks below remain as a second,
        // independent line of defence against the walk vacuously emptying out with zero violations
        // recorded (e.g. a signature that no longer references any port value object at all).
        assertThat(violations)
                .as("AgriDestinationPort must be adapter-agnostic — no Postgres-only construct may "
                        + "appear in any method signature or in any reachable type. Violations "
                        + "found:%n%s", violations.isEmpty() ? "(none)" : String.join("\n", violations))
                .isEmpty();

        assertThat(methodCount)
                .as("sanity floor: AgriDestinationPort must declare at least 2 methods")
                .isGreaterThanOrEqualTo(2);
        assertThat(inProjectCount)
                .as("sanity floor: at least 9 in-project types must be reachable from the port — "
                        + "a value this low means the walk emptied out (e.g. a signature no longer "
                        + "references the port's own value objects), which must FAIL, not pass "
                        + "vacuously")
                .isGreaterThanOrEqualTo(9);
        assertThat(walkedComponentCount)
                .as("sanity floor: at least 25 components must be walked")
                .isGreaterThanOrEqualTo(25);
    }

    @Test
    void noSourceFileOnThisPathReadsTheOpenSearchFlag() throws IOException {
        String portSource = Files.readString(new File(srcMainJava(), PORT_FILE).toPath());
        String adapterSource = Files.readString(new File(srcMainJava(), ADAPTER_FILE).toPath());

        assertThat(portSource)
                .as("AgriDestinationPort must never read discover.opensearch.enabled — the "
                        + "insulation from a future OpenSearch cutover is structural (one bean, "
                        + "zero flag readers), not behavioural")
                .doesNotContain("discover.opensearch.enabled");
        assertThat(adapterSource)
                .as("AgriDestinationPortPostgresAdapter must never read discover.opensearch.enabled")
                .doesNotContain("discover.opensearch.enabled");
    }

    @Test
    void agriAdapterDoesNotImportGeoCoarsener() throws IOException {
        String adapterSource = Files.readString(new File(srcMainJava(), ADAPTER_FILE).toPath());

        assertThat(adapterSource)
                .as("Anon coordinate coarsening is applied ABOVE the port "
                        + "(DiscoverAgriMapListingsService) — the Postgres adapter must never "
                        + "import GeoCoarsener, or exposure policy would be decided in two places")
                .doesNotContain("GeoCoarsener");
    }

    // ── Walk ─────────────────────────────────────────────────────────────────────────────────────

    private void walk(Type type, Set<Class<?>> visitedInProject, Set<Class<?>> annotationChecked,
                       Deque<Type> queue, List<String> violations) {
        Class<?> raw = rawClass(type);
        if (raw == null || raw.isPrimitive() || raw == void.class || raw == Void.class) {
            return;
        }

        String fqn = raw.getName();

        if (HARD_DENIED_FQNS.contains(fqn) && !allowlisted(fqn)) {
            violations.add("HARD-DENIED type reachable from port: " + fqn);
            return;
        }

        boolean isOutOfProject = !fqn.startsWith("com.example.realestate");
        boolean isJdk = fqn.startsWith("java.") || fqn.startsWith("javax.");
        // #2151 PR B correction pass (GAP 2): deliberately NOT gated on `!isJdk` — PACKAGE_DENYLIST
        // includes "java.sql"/"javax.sql" specifically to catch a leaked JDBC type such as
        // java.sql.Timestamp/java.sql.ResultSet. Gating this on !isJdk made those two denylist
        // entries dead code: every java.*/javax.* type would short-circuit into the isJdk branch
        // below (checkJdkShapeRules, which only checks Object/raw List/raw Map) BEFORE the
        // denylist could ever be consulted, and the in-project-only SQL-smell name heuristic never
        // runs for out-of-project types either — so a reachable java.sql.Timestamp would have
        // passed this test silently. Any other java.*/javax.* type not in PACKAGE_DENYLIST is
        // unaffected: deniedPackage stays false for it exactly as before.
        boolean deniedPackage = PACKAGE_DENYLIST.stream().anyMatch(fqn::startsWith);

        // (1) out-of-project types are checked against the denylist FIRST, before any other rule.
        if (isOutOfProject) {
            if (deniedPackage && !allowlisted(fqn)) {
                violations.add("Package-denylisted type reachable from port: " + fqn);
                return; // do not recurse into a denied type's internals
            }
            if (isJdk) {
                checkJdkShapeRules(type, raw, violations);
                if (type instanceof ParameterizedType pt) {
                    for (Type arg : pt.getActualTypeArguments()) {
                        queue.add(arg);
                    }
                }
                return; // terminate at JDK types (per D3-T1 spec)
            }
            // Non-JDK, non-denylisted, out-of-project type (e.g. a third-party allowed utility) —
            // do not recurse further; nothing in this port currently reaches such a type.
            return;
        }

        // (2) in-project type
        if (!annotationChecked.contains(raw)) {
            annotationChecked.add(raw);
            checkAnnotations(raw, violations);
        }
        if (visitedInProject.contains(raw)) {
            return;
        }
        visitedInProject.add(raw);

        String simpleNameLower = raw.getSimpleName().toLowerCase();
        if (!allowlisted(fqn)) {
            for (String smell : SQL_SMELL_NAME_FRAGMENTS) {
                if (simpleNameLower.contains(smell)) {
                    violations.add("SQL-smell name reachable from port: " + fqn);
                    break;
                }
            }
            if (!raw.isRecord() && !raw.isEnum()) {
                violations.add("Reachable in-project type is neither record nor enum: " + fqn);
            }
        }

        if (raw.isRecord()) {
            for (RecordComponent rc : raw.getRecordComponents()) {
                Type ct = rc.getGenericType();
                Class<?> craw = rawClass(ct);
                if (craw == Object.class) {
                    violations.add("Object-typed record component: " + fqn + "#" + rc.getName());
                } else if (craw == List.class && !(ct instanceof ParameterizedType)) {
                    violations.add("raw List record component: " + fqn + "#" + rc.getName());
                } else if (craw == Map.class) {
                    if (!(ct instanceof ParameterizedType pt2)) {
                        violations.add("raw Map record component: " + fqn + "#" + rc.getName());
                    } else {
                        Type[] args = pt2.getActualTypeArguments();
                        if (args.length == 2 && rawClass(args[0]) == String.class
                                && rawClass(args[1]) == Object.class) {
                            violations.add(
                                    "Map<String,Object> record component: " + fqn + "#" + rc.getName());
                        }
                    }
                }
                for (Annotation a : rc.getAnnotations()) {
                    String an = a.annotationType().getName();
                    if (PACKAGE_DENYLIST.stream().anyMatch(an::startsWith) && !allowlisted(an)) {
                        violations.add("Denylisted annotation " + an + " on " + fqn + "#" + rc.getName());
                    }
                }
                queue.add(ct);
            }
        }
    }

    private void checkJdkShapeRules(Type type, Class<?> raw, List<String> violations) {
        if (raw == Object.class) {
            violations.add("java.lang.Object component reachable from port");
            return;
        }
        if ((raw == List.class || raw == Map.class) && !(type instanceof ParameterizedType)) {
            violations.add("raw " + raw.getSimpleName() + " reachable from port (must be parameterized)");
        }
        if (raw == Map.class && type instanceof ParameterizedType pt) {
            Type[] args = pt.getActualTypeArguments();
            if (args.length == 2 && rawClass(args[0]) == String.class && rawClass(args[1]) == Object.class) {
                violations.add("Map<String,Object> reachable from port");
            }
        }
    }

    private void checkAnnotations(Class<?> c, List<String> violations) {
        for (Annotation a : c.getAnnotations()) {
            String an = a.annotationType().getName();
            if (PACKAGE_DENYLIST.stream().anyMatch(an::startsWith) && !allowlisted(an)) {
                violations.add("Denylisted annotation " + an + " on " + c.getName());
            }
        }
    }

    private static boolean allowlisted(String fqn) {
        return ALLOWLIST.stream().anyMatch(a -> a.typeOrAnnotationFqn().equals(fqn));
    }

    private static Class<?> rawClass(Type type) {
        if (type instanceof Class<?> c) {
            return c;
        }
        if (type instanceof ParameterizedType pt) {
            return rawClass(pt.getRawType());
        }
        if (type instanceof GenericArrayType gat) {
            return rawClass(gat.getGenericComponentType());
        }
        return null;
    }

    private static File srcMainJava() {
        File dir = new File(System.getProperty("user.dir"));
        for (int i = 0; i < 6 && dir != null; i++) {
            File candidate = new File(dir, SRC_MAIN_JAVA);
            if (candidate.isDirectory()) {
                return candidate;
            }
            dir = dir.getParentFile();
        }
        throw new IllegalStateException(
                "Could not locate " + SRC_MAIN_JAVA + " by walking up from " + System.getProperty("user.dir"));
    }
}
