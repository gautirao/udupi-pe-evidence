package com.example.realestate.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.web.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class JwtConfig {

    private final IngestionApiKeyFilter ingestionApiKeyFilter;
    private final PrometheusApiKeyFilter prometheusApiKeyFilter;

    public JwtConfig(IngestionApiKeyFilter ingestionApiKeyFilter,
                     PrometheusApiKeyFilter prometheusApiKeyFilter) {
        this.ingestionApiKeyFilter = ingestionApiKeyFilter;
        this.prometheusApiKeyFilter = prometheusApiKeyFilter;
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
                .addFilterBefore(prometheusApiKeyFilter, BearerTokenAuthenticationFilter.class)
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
                        // Public discover areas endpoint — no auth required (B-4)
                        .requestMatchers(HttpMethod.GET, "/api/discover/areas").permitAll()
                        // Public area listings endpoint — no auth required (C-2)
                        .requestMatchers(HttpMethod.GET, "/api/discover/areas/*/listings").permitAll()
                        // Public city-first area listings endpoint — no auth required (#886)
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/listings").permitAll()
                        // Public school-radius listings endpoint — no auth required (#1239)
                        .requestMatchers(HttpMethod.GET, "/api/discover/cities/*/school-radius-listings").permitAll()
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
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}));

        return http.build();
    }
}
