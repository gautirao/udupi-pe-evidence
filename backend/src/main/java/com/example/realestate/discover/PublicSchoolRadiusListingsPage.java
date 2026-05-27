package com.example.realestate.discover;

import java.util.List;

/**
 * Paginated response for GET /api/discover/cities/{city}/school-radius-listings.
 *
 * <p>Uses size+1 probe pagination: {@code hasMore} is true when there are additional
 * results beyond the requested page. This avoids a separate COUNT query.
 */
public record PublicSchoolRadiusListingsPage(
        List<PublicSchoolRadiusListingCard> content,
        int page,
        int size,
        boolean hasMore
) {}
