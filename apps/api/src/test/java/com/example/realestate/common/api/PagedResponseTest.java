package com.example.realestate.common.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for {@link PagedResponse}: JSON shape, factory math, and edge cases.
 */
class PagedResponseTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    // ===== JSON shape =====

    /**
     * Serialized envelope must have EXACTLY five keys: items, page, size, totalElements, totalPages.
     * The legacy key "content" must NOT appear.
     */
    @Test
    void serializedEnvelope_hasExactlyFiveKeys_contentKeyAbsent() throws Exception {
        PagedResponse<String> response = PagedResponse.of(List.of("a", "b"), 0, 10, 2);

        String json = MAPPER.writeValueAsString(response);
        JsonNode root = MAPPER.readTree(json);

        Set<String> actualKeys = new TreeSet<>();
        for (Iterator<String> it = root.fieldNames(); it.hasNext(); ) {
            actualKeys.add(it.next());
        }

        Set<String> expectedKeys = Set.of("items", "page", "size", "totalElements", "totalPages");
        assertEquals(expectedKeys, actualKeys,
                "Envelope must have exactly five keys and no others");

        assertFalse(root.has("content"), "Legacy 'content' key must NOT be present");
    }

    /**
     * Key names serialize verbatim — camelCase preserved, no snake_case drift.
     */
    @Test
    void serializedEnvelope_keyNamesAreCorrect() throws Exception {
        PagedResponse<Integer> response = PagedResponse.of(List.of(1), 2, 5, 11);

        JsonNode root = MAPPER.readTree(MAPPER.writeValueAsString(response));

        assertTrue(root.has("items"),         "key 'items' must exist");
        assertTrue(root.has("page"),          "key 'page' must exist");
        assertTrue(root.has("size"),          "key 'size' must exist");
        assertTrue(root.has("totalElements"), "key 'totalElements' must exist");
        assertTrue(root.has("totalPages"),    "key 'totalPages' must exist");
    }

    // ===== Factory math — of(List, page, size, totalElements) =====

    @Test
    void factory_listVariant_99over50_gives2Pages() {
        PagedResponse<String> r = PagedResponse.of(List.of(), 0, 50, 99);
        assertEquals(2, r.totalPages(), "ceil(99/50) should be 2");
    }

    @Test
    void factory_listVariant_100over50_gives2Pages() {
        PagedResponse<String> r = PagedResponse.of(List.of(), 1, 50, 100);
        assertEquals(2, r.totalPages(), "ceil(100/50) should be 2");
    }

    @Test
    void factory_listVariant_101over50_gives3Pages() {
        PagedResponse<String> r = PagedResponse.of(List.of(), 2, 50, 101);
        assertEquals(3, r.totalPages(), "ceil(101/50) should be 3");
    }

    @Test
    void factory_listVariant_sizeZero_givesTotalPagesZero() {
        PagedResponse<String> r = PagedResponse.of(List.of(), 0, 0, 100);
        assertEquals(0, r.totalPages(), "size <= 0 must yield totalPages = 0");
    }

    @Test
    void factory_listVariant_sizeNegative_givesTotalPagesZero() {
        PagedResponse<String> r = PagedResponse.of(List.of(), 0, -1, 50);
        assertEquals(0, r.totalPages(), "negative size must yield totalPages = 0");
    }

    @Test
    void factory_listVariant_emptyItems_isEmptyListNotNull() {
        PagedResponse<String> r = PagedResponse.of(List.of(), 0, 10, 0);
        assertNotNull(r.items(), "items must never be null");
        assertTrue(r.items().isEmpty(), "items must be empty list for zero results");
    }

    @Test
    void factory_listVariant_nullItemsArg_returnsEmptyList() {
        PagedResponse<String> r = PagedResponse.of(null, 0, 10, 0);
        assertNotNull(r.items(), "null items arg must produce non-null empty list");
        assertTrue(r.items().isEmpty());
    }

    // ===== Factory — of(Page<T>, List<T>) metadata copy =====

    @Test
    void factory_pageAndItemsVariant_copiesMetadataFromPage() {
        List<String> entities = List.of("entity1", "entity2");
        Page<String> springPage = new PageImpl<>(entities, PageRequest.of(3, 25), 77);
        List<String> dtos = List.of("dto1", "dto2");

        PagedResponse<String> r = PagedResponse.of(springPage, dtos);

        assertEquals(3, r.page(),            "page number must come from Page.getNumber()");
        assertEquals(25, r.size(),           "size must come from Page.getSize()");
        assertEquals(77, r.totalElements(),  "totalElements must come from Page.getTotalElements()");
        assertEquals(springPage.getTotalPages(), r.totalPages(),
                "totalPages must come from Page.getTotalPages()");
        assertEquals(dtos, r.items(),        "items must be the pre-mapped DTO list");
    }

    // ===== Factory — of(Page<T>) content copy =====

    @Test
    void factory_pageVariant_usesPageContent() {
        List<String> content = List.of("x", "y", "z");
        Page<String> springPage = new PageImpl<>(content, PageRequest.of(0, 10), 3);

        PagedResponse<String> r = PagedResponse.of(springPage);

        assertEquals(content, r.items());
        assertEquals(0, r.page());
        assertEquals(10, r.size());
        assertEquals(3, r.totalElements());
        assertEquals(1, r.totalPages());
    }

    // ===== Multi-page scenario =====

    @Test
    void factory_listVariant_multiPage_correctTotalPages() {
        // 200 items, page size 20 → 10 pages
        PagedResponse<String> r = PagedResponse.of(List.of(), 0, 20, 200);
        assertEquals(10, r.totalPages());
        assertEquals(200, r.totalElements());
    }
}
