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
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Low-level HTTP client for the AI gateway.
 * Sends OpenAI-compatible chat completion requests with tool/function calling
 * and parses the tool-call response into a strict ClassificationResult.
 */
@Component
public class AiClient implements AiClientPort {

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

        // Lenient mapper: silently drop unknown properties (model often hallucinates extra fields).
        // Required fields (is_real_estate, confidence_score) are still enforced by @JsonProperty(required=true).
        this.strictMapper = new ObjectMapper();
        this.strictMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
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
        } catch (HttpClientErrorException e) {
            // Groq returns failed_generation in 400 error bodies — try to recover the model's output
            ClassificationResult recovered = tryRecoverFromFailedGeneration(postId, e);
            if (recovered != null) return recovered;
            throw new ClassificationException(
                    "AI API HTTP error for post " + postId + ": " + e.getMessage(), e);
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
        // JSON Schema nullable union types — compatible with both OpenAI and Groq.
        // "nullable": true is an OpenAI extension not recognised by strict JSON Schema validators.
        List<Map<String, String>> nullableString = List.of(Map.of("type", "string"), Map.of("type", "null"));
        List<Map<String, String>> nullableNumber = List.of(Map.of("type", "number"), Map.of("type", "null"));

        Map<String, Object> toolFunction = Map.of(
                "name", "parse_property",
                "description", "Parse and classify a property listing from a social media post",
                "parameters", Map.ofEntries(
                        Map.entry("type", "object"),
                        Map.entry("properties", Map.ofEntries(
                                Map.entry("is_real_estate", Map.of(
                                        "type", "boolean",
                                        "description", "Whether this post is a real estate listing")),
                                Map.entry("property_type", Map.of("anyOf", List.of(
                                        Map.of("type", "string", "enum", List.of("house", "apartment", "land", "commercial_building", "warehouse", "commercial_land", "other")),
                                        Map.of("type", "null")))),
                                Map.entry("price", Map.of("anyOf", nullableNumber)),
                                Map.entry("locality", Map.of("anyOf", nullableString)),
                                Map.entry("bedrooms", Map.of("anyOf", nullableNumber)),
                                Map.entry("land_area", Map.of("anyOf", nullableNumber)),
                                Map.entry("land_area_unit", Map.of("anyOf", nullableString)),
                                Map.entry("built_area", Map.of("anyOf", nullableNumber)),
                                Map.entry("built_area_unit", Map.of("anyOf", nullableString)),
                                Map.entry("contact_phone", Map.of("anyOf", nullableString)),
                                Map.entry("contact_info", Map.of("anyOf", nullableString)),
                                Map.entry("description", Map.of("anyOf", nullableString)),
                                Map.entry("confidence_score", Map.of(
                                        "type", "number", "minimum", 0, "maximum", 100))
                        )),
                        Map.entry("required", List.of("is_real_estate", "property_type", "confidence_score"))
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

    /**
     * Attempts to recover a ClassificationResult from Groq's {@code failed_generation} error field.
     * Groq returns the model's raw output in the error body when schema validation fails.
     * Two patterns handled:
     * <ul>
     *   <li>Pattern A: valid JSON wrapped in {@code <function=parse_property>...</function>} tags</li>
     *   <li>Pattern B: all values stringified ("900", "true", "null") — coerced to correct types</li>
     * </ul>
     *
     * @return parsed result, or {@code null} if recovery is not possible
     */
    private ClassificationResult tryRecoverFromFailedGeneration(UUID postId, HttpClientErrorException ex) {
        try {
            String body = ex.getResponseBodyAsString();
            if (body == null || body.isEmpty()) return null;

            ObjectMapper errorMapper = new ObjectMapper();
            JsonNode root = errorMapper.readTree(body);

            if (!"tool_use_failed".equals(root.path("error").path("code").asText(""))) return null;

            String failedGeneration = root.path("error").path("failed_generation").asText("");
            if (failedGeneration.isEmpty()) return null;

            // Strip <function=parse_property> ... </function> wrapper
            String jsonStr = extractJsonFromFunctionTag(failedGeneration);
            if (jsonStr == null || jsonStr.isEmpty()) return null;

            JsonNode argsNode = errorMapper.readTree(jsonStr);
            if (!argsNode.isObject()) return null;

            com.fasterxml.jackson.databind.node.ObjectNode argsObj =
                    (com.fasterxml.jackson.databind.node.ObjectNode) argsNode;

            // Coerce all string-typed scalar values to their correct JSON types
            coerceStringValues(argsObj);

            ClassificationResult result = strictMapper.treeToValue(argsObj, ClassificationResult.class);
            log.warn("Recovered classification from Groq failed_generation postId={}", postId);
            return result;

        } catch (Exception e) {
            log.debug("Could not recover from Groq failed_generation for post {}: {}", postId, e.getMessage());
            return null;
        }
    }

    /** Strips {@code <function=parse_property>} prefix and optional {@code </function>} suffix. */
    private String extractJsonFromFunctionTag(String failedGeneration) {
        int start = failedGeneration.indexOf('>');
        if (start < 0) return null;
        String content = failedGeneration.substring(start + 1).trim();
        int end = content.lastIndexOf("</function>");
        if (end >= 0) content = content.substring(0, end).trim();
        return content;
    }

    /**
     * Coerces string-typed scalar values in an ObjectNode to correct JSON types.
     * Handles: {@code "null"} → null, {@code "true"/"false"} → boolean,
     * numeric strings → number. Actual string values (e.g. "Udupi") are left unchanged.
     */
    private void coerceStringValues(com.fasterxml.jackson.databind.node.ObjectNode obj) {
        List<String> keys = new ArrayList<>();
        obj.fieldNames().forEachRemaining(keys::add);
        for (String key : keys) {
            JsonNode value = obj.get(key);
            if (!value.isTextual()) continue;
            String text = value.asText();
            if ("null".equals(text)) {
                obj.putNull(key);
            } else if ("true".equals(text)) {
                obj.put(key, true);
            } else if ("false".equals(text)) {
                obj.put(key, false);
            } else {
                try { obj.put(key, Long.parseLong(text)); continue; } catch (NumberFormatException ignored) {}
                try { obj.put(key, Double.parseDouble(text)); } catch (NumberFormatException ignored) {}
            }
        }
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

            // Sanitize: models sometimes return the string "null" instead of JSON null.
            // Walk the top-level object fields and replace string-valued "null" with JSON null
            // so downstream types (BigDecimal, Integer) don't fail strict deserialization.
            JsonNode argsTree = envelopeMapper.readTree(arguments);
            if (argsTree.isObject()) {
                com.fasterxml.jackson.databind.node.ObjectNode argsObj =
                        (com.fasterxml.jackson.databind.node.ObjectNode) argsTree;
                List<String> stringNullKeys = new ArrayList<>();
                argsObj.fields().forEachRemaining(e -> {
                    if (e.getValue().isTextual() && "null".equals(e.getValue().asText())) {
                        stringNullKeys.add(e.getKey());
                    }
                });
                stringNullKeys.forEach(argsObj::putNull);
                return strictMapper.treeToValue(argsObj, ClassificationResult.class);
            }

            // Fallback: strict deserialization (no string-null sanitization needed)
            return strictMapper.readValue(arguments, ClassificationResult.class);

        } catch (JsonProcessingException e) {
            throw new ClassificationException(
                    "Failed to parse AI response for post " + postId + ": " + e.getMessage(), e);
        }
    }
}
