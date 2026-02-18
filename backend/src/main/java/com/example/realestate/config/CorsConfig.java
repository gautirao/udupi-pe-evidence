package com.example.realestate.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

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

        // Apply to all API endpoints
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);

        return source;
    }
}
