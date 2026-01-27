package com.example.realestate.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ClassificationService {

    private static final Logger log = LoggerFactory.getLogger(ClassificationService.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String apiUrl;
    private final String apiKey;
    private final String model;

    public ClassificationService(
            RestTemplate restTemplate,
            ObjectMapper objectMapper,
            @Value("${app.ai.api-url}") String apiUrl,
            @Value("${app.ai.api-key}") String apiKey,
            @Value("${app.ai.model}") String model) {
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
    }

    /**
     * Classify a raw post's content using the AI API.
     * Uses the same OpenAI-compatible function calling approach as the Edge Function.
     */
    public ClassificationResult classify(UUID postId, String postContent) {
        log.info("Classifying post postId={} model={} promptVersion={}",
                postId, model, PromptRegistry.PROMPT_VERSION);

        Map<String, Object> requestBody = buildRequest(postContent);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        String responseJson = restTemplate.postForObject(apiUrl, entity, String.class);

        ClassificationResult result = parseResponse(postId, responseJson);

        log.info("Classification complete postId={} isRealEstate={} confidence={} propertyType={} promptVersion={}",
                postId, result.isRealEstate(), result.confidenceScore(),
                result.propertyType(), PromptRegistry.PROMPT_VERSION);

        return result;
    }

    private Map<String, Object> buildRequest(String postContent) {
        Map<String, Object> toolFunction = Map.of(
                "name", "parse_property",
                "description", "Parse and classify a property listing from a social media post",
                "parameters", Map.ofEntries(
                        Map.entry("type", "object"),
                        Map.entry("properties", Map.ofEntries(
                                Map.entry("is_real_estate", Map.of("type", "boolean", "description", "Whether this post is a real estate listing")),
                                Map.entry("property_type", Map.of("type", "string", "enum", List.of("house", "apartment", "land", "commercial", "other"))),
                                Map.entry("price", Map.of("type", "number", "nullable", true)),
                                Map.entry("price_unit", Map.of("type", "string", "default", "INR")),
                                Map.entry("locality", Map.of("type", "string", "nullable", true)),
                                Map.entry("bedrooms", Map.of("type", "number", "nullable", true)),
                                Map.entry("bathrooms", Map.of("type", "number", "nullable", true)),
                                Map.entry("land_area", Map.of("type", "number", "nullable", true)),
                                Map.entry("land_area_unit", Map.of("type", "string", "nullable", true)),
                                Map.entry("built_area", Map.of("type", "number", "nullable", true)),
                                Map.entry("built_area_unit", Map.of("type", "string", "nullable", true)),
                                Map.entry("contact_phone", Map.of("type", "string", "nullable", true)),
                                Map.entry("contact_info", Map.of("type", "string", "nullable", true)),
                                Map.entry("description", Map.of("type", "string", "nullable", true)),
                                Map.entry("confidence_score", Map.of("type", "number", "minimum", 0, "maximum", 100))
                        )),
                        Map.entry("required", List.of("is_real_estate", "property_type", "confidence_score")),
                        Map.entry("additionalProperties", false)
                )
        );

        return Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", PromptRegistry.SYSTEM_PROMPT),
                        Map.of("role", "user", "content", PromptRegistry.userPrompt(postContent))
                ),
                "tools", List.of(Map.of("type", "function", "function", toolFunction)),
                "tool_choice", Map.of("type", "function", "function", Map.of("name", "parse_property"))
        );
    }

    private ClassificationResult parseResponse(UUID postId, String responseJson) {
        try {
            JsonNode root = objectMapper.readTree(responseJson);
            JsonNode toolCall = root.path("choices").path(0)
                    .path("message").path("tool_calls").path(0);

            String arguments = toolCall.path("function").path("arguments").asText();
            if (arguments == null || arguments.isEmpty()) {
                throw new ClassificationException(
                        "No tool call arguments in AI response for post " + postId);
            }

            return objectMapper.readValue(arguments, ClassificationResult.class);
        } catch (JsonProcessingException e) {
            throw new ClassificationException(
                    "Failed to parse AI response for post " + postId, e);
        }
    }

    public String getModel() {
        return model;
    }

    public String getPromptVersion() {
        return PromptRegistry.PROMPT_VERSION;
    }
}
