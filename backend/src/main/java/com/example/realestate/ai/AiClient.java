package com.example.realestate.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Low-level HTTP client for the AI gateway.
 * Sends OpenAI-compatible chat completion requests with tool/function calling
 * and parses the tool-call response into a strict ClassificationResult.
 */
@Component
public class AiClient {

    private static final Logger log = LoggerFactory.getLogger(AiClient.class);

    private final RestTemplate restTemplate;
    private final ObjectMapper strictMapper;
    private final String apiUrl;
    private final String apiKey;
    private final String model;

    public AiClient(
            RestTemplate restTemplate,
            @Value("${app.ai.api-url}") String apiUrl,
            @Value("${app.ai.api-key}") String apiKey,
            @Value("${app.ai.model}") String model) {
        this.restTemplate = restTemplate;
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;

        // Strict mapper: fail on unknown properties, missing required fields
        this.strictMapper = new ObjectMapper();
        this.strictMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
    }

    /**
     * Call the AI API with the given post content and return the parsed classification.
     *
     * @param postId      used for logging only
     * @param postContent the raw text to classify
     * @return parsed ClassificationResult from the tool-call response
     * @throws ClassificationException on HTTP error, missing tool call, or malformed JSON
     */
    public ClassificationResult classify(UUID postId, String postContent) {
        log.debug("Sending AI request postId={} model={} apiUrl={}", postId, model, apiUrl);

        Map<String, Object> requestBody = buildRequestBody(postContent);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        String responseJson;
        try {
            responseJson = restTemplate.postForObject(apiUrl, entity, String.class);
        } catch (RestClientException e) {
            throw new ClassificationException(
                    "AI API HTTP error for post " + postId + ": " + e.getMessage(), e);
        }

        if (responseJson == null) {
            throw new ClassificationException("AI API returned null response for post " + postId);
        }

        return parseToolCallResponse(postId, responseJson);
    }

    public String getModel() {
        return model;
    }

    private Map<String, Object> buildRequestBody(String postContent) {
        Map<String, Object> toolFunction = Map.of(
                "name", "parse_property",
                "description", "Parse and classify a property listing from a social media post",
                "parameters", Map.ofEntries(
                        Map.entry("type", "object"),
                        Map.entry("properties", Map.ofEntries(
                                Map.entry("is_real_estate", Map.of(
                                        "type", "boolean",
                                        "description", "Whether this post is a real estate listing")),
                                Map.entry("property_type", Map.of(
                                        "type", "string",
                                        "enum", List.of("house", "apartment", "land", "commercial", "other"))),
                                Map.entry("price", Map.of(
                                        "type", "number", "nullable", true)),
                                Map.entry("price_unit", Map.of(
                                        "type", "string", "default", "INR")),
                                Map.entry("locality", Map.of(
                                        "type", "string", "nullable", true)),
                                Map.entry("bedrooms", Map.of(
                                        "type", "number", "nullable", true)),
                                Map.entry("bathrooms", Map.of(
                                        "type", "number", "nullable", true)),
                                Map.entry("land_area", Map.of(
                                        "type", "number", "nullable", true)),
                                Map.entry("land_area_unit", Map.of(
                                        "type", "string", "nullable", true)),
                                Map.entry("built_area", Map.of(
                                        "type", "number", "nullable", true)),
                                Map.entry("built_area_unit", Map.of(
                                        "type", "string", "nullable", true)),
                                Map.entry("contact_phone", Map.of(
                                        "type", "string", "nullable", true)),
                                Map.entry("contact_info", Map.of(
                                        "type", "string", "nullable", true)),
                                Map.entry("description", Map.of(
                                        "type", "string", "nullable", true)),
                                Map.entry("confidence_score", Map.of(
                                        "type", "number", "minimum", 0, "maximum", 100))
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

    private ClassificationResult parseToolCallResponse(UUID postId, String responseJson) {
        try {
            // Use a separate ObjectMapper for reading the envelope (lenient)
            ObjectMapper envelopeMapper = new ObjectMapper();
            JsonNode root = envelopeMapper.readTree(responseJson);

            JsonNode choices = root.path("choices");
            if (choices.isMissingNode() || !choices.isArray() || choices.isEmpty()) {
                throw new ClassificationException(
                        "AI response missing choices array for post " + postId);
            }

            JsonNode message = choices.path(0).path("message");
            JsonNode toolCalls = message.path("tool_calls");
            if (toolCalls.isMissingNode() || !toolCalls.isArray() || toolCalls.isEmpty()) {
                throw new ClassificationException(
                        "No tool_calls in AI response for post " + postId);
            }

            JsonNode firstToolCall = toolCalls.path(0);
            String functionName = firstToolCall.path("function").path("name").asText("");
            if (!"parse_property".equals(functionName)) {
                throw new ClassificationException(
                        "Unexpected function name '" + functionName
                                + "' in AI response for post " + postId);
            }

            String arguments = firstToolCall.path("function").path("arguments").asText("");
            if (arguments.isEmpty()) {
                throw new ClassificationException(
                        "Empty tool call arguments in AI response for post " + postId);
            }

            // Strict deserialization: fails on unknown properties or missing required fields
            return strictMapper.readValue(arguments, ClassificationResult.class);

        } catch (JsonProcessingException e) {
            throw new ClassificationException(
                    "Failed to parse AI response for post " + postId + ": " + e.getMessage(), e);
        }
    }
}
