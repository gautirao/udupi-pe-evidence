package com.example.realestate.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link PrometheusApiKeyFilter}.
 *
 * No Spring context required — the filter is tested by invoking
 * doFilterInternal directly via Spring's MockHttpServletRequest/Response.
 */
class PrometheusApiKeyFilterTest {

    private static final String EXPECTED_KEY = "test-key-123";
    private static final String PROMETHEUS_PATH = "/actuator/prometheus";
    private static final String API_KEY_HEADER = "X-Metrics-Api-Key";

    private PrometheusApiKeyFilter buildFilter(String key) {
        return new PrometheusApiKeyFilter(key, new ObjectMapper());
    }

    @Test
    void prometheus_withValidKey_allows() throws ServletException, IOException {
        PrometheusApiKeyFilter filter = buildFilter(EXPECTED_KEY);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", PROMETHEUS_PATH);
        request.setRequestURI(PROMETHEUS_PATH);
        request.addHeader(API_KEY_HEADER, EXPECTED_KEY);
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, chain);

        verify(chain).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void prometheus_withInvalidKey_denies() throws ServletException, IOException {
        PrometheusApiKeyFilter filter = buildFilter(EXPECTED_KEY);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", PROMETHEUS_PATH);
        request.setRequestURI(PROMETHEUS_PATH);
        request.addHeader(API_KEY_HEADER, "wrong-key");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("Metrics endpoint requires a valid API key");
    }

    @Test
    void prometheus_withMissingKey_denies() throws ServletException, IOException {
        PrometheusApiKeyFilter filter = buildFilter(EXPECTED_KEY);
        FilterChain chain = mock(FilterChain.class);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", PROMETHEUS_PATH);
        request.setRequestURI(PROMETHEUS_PATH);
        // No API key header added
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilterInternal(request, response, chain);

        verify(chain, never()).doFilter(request, response);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("Metrics endpoint requires a valid API key");
    }
}
