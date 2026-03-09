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

    public JwtConfig(IngestionApiKeyFilter ingestionApiKeyFilter) {
        this.ingestionApiKeyFilter = ingestionApiKeyFilter;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // CORS is handled by a standalone FilterRegistrationBean in CorsConfig (runs before this chain).
                // Do NOT add .cors() here — it would create a second CorsFilter causing duplicate headers.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Register ingestion API key filter before JWT validation so
                // BearerTokenAuthenticationFilter never runs on this path.
                .addFilterBefore(ingestionApiKeyFilter, BearerTokenAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        // Allow CORS preflight requests — BearerTokenAuthenticationFilter
                        // runs before CORS headers are evaluated, causing 401 on OPTIONS.
                        .requestMatchers(HttpMethod.OPTIONS).permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        // permitAll() here so Spring Security does not apply JWT validation;
                        // the actual auth check is enforced by IngestionApiKeyFilter.
                        .requestMatchers("/api/ingestion/ingest-posts").permitAll()
                        // Public read endpoint — no auth required for listing POIs.
                        .requestMatchers(HttpMethod.GET, "/api/listings/*/pois").permitAll()
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> {}));

        return http.build();
    }
}
