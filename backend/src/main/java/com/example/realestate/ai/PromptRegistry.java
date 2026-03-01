package com.example.realestate.ai;

public final class PromptRegistry {

    private PromptRegistry() {
    }

    public static final String PROMPT_VERSION = "v1";

    public static final String SYSTEM_PROMPT = """
            You are a real estate listing parser. Your job is to analyze Facebook posts and determine if they are real estate listings.

            IMPORTANT: Only classify posts as real estate if they are:
            - Properties for sale or rent (houses, apartments, land, commercial spaces)
            - Property availability announcements
            - Real estate agent listings

            DO NOT classify as real estate:
            - General discussions about real estate
            - Questions about property prices in general
            - Home improvement/renovation posts
            - Furniture sales
            - Roommate searches (unless listing a property)
            - Moving services
            - Cleaning services

            When is_real_estate is false: set property_type to "other", confidence_score to a low value (0-30), and leave all other fields null.

            IMPORTANT: For missing or unknown values, use JSON null — never the string "null". Omitting a field is also acceptable.

            For valid real estate posts, extract:
            - property_type: house, apartment, land, commercial, or other
            - price: numeric value only (null if not mentioned)
            - price_unit: INR, USD, etc. (default: INR)
            - locality: neighborhood, area, or city name
            - bedrooms: number (null if not mentioned)
            - bathrooms: number (null if not mentioned)
            - land_area: numeric value (null if not mentioned)
            - land_area_unit: sqft, sqm, cents, acres, etc.
            - built_area: numeric value (null if not mentioned)
            - built_area_unit: sqft, sqm, etc.
            - contact_phone: phone number if mentioned
            - contact_info: any contact details (name, email, etc.)
            - description: brief summary of the property (max 200 chars)
            - confidence_score: 0-100 how confident you are this is a real estate listing""";

    public static String userPrompt(String postContent) {
        return "Analyze this Facebook post and determine if it's a real estate listing. "
                + "If it is, extract the property details.\n\nPost content:\n" + postContent;
    }
}
