package com.example.realestate.common.api;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Unified paginated response envelope.
 *
 * <p>Serializes to exactly five JSON keys: {@code items}, {@code page}, {@code size},
 * {@code totalElements}, {@code totalPages}. No custom ObjectMapper or annotations are
 * needed — default Jackson serializes record components verbatim.
 *
 * <p>Use the static factories rather than the canonical constructor directly:
 * <ul>
 *   <li>{@link #of(Page, List)} — metadata from a Spring {@link Page}, items already mapped entity → DTO</li>
 *   <li>{@link #of(Page)} — items taken from {@link Page#getContent()} without mapping</li>
 *   <li>{@link #of(List, int, int, long)} — fully manual construction (totalPages computed)</li>
 * </ul>
 *
 * @param <T> the item DTO type
 */
public record PagedResponse<T>(
        List<T> items,
        int page,
        int size,
        long totalElements,
        int totalPages
) {

    /**
     * Creates a response from a Spring {@link Page} whose content has already been mapped
     * to the target DTO type ({@code items}). Pagination metadata is read from {@code page}.
     *
     * @param page  the Spring page providing metadata (page number, size, total count)
     * @param items pre-mapped DTO items corresponding to {@code page.getContent()}
     */
    public static <T> PagedResponse<T> of(Page<?> page, List<T> items) {
        List<T> safeItems = items != null ? items : List.of();
        return new PagedResponse<>(
                safeItems,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }

    /**
     * Creates a response from a Spring {@link Page}, using {@link Page#getContent()} as items.
     * Use when no separate entity→DTO mapping step is needed.
     *
     * @param page the Spring page providing both content and metadata
     */
    public static <T> PagedResponse<T> of(Page<T> page) {
        List<T> safeItems = page.getContent() != null ? page.getContent() : List.of();
        return new PagedResponse<>(
                safeItems,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }

    /**
     * Creates a response with explicit metadata. {@code totalPages} is computed as
     * {@code ceil(totalElements / size)}, or {@code 0} when {@code size <= 0}.
     *
     * @param items         item list (may be empty, never null in the result)
     * @param page          0-based page number
     * @param size          requested page size
     * @param totalElements total number of matching elements across all pages
     */
    public static <T> PagedResponse<T> of(List<T> items, int page, int size, long totalElements) {
        List<T> safeItems = items != null ? items : List.of();
        int totalPages = (size <= 0) ? 0 : (int) Math.ceil((double) totalElements / size);
        return new PagedResponse<>(safeItems, page, size, totalElements, totalPages);
    }
}
