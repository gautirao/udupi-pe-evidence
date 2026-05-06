package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AreaGroupsServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    @Mock
    private ResultSet rs;

    private AreaGroupsService service;

    @BeforeEach
    void setUp() {
        service = new AreaGroupsService(jdbcOperations);
    }

    // ── unknown city → empty groups ───────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getGroupsByCity_unknownCity_returnsEmptyGroups() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString()))
                .thenReturn(List.of());

        AreaGroupsResponse response = service.getGroupsByCity("nowhere");

        assertThat(response.city()).isEqualTo("nowhere");
        assertThat(response.groups()).isEmpty();
    }

    // ── city slug normalised to lowercase ─────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getGroupsByCity_normalisesSlugToLowercase() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString()))
                .thenReturn(List.of());

        AreaGroupsResponse response = service.getGroupsByCity("BANGALORE");

        assertThat(response.city()).isEqualTo("bangalore");
        // Verify the query was issued with the lowercase slug
        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq("bangalore"));
    }

    // ── multiple rows for same group folded into one AreaGroupResponse ─────────

    @Test
    @SuppressWarnings("unchecked")
    void getGroupsByCity_multipleRowsSameGroup_foldsIntoOneGroup() throws SQLException {
        // Simulate two rows from JDBC for the same group (group has 2 members)
        when(rs.getString("slug")).thenReturn("tech-corridor");
        when(rs.getString("name")).thenReturn("Tech Corridor");
        when(rs.getString("subtitle")).thenReturn("IT hubs");
        when(rs.getString("region_label")).thenReturn("East Bangalore");
        when(rs.getInt("display_order")).thenReturn(1);
        when(rs.getObject("focus_lat")).thenReturn(12.9645);
        when(rs.getObject("focus_lon")).thenReturn(77.7000);
        when(rs.getObject("min_lat")).thenReturn(null);
        when(rs.getObject("min_lon")).thenReturn(null);
        when(rs.getObject("max_lat")).thenReturn(null);
        when(rs.getObject("max_lon")).thenReturn(null);

        // First call returns area_key for row 0, second for row 1
        when(rs.getString("area_key"))
                .thenReturn("IN|KA|Bengaluru|Whitefield")
                .thenReturn("IN|KA|Bengaluru|Marathahalli");

        ArgumentCaptor<RowMapper> mapperCaptor = ArgumentCaptor.forClass(RowMapper.class);

        when(jdbcOperations.query(anyString(), mapperCaptor.capture(), anyString()))
                .thenAnswer(inv -> {
                    RowMapper<Object> mapper = mapperCaptor.getValue();
                    return List.of(mapper.mapRow(rs, 0), mapper.mapRow(rs, 1));
                });

        AreaGroupsResponse response = service.getGroupsByCity("bangalore");

        assertThat(response.city()).isEqualTo("bangalore");
        assertThat(response.groups()).hasSize(1);

        AreaGroupResponse group = response.groups().get(0);
        assertThat(group.slug()).isEqualTo("tech-corridor");
        assertThat(group.name()).isEqualTo("Tech Corridor");
        assertThat(group.subtitle()).isEqualTo("IT hubs");
        assertThat(group.regionLabel()).isEqualTo("East Bangalore");
        assertThat(group.displayOrder()).isEqualTo(1);
        assertThat(group.areaKeys()).containsExactly(
                "IN|KA|Bengaluru|Whitefield",
                "IN|KA|Bengaluru|Marathahalli"
        );
        assertThat(group.focusLat()).isEqualTo(12.9645);
        assertThat(group.focusLon()).isEqualTo(77.7000);
        // null bounds omitted (not asserted — JSON-level tested in controller test)
        assertThat(group.minLat()).isNull();
    }

    // ── group with no members (null area_key) handled cleanly ─────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getGroupsByCity_groupWithNoMembers_returnsEmptyAreaKeys() throws SQLException {
        when(rs.getString("slug")).thenReturn("empty-group");
        when(rs.getString("name")).thenReturn("Empty Group");
        when(rs.getString("subtitle")).thenReturn(null);
        when(rs.getString("region_label")).thenReturn(null);
        when(rs.getInt("display_order")).thenReturn(1);
        when(rs.getString("area_key")).thenReturn(null); // LEFT JOIN → no members
        when(rs.getObject("focus_lat")).thenReturn(null);
        when(rs.getObject("focus_lon")).thenReturn(null);
        when(rs.getObject("min_lat")).thenReturn(null);
        when(rs.getObject("min_lon")).thenReturn(null);
        when(rs.getObject("max_lat")).thenReturn(null);
        when(rs.getObject("max_lon")).thenReturn(null);

        ArgumentCaptor<RowMapper> mapperCaptor = ArgumentCaptor.forClass(RowMapper.class);
        when(jdbcOperations.query(anyString(), mapperCaptor.capture(), anyString()))
                .thenAnswer(inv -> List.of(mapperCaptor.getValue().mapRow(rs, 0)));

        AreaGroupsResponse response = service.getGroupsByCity("udupi");

        assertThat(response.groups()).hasSize(1);
        assertThat(response.groups().get(0).areaKeys()).isEmpty();
    }

    // ── is_active filter is in SQL (not Java): verify query contains WHERE clause ──

    @Test
    @SuppressWarnings("unchecked")
    void getGroupsByCity_sqlContainsIsActiveFilter() {
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.query(sqlCaptor.capture(), any(RowMapper.class), anyString()))
                .thenReturn(List.of());

        service.getGroupsByCity("bangalore");

        assertThat(sqlCaptor.getValue())
                .contains("is_active = true");
    }
}
