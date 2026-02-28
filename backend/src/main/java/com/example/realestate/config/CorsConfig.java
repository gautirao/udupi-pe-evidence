package com.example.realestate.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.List;

/**
 * CORS configuration for API endpoints.
 * Restricts cross-origin requests to explicitly allowed origins only.
 *
 * Addresses SEC-2: No CORS Configuration vulnerability from Code Review Sprint.
 */
@Configuration
public class CorsConfig {

    @Value("${cors.allowed-origins:http://localhost:5173,http://localhost:3000}")
    private List<String> allowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();

        // --- Ingestion endpoint: open to any origin (API-key authenticated, no cookies) ---
        // Called from the Chrome extension popup (chrome-extension:// origin) or any script.
        // allowCredentials must be false when allowedOriginPatterns is "*".
        CorsConfiguration ingestion = new CorsConfiguration();
        ingestion.addAllowedOriginPattern("*");
        ingestion.setAllowedMethods(List.of("POST", "OPTIONS"));
        ingestion.setAllowedHeaders(List.of("Content-Type", "X-Ingestion-Api-Key"));
        ingestion.setAllowCredentials(false);
        ingestion.setMaxAge(3600L);
        source.registerCorsConfiguration("/api/ingestion/**", ingestion);

        // --- All other endpoints: strict origin allowlist ---
        CorsConfiguration config = new CorsConfiguration();

        // Only allow specific origins (never use "*" in production)
        config.setAllowedOrigins(allowedOrigins);

        // Standard HTTP methods for REST API
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));

        // Required headers for authentication + content type.
        // Accept and DNT are sent by browsers (e.g. axios defaults + privacy settings)
        // and must be explicitly allowed — DNT is not a CORS-safelisted header.
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "DNT"));

        // Allow credentials (cookies, auth headers)
        config.setAllowCredentials(true);

        // Preflight response cache time (1 hour)
        config.setMaxAge(3600L);

        source.registerCorsConfiguration("/**", config);

        return source;
    }

    /**
     * Register CorsFilter as a standalone servlet filter at highest precedence so it
     * runs BEFORE Spring Security's filter chain. This guarantees OPTIONS preflight
     * requests receive CORS headers even when Spring Security would otherwise intercept
     * them first (e.g. JWT resource server blocking unauthenticated OPTIONS requests).
     */
    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilterRegistration(CorsConfigurationSource corsConfigurationSource) {
        FilterRegistrationBean<CorsFilter> registration = new FilterRegistrationBean<>(new CorsFilter(corsConfigurationSource));
        // HIGHEST_PRECEDENCE + 1: runs after MdcRequestFilter (HIGHEST_PRECEDENCE) but before Spring Security (-100)
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return registration;
    }
}
