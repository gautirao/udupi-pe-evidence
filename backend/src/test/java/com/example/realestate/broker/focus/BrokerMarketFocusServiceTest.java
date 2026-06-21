package com.example.realestate.broker.focus;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;

/**
 * Unit tests for {@link BrokerMarketFocusService}.
 *
 * <p>Verifies:
 * <ul>
 *   <li>listFocus delegates to JdbcOperations with the JWT-resolved userId only</li>
 *   <li>addFocus resolves city_slug server-side via areas→cities join; passes resolved slug to INSERT</li>
 *   <li>addFocus rejects unknown areaKey with HTTP 422 (no row inserted)</li>
 *   <li>addFocus passes the correct five columns; never sends a broker_id from the request</li>
 *   <li>removeFocus passes broker_id + full tuple; throws 404 when deleted == 0</li>
 *   <li>seedFocus passes only userId; returns the insert count</li>
 *   <li>Idempotency contract: zero-row addFocus and seedFocus calls do not throw</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class BrokerMarketFocusServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    private BrokerMarketFocusService service;

    private static final UUID USER_A = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID USER_B = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    @BeforeEach
    void setUp() {
        service = new BrokerMarketFocusService(jdbcOperations);
    }

    // -----------------------------------------------------------------------
    // listFocus
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("listFocus passes JWT userId to query; returns result list unchanged")
    @SuppressWarnings("unchecked")
    void listFocus_passesBrokerIdToQuery_returnsRows() {
        BrokerMarketFocusRow row = new BrokerMarketFocusRow(
                "udupi", "IN|KA|Udupi|Manipal", "land", "sale", "seeded",
                Instant.parse("2026-06-20T10:00:00Z"));

        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(USER_A)))
                .thenReturn(List.of(row));

        List<BrokerMarketFocusRow> result = service.listFocus(USER_A);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).citySlug()).isEqualTo("udupi");
        assertThat(result.get(0).source()).isEqualTo("seeded");

        // Verify: exactly one positional arg — userId; no second id accepted from caller
        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq(USER_A));
    }

    @Test
    @DisplayName("listFocus returns empty list when no rows found")
    @SuppressWarnings("unchecked")
    void listFocus_noRows_returnsEmptyList() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(USER_A)))
                .thenReturn(List.of());

        List<BrokerMarketFocusRow> result = service.listFocus(USER_A);

        assertThat(result).isEmpty();
    }

    // -----------------------------------------------------------------------
    // addFocus — city_slug resolved server-side
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("addFocus resolves city_slug via areas→cities join; passes resolved slug to INSERT — not client value")
    @SuppressWarnings("unchecked")
    void addFocus_resolvesCitySlugViaJoin_passesResolvedSlugToInsert() {
        // Stub the slug-resolution query: IN|KA|Udupi|Manipal → 'udupi'
        when(jdbcOperations.queryForList(anyString(), eq(String.class), eq("IN|KA|Udupi|Manipal")))
                .thenReturn(List.of("udupi"));
        when(jdbcOperations.update(anyString(), any(Object[].class))).thenReturn(1);

        AddFocusRequest req = new AddFocusRequest("IN|KA|Udupi|Manipal", "land", "sale");
        service.addFocus(USER_A, req);

        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).update(anyString(), captor.capture());

        Object[] args = captor.getValue();
        // args[0] = JWT-resolved userId
        assertThat(args[0]).isEqualTo(USER_A);
        // args[1] = server-resolved city_slug from the join — not from any client field
        assertThat(args[1]).isEqualTo("udupi");
        assertThat(args[2]).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(args[3]).isEqualTo("land");
        assertThat(args[4]).isEqualTo("sale");
        // source 'manual' is baked into the SQL — not passed as a param from service
        assertThat(args).hasSize(5);
    }

    @Test
    @DisplayName("addFocus: Kundapur-style area — city_slug resolves to 'kundapur', NOT the district name 'Udupi'")
    @SuppressWarnings("unchecked")
    void addFocus_kundapurAreaKey_resolvesKundapurSlug_notDistrictName() {
        // Kundapur: area_key district segment is 'Udupi', but the join produces 'kundapur'.
        // This is the cross-boundary case that broke AC2/AC4 when citySlug was client-supplied.
        when(jdbcOperations.queryForList(anyString(), eq(String.class), eq("IN|KA|Udupi|Kundapur")))
                .thenReturn(List.of("kundapur"));
        when(jdbcOperations.update(anyString(), any(Object[].class))).thenReturn(1);

        AddFocusRequest req = new AddFocusRequest("IN|KA|Udupi|Kundapur", "land", "sale");
        service.addFocus(USER_A, req);

        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).update(anyString(), captor.capture());

        Object[] args = captor.getValue();
        assertThat(args[0]).isEqualTo(USER_A);
        // Must be 'kundapur' — if this were 'udupi' or 'Udupi', AC4 would be broken
        assertThat(args[1])
                .as("city_slug for Kundapur area must be 'kundapur' not the district name")
                .isEqualTo("kundapur");
        assertThat(args[2]).isEqualTo("IN|KA|Udupi|Kundapur");
    }

    @Test
    @DisplayName("addFocus rejects unknown areaKey with HTTP 422 — no INSERT is executed")
    @SuppressWarnings("unchecked")
    void addFocus_unknownAreaKey_throws422_noInsert() {
        // No areas row for this key — slug-resolution returns empty list
        when(jdbcOperations.queryForList(anyString(), eq(String.class), eq("UNKNOWN|AREA|KEY")))
                .thenReturn(List.of());

        AddFocusRequest req = new AddFocusRequest("UNKNOWN|AREA|KEY", "land", "sale");

        assertThatThrownBy(() -> service.addFocus(USER_A, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(UNPROCESSABLE_ENTITY);
                    assertThat(rse.getReason()).contains("Area not found");
                });

        // Critically: no INSERT must have been attempted
        verify(jdbcOperations, org.mockito.Mockito.never()).update(anyString(), any(Object[].class));
    }

    @Test
    @DisplayName("addFocus is idempotent: 0 rows updated (conflict) does not throw")
    @SuppressWarnings("unchecked")
    void addFocus_conflictNoOp_doesNotThrow() {
        when(jdbcOperations.queryForList(anyString(), eq(String.class), eq("IN|KA|Udupi|Manipal")))
                .thenReturn(List.of("udupi"));
        when(jdbcOperations.update(anyString(), any(Object[].class))).thenReturn(0);

        AddFocusRequest req = new AddFocusRequest("IN|KA|Udupi|Manipal", "land", "sale");
        // Must not throw even when ON CONFLICT DO NOTHING fires (update count = 0)
        service.addFocus(USER_A, req);
    }

    // -----------------------------------------------------------------------
    // removeFocus
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("removeFocus passes userId + all 4 tuple columns so broker cannot delete another's row")
    void removeFocus_passesOwnershipArgs() {
        when(jdbcOperations.update(anyString(), any(Object[].class))).thenReturn(1);

        RemoveFocusRequest req = new RemoveFocusRequest("udupi", "IN|KA|Udupi|Manipal", "land", "sale");
        service.removeFocus(USER_A, req);

        ArgumentCaptor<Object[]> captor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).update(anyString(), captor.capture());

        Object[] args = captor.getValue();
        assertThat(args[0]).isEqualTo(USER_A);
        assertThat(args[1]).isEqualTo("udupi");
        assertThat(args[2]).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(args[3]).isEqualTo("land");
        assertThat(args[4]).isEqualTo("sale");
        assertThat(args).hasSize(5);
    }

    @Test
    @DisplayName("removeFocus throws 404 when row not found (prevents enumeration of other brokers)")
    void removeFocus_rowNotFound_throws404() {
        when(jdbcOperations.update(anyString(), any(Object[].class))).thenReturn(0);

        RemoveFocusRequest req = new RemoveFocusRequest("udupi", "IN|KA|Udupi|Manipal", "land", "sale");

        assertThatThrownBy(() -> service.removeFocus(USER_A, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(NOT_FOUND);
                });
    }

    @Test
    @DisplayName("removeFocus: broker B cannot delete broker A's row because userId is always JWT-resolved")
    void removeFocus_differentBroker_returns404() {
        // Simulate: Broker B attempts to delete Broker A's row.
        // The DELETE SQL uses broker_id = USER_B, so it finds 0 rows → 404.
        when(jdbcOperations.update(anyString(), any(Object[].class))).thenReturn(0);

        RemoveFocusRequest req = new RemoveFocusRequest("udupi", "IN|KA|Udupi|Manipal", "land", "sale");

        assertThatThrownBy(() -> service.removeFocus(USER_B, req))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(NOT_FOUND);
                });
    }

    // -----------------------------------------------------------------------
    // seedFocus
    // -----------------------------------------------------------------------

    @Test
    @DisplayName("seedFocus passes only JWT userId; returns insert count")
    void seedFocus_passesUserIdOnly_returnsCount() {
        when(jdbcOperations.update(anyString(), eq(USER_A))).thenReturn(3);

        int count = service.seedFocus(USER_A);

        assertThat(count).isEqualTo(3);
        verify(jdbcOperations).update(anyString(), eq(USER_A));
    }

    @Test
    @DisplayName("seedFocus idempotency: 0 inserted when all rows already exist — does not throw")
    void seedFocus_zeroInserted_doesNotThrow() {
        when(jdbcOperations.update(anyString(), eq(USER_A))).thenReturn(0);

        int count = service.seedFocus(USER_A);

        assertThat(count).isZero();
    }

    @Test
    @DisplayName("seedFocus: broker A and broker B use independent calls with their own userId")
    void seedFocus_twoCallers_eachPassTheirOwnUserId() {
        when(jdbcOperations.update(anyString(), eq(USER_A))).thenReturn(2);
        when(jdbcOperations.update(anyString(), eq(USER_B))).thenReturn(1);

        assertThat(service.seedFocus(USER_A)).isEqualTo(2);
        assertThat(service.seedFocus(USER_B)).isEqualTo(1);

        verify(jdbcOperations).update(anyString(), eq(USER_A));
        verify(jdbcOperations).update(anyString(), eq(USER_B));
    }
}
