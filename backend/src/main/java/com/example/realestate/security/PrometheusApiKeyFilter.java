package com.example.realestate.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;

@Component
public class PrometheusApiKeyFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(PrometheusApiKeyFilter.class);
    private static final String PROMETHEUS_PATH = "/actuator/prometheus";
    private static final String API_KEY_HEADER = "X-Metrics-Api-Key";

    private final String expectedApiKey;
    private final ObjectMapper objectMapper;

    public PrometheusApiKeyFilter(
            @Value("${app.metrics.api-key:}") String expectedApiKey,
            ObjectMapper objectMapper) {
        this.expectedApiKey = expectedApiKey;
        this.objectMapper = objectMapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !PROMETHEUS_PATH.equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String providedKey = request.getHeader(API_KEY_HEADER);

        if (providedKey == null || !isValidKey(providedKey)) {
            log.warn("Prometheus metrics API key authentication failed — missing or invalid key");
            sendError(response, HttpServletResponse.SC_UNAUTHORIZED,
                    "Metrics endpoint requires a valid API key");
            return;
        }

        log.debug("Prometheus metrics API key authentication succeeded");
        filterChain.doFilter(request, response);
    }

    private boolean isValidKey(String provided) {
        try {
            if (expectedApiKey == null || expectedApiKey.isBlank()) {
                return false;
            }
            byte[] expected = expectedApiKey.getBytes(StandardCharsets.UTF_8);
            byte[] actual = provided.getBytes(StandardCharsets.UTF_8);
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception e) {
            return false;
        }
    }

    private void sendError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), Map.of("error", message));
    }
}
