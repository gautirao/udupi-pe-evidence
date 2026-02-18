package com.example.realestate.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.IOException;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link MdcRequestFilter}.
 *
 * No Spring context required — the filter is tested by invoking
 * {@code doFilterInternal} directly via a thin wrapper, using
 * MockHttpServletRequest / MockHttpServletResponse from spring-test.
 */
class MdcRequestFilterTest {

    private final MdcRequestFilter filter = new MdcRequestFilter();

    @AfterEach
    void clearMdc() {
        // Belt-and-suspenders: ensure MDC is clean between tests
        MDC.clear();
    }

    // ==================== Test 1: generated requestId is a valid UUID ====================

    /**
     * When no X-Request-Id header is supplied, the filter must generate a new UUID,
     * set it in the MDC during filter chain execution, and echo it in the response header.
     */
    @Test
    void noIncomingHeader_generatesValidUuidAndSetsResponseHeader() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        // Capture the MDC value as seen by the filter chain
        String[] mdcDuringChain = new String[1];
        FilterChain chain = (req, res) -> mdcDuringChain[0] = MDC.get(MdcRequestFilter.MDC_KEY);

        filter.doFilter(request, response, chain);

        String responseHeader = response.getHeader(MdcRequestFilter.REQUEST_ID_HEADER);

        // Response header must be present
        assertThat(responseHeader)
                .as("X-Request-Id response header must be set")
                .isNotNull()
                .isNotBlank();

        // Must be a valid UUID (UUID.fromString throws if not)
        assertThat(UUID.fromString(responseHeader))
                .as("X-Request-Id must be a valid UUID")
                .isNotNull();

        // MDC value seen during chain execution must match response header
        assertThat(mdcDuringChain[0])
                .as("MDC requestId during chain must match response header")
                .isEqualTo(responseHeader);
    }

    // ==================== Test 2: caller-supplied X-Request-Id is passed through ====================

    /**
     * When the caller supplies an X-Request-Id header, that exact value must be
     * used — no new UUID is generated.
     */
    @Test
    void callerSuppliedHeader_isEchoedBackUnchanged() throws Exception {
        String suppliedId = "caller-supplied-id-abc-123";

        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(MdcRequestFilter.REQUEST_ID_HEADER, suppliedId);
        MockHttpServletResponse response = new MockHttpServletResponse();

        String[] mdcDuringChain = new String[1];
        FilterChain chain = (req, res) -> mdcDuringChain[0] = MDC.get(MdcRequestFilter.MDC_KEY);

        filter.doFilter(request, response, chain);

        assertThat(response.getHeader(MdcRequestFilter.REQUEST_ID_HEADER))
                .as("Response header must echo caller-supplied ID")
                .isEqualTo(suppliedId);

        assertThat(mdcDuringChain[0])
                .as("MDC requestId must match caller-supplied ID")
                .isEqualTo(suppliedId);
    }

    // ==================== Test 3: MDC is cleared after filter completes ====================

    /**
     * After the filter chain completes normally, MDC must be clear —
     * no requestId must remain on the thread.
     */
    @Test
    void mdcIsClearedAfterFilterCompletes() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        FilterChain chain = (req, res) -> {
            // Confirm it is set during chain execution
            assertThat(MDC.get(MdcRequestFilter.MDC_KEY)).isNotNull();
        };

        filter.doFilter(request, response, chain);

        assertThat(MDC.get(MdcRequestFilter.MDC_KEY))
                .as("MDC must be cleared after filter completes")
                .isNull();
    }

    // ==================== Test 4: MDC is cleared even when filter chain throws ====================

    /**
     * If the downstream filter chain throws a runtime exception, the MDC must still
     * be cleared (the finally block must execute regardless of exception).
     */
    @Test
    void mdcIsClearedEvenWhenFilterChainThrows() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        FilterChain chain = (req, res) -> {
            throw new ServletException("Simulated downstream failure");
        };

        assertThatThrownBy(() -> filter.doFilter(request, response, chain))
                .isInstanceOf(ServletException.class)
                .hasMessage("Simulated downstream failure");

        assertThat(MDC.get(MdcRequestFilter.MDC_KEY))
                .as("MDC must be cleared even after filter chain exception")
                .isNull();
    }
}
