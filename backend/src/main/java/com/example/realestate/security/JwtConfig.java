package com.example.realestate.security;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class JwtConfig {

    private final IngestionApiKeyFilter ingestionApiKeyFilter;
    private final PrometheusApiKeyFilter prometheusApiKeyFilter;
    private final ObjectProvider<DiscoverRateLimitFilter> discoverRateLimitFilterProvider;
    private final ObjectProvider<TrendsRateLimitFilter> trendsRateLimitFilterProvider;
    private final DbRoleJwtAuthenticationConverter dbRoleJwtAuthenticationConverter;

    public JwtConfig(IngestionApiKeyFilter ingestionApiKeyFilter,
                     PrometheusApiKeyFilter prometheusApiKeyFilter,
                     ObjectProvider<DiscoverRateLimitFilter> discoverRateLimitFilterProvider,
                     ObjectProvider<TrendsRateLimitFilter> trendsRateLimitFilterProvider,
                     DbRoleJwtAuthenticationConverter dbRoleJwtAuthenticationConverter) {
        this.ingestionApiKeyFilter = ingestionApiKeyFilter;
        this.prometheusApiKeyFilter = prometheusApiKeyFilter;
        this.discoverRateLimitFilterProvider = discoverRateLimitFilterProvider;
        this.trendsRateLimitFilterProvider = trendsRateLimitFilterProvider;
        this.dbRoleJwtAuthenticationConverter = dbRoleJwtAuthenticationConverter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // CORS is handled by a standalone FilterRegistrationBean in CorsConfig (runs before this chain).
                // Do NOT add .cors() here — it would create a second CorsFilter causing duplicate headers.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Register API key filters before JWT validation so
                // BearerTokenAuthenticationFilter never runs on these paths.
                .addFilterBefore(ingestionApiKeyFilter, BearerTokenAuthenticationFilter.class)
                .addFilterBefore(prometheusApiKeyFilter, BearerTokenAuthenticationFilter.class);

        // Public discover GET rate limit guard (#1671) — runs before JWT validation so it also
        // covers permitAll GET paths below. DiscoverRateLimitFilter self-excludes the two
        // authenticated discover GETs (/api/discover/markers, /api/discover/listings) — keep that
        // exclusion list paired with the permitAll matchers below.
        //
        // Resolved via ObjectProvider (optional) rather than a required constructor dependency so
        // pre-existing sliced security tests that @Import(JwtConfig.class) without also importing
        // DiscoverRateLimitFilter keep loading their (smaller, unrelated) contexts unchanged. In
        // every real application context the filter is always present (@Component, no conditions),
        // so production wiring is unaffected.
        DiscoverRateLimitFilter discoverRateLimitFilter = discoverRateLimitFilterProvider.getIfAvailable();
        if (discoverRateLimitFilter != null) {
            http.addFilterBefore(discoverRateLimitFilter, BearerTokenAuthenticationFilter.class);
        }

        // Public trends GET rate limit guard (#1612) — runs before JWT validation so it also
        // covers the fully-anonymous permitAll GET paths below (/api/trends/**). Unlike
        // DiscoverRateLimitFilter, there is no authenticated sub-path to exclude — every trends
        // GET is permitAll(). Resolved via ObjectProvider (optional) for the same sliced-test
        // context-loading reason documented on discoverRateLimitFilterProvider above.
        TrendsRateLimitFilter trendsRateLimitFilter = trendsRateLimitFilterProvider.getIfAvailable();
        if (trendsRateLimitFilter != null) {
            http.addFilterBefore(trendsRateLimitFilter, BearerTokenAuthenticationFilter.class);
        }

        http
                .authorizeHttpRequests(auth -> auth
                        // Allow CORS preflight requests — BearerTokenAuthenticationFilter
                        // runs before CORS headers are evaluated, causing 401 on OPTIONS.
                        .requestMatchers(HttpMethod.OPTIONS).permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // Prometheus metrics endpoint — auth enforced by PrometheusApiKeyFilter (#1249)
                        .requestMatchers("/actuator/prometheus").permitAll()
                        // permitAll() here so Spring Security does not apply JWT validation;
                        // the actual auth check is enforced by IngestionApiKeyFilter.
                        .requestMatchers("/api/ingestion/ingest-posts").permitAll()
                        // Public listing endpoints — no auth required (RE-104)
                        .requestMatchers(HttpMethod.GET, "/api/public/listings/**").permitAll()
                        // Public school search endpoints — no auth required (#407)
                        .requestMatchers(HttpMethod.GET, "/api/public/schools/**").permitAll()
                        // Public area overview endpoint — no auth required (#729)
                        .requestMatchers(HttpMethod.GET, "/api/public/areas/*/overview").permitAll()
                        // Public trending areas endpoint — no auth required (#747)
                        .requestMatchers(HttpMethod.GET, "/api/public/areas/trending").permitAll()
                        // Public trust badge endpoint — no auth required (RE-151)
                        .requestMatchers(HttpMethod.GET, "/api/listings/*/trust").permitAll()
                        // Public POI listing endpoint — no auth required (#907)
                        .requestMatchers(HttpMethod.GET, "/api/listings/*/pois").permitAll()
                        // Public discover GET family below is anti-abuse rate-limited by
                        // DiscoverRateLimitFilter (#1671). NOTE: /api/discover/markers and
                        // /api/discover/listings are intentionally NOT in this permitAll list —
                        // they fall through to anyRequest().authenticated() below, and
                        // DiscoverRateLimitFilter self-excludes those same two paths. Keep both
                        // lists in sync if a discover GET's auth requirement ever changes.
                        //
                        // Public discover areas endpoint — no auth required (B-4)
                        .requestMatchers(HttpMethod.GET, "/api/discover/areas").permitAll()
                        // Public area listings endpoint — no auth required (C-2)
                        .requestMatchers(HttpMethod.GET, "/api/discover/areas/*/listings").permitAll()
                        // Public city-first area listings endpoint — no auth required (#886)
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/listings").permitAll()
                        // Public school-radius listings endpoint — no auth required (#1239)
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/school-radius-listings").permitAll()
                        // Public region-summary endpoint — no auth required (#1882)
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/regions").permitAll()
                        // Public navigation-hierarchy structural + counts endpoints — no auth
                        // required (#1955 Areas PR A, SLICE 2e, AC8/AC8b).
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/navigation/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/navigation/*/counts").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/areas/*/navigation-path").permitAll()
                        // Public region-scoped area groups endpoint — no auth required (#1910)
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/regions/*/groups").permitAll()
                        // Public area groups endpoint — no auth required (#988)
                        .requestMatchers(HttpMethod.GET, "/api/discover/area-groups").permitAll()
                        // Public regional area groups endpoint — no auth required (#1408)
                        .requestMatchers(HttpMethod.GET, "/api/discover/regional-area-groups").permitAll()
                        // Public agri map listings endpoint — no auth required (#1410)
                        .requestMatchers(HttpMethod.GET, "/api/discover/agri-map-listings").permitAll()
                        // Anonymous discover_event telemetry ingest — no auth required (#1531)
                        // PII-free; session_id is client-generated, never linked to auth.users.
                        .requestMatchers(HttpMethod.POST, "/api/discover/events").permitAll()
                        // Public Trends endpoints — no auth required (#771)
                        .requestMatchers(HttpMethod.GET, "/api/trends/**").permitAll()
                        // Public discover summary endpoint — no auth required (#1745 P5)
                        .requestMatchers(HttpMethod.GET, "/api/discover/summary").permitAll()
                        .anyRequest().authenticated()
                )
                // Wire DbRoleJwtAuthenticationConverter to perform the user_roles DB lookup per
                // request and populate ROLE_* GrantedAuthorities on the JwtAuthenticationToken.
                // CallerInfoResolver reads from those authorities — zero additional DB lookups.
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt ->
                        jwt.jwtAuthenticationConverter(dbRoleJwtAuthenticationConverter)));

        return http.build();
    }
}
