package com.example.realestate.ai;

import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AiClientTest {

    private static final String API_URL = "https://ai.test/v1/chat/completions";

    private RestTemplate restTemplate;
    private MockRestServiceServer mockServer;
    private AiClient aiClient;

    @BeforeEach
    void setUp() {
        restTemplate = new RestTemplate();
        mockServer = MockRestServiceServer.createServer(restTemplate);
        aiClient = new AiClient(
                restTemplate,
                API_URL,
                "test-api-key",
                "test-model"
        );
    }

    @Test
    void classify_realEstateListing_parsesAllFields() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"house\\", \\"price\\": 5000000, \\"price_unit\\": \\"INR\\", \\"locality\\": \\"Udupi\\", \\"bedrooms\\": 3, \\"bathrooms\\": 2, \\"land_area\\": 1200, \\"land_area_unit\\": \\"sqft\\", \\"built_area\\": 1800, \\"built_area_unit\\": \\"sqft\\", \\"contact_phone\\": \\"9876543210\\", \\"contact_info\\": \\"John\\", \\"description\\": \\"3BHK house for sale in Udupi\\", \\"confidence_score\\": 92}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "3BHK house for sale");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.HOUSE);
        assertThat(result.price()).isEqualByComparingTo("5000000");
        assertThat(result.locality()).isEqualTo("Udupi");
        assertThat(result.bedrooms()).isEqualTo(3);
        assertThat(result.landArea()).isEqualByComparingTo("1200");
        assertThat(result.landAreaUnit()).isEqualTo("sqft");
        assertThat(result.builtArea()).isEqualByComparingTo("1800");
        assertThat(result.builtAreaUnit()).isEqualTo("sqft");
        assertThat(result.contactPhone()).isEqualTo("9876543210");
        assertThat(result.contactInfo()).isEqualTo("John");
        assertThat(result.description()).isEqualTo("3BHK house for sale in Udupi");
        assertThat(result.confidenceScore()).isEqualTo(92);
        mockServer.verify();
    }

    @Test
    void classify_notRealEstate_parsesCorrectly() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": false, \\"property_type\\": \\"other\\", \\"confidence_score\\": 15}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "Selling furniture");

        assertThat(result.isRealEstate()).isFalse();
        assertThat(result.propertyType()).isEqualTo(PropertyType.OTHER);
        assertThat(result.confidenceScore()).isEqualTo(15);
        mockServer.verify();
    }

    @Test
    void classify_apartmentType_parsesCorrectly() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"apartment\\", \\"confidence_score\\": 88}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "2BHK apartment");

        assertThat(result.propertyType()).isEqualTo(PropertyType.APARTMENT);
        mockServer.verify();
    }

    @Test
    void classify_noToolCallInResponse_throws() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "content": "Some text response"
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("No tool_calls");
    }

    @Test
    void classify_emptyChoicesArray_throws() {
        String aiResponse = """
                { "choices": [] }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("missing choices");
    }

    @Test
    void classify_wrongFunctionName_throws() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "wrong_function",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"house\\", \\"confidence_score\\": 80}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Unexpected function name");
    }

    @Test
    void classify_emptyArguments_throws() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": ""
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Empty tool call arguments");
    }

    @Test
    void classify_malformedJson_throws() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "not valid json{{"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Failed to parse AI response");
    }

    @Test
    void classify_unknownPropertyInArguments_droppedSilently() {
        // Models hallucinate extra fields (e.g. land_use, is_rent, price_currency).
        // Groq rejects the response if the schema has additionalProperties:false.
        // Fix: remove additionalProperties constraint from schema; make Jackson lenient.
        // Extra fields must be silently dropped — not cause a ClassificationException.
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"land\\", \\"confidence_score\\": 100, \\"land_area\\": 25, \\"land_area_unit\\": \\"cents\\", \\"land_use\\": null, \\"is_rent\\": false, \\"price_currency\\": \\"INR\\", \\"contact_name\\": null, \\"contact_email\\": null, \\"description_max_length\\": 200}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "Land for sale 25 cents");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.LAND);
        assertThat(result.confidenceScore()).isEqualTo(100);
        mockServer.verify();
    }

    @Test
    void classify_invalidPropertyType_throws() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"mansion\\", \\"confidence_score\\": 80}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Failed to parse AI response");
    }

    @Test
    void classify_nonRealEstate_nullPropertyType_parsesSuccessfully() {
        // Reproduces Groq 400: model returns property_type:null for non-real-estate posts.
        // Schema must allow null for property_type via anyOf union type.
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": false, \\"property_type\\": null, \\"confidence_score\\": 0}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(Matchers.containsString("\"anyOf\"")))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "Selling furniture cheap");

        assertThat(result.isRealEstate()).isFalse();
        assertThat(result.propertyType()).isNull();
        assertThat(result.confidenceScore()).isEqualTo(0);
        mockServer.verify();
    }

    @Test
    void classify_schemaUsesAnyOfForNullableFields_andParsesNullsCorrectly() {
        // Reproduces Groq 400 error: hotel listing where optional fields are null.
        // The request schema must use anyOf union types — not OpenAI-proprietary "nullable":true —
        // so strict providers like Groq accept null values from the model.
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"commercial\\", \\"price\\": 80, \\"price_unit\\": \\"crore\\", \\"locality\\": null, \\"bedrooms\\": 28, \\"bathrooms\\": null, \\"land_area\\": 97, \\"land_area_unit\\": \\"cents\\", \\"built_area\\": null, \\"built_area_unit\\": null, \\"contact_phone\\": null, \\"contact_info\\": null, \\"description\\": \\"Hotel for sale with amenities\\", \\"confidence_score\\": 90}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(Matchers.containsString("\"anyOf\"")))
                .andExpect(content().string(Matchers.not(Matchers.containsString("\"nullable\""))))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "Hotel for sale 97 cents land 28 rooms");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.COMMERCIAL);
        assertThat(result.locality()).isNull();
        assertThat(result.builtArea()).isNull();
        assertThat(result.builtAreaUnit()).isNull();
        assertThat(result.contactPhone()).isNull();
        assertThat(result.contactInfo()).isNull();
        mockServer.verify();
    }

    @Test
    void classify_stringNullValues_sanitizedToJsonNull() {
        // Reproduces Groq 400: model returns string "null" instead of JSON null
        // for unspecified numeric/string optional fields.
        // e.g. "land_area": "null", "bathrooms": "null" — rejected by Groq schema validator.
        // Our sanitizer must convert string "null" → JSON null before Jackson deserialization.
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"house\\", \\"price\\": 490000, \\"price_unit\\": \\"lakh\\", \\"locality\\": \\"null\\", \\"bedrooms\\": 2, \\"bathrooms\\": \\"null\\", \\"land_area\\": \\"null\\", \\"land_area_unit\\": \\"null\\", \\"built_area\\": \\"null\\", \\"built_area_unit\\": \\"null\\", \\"contact_phone\\": \\"null\\", \\"contact_info\\": \\"null\\", \\"description\\": \\"2 BHK House Just @ 49 Lakh\\", \\"confidence_score\\": 90}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "2 BHK House Just @ 49 Lakh");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.HOUSE);
        assertThat(result.locality()).isNull();
        assertThat(result.landArea()).isNull();
        assertThat(result.landAreaUnit()).isNull();
        assertThat(result.builtArea()).isNull();
        assertThat(result.contactPhone()).isNull();
        assertThat(result.confidenceScore()).isEqualTo(90);
        mockServer.verify();
    }

    @Test
    void classify_groqToolUseFailed_validJson_recoversFromFailedGeneration() {
        // Pattern A: model uses <function=parse_property> tag format with valid JSON.
        // Groq rejects the format but failed_generation contains a valid parseable payload.
        String errorBody = """
                {
                  "error": {
                    "message": "Failed to call a function. Please adjust your prompt.",
                    "type": "invalid_request_error",
                    "code": "tool_use_failed",
                    "failed_generation": "<function=parse_property>{\\"description\\": \\"4 bhk 2800 sqft apartment\\",\\"confidence_score\\": 100,\\"property_type\\": \\"apartment\\",\\"price\\": null,\\"price_unit\\": null,\\"locality\\": \\"Padavinangady\\",\\"bedrooms\\": 4,\\"bathrooms\\": null,\\"land_area\\": null,\\"land_area_unit\\": null,\\"built_area\\": 2800,\\"built_area_unit\\": \\"sqft\\",\\"contact_phone\\": null,\\"contact_info\\": null,\\"is_real_estate\\": true}</function>"
                  }
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withBadRequest().body(errorBody).contentType(MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "4 bhk apartment for sale");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.APARTMENT);
        assertThat(result.locality()).isEqualTo("Padavinangady");
        assertThat(result.bedrooms()).isEqualTo(4);
        assertThat(result.builtArea()).isEqualByComparingTo("2800");
        assertThat(result.confidenceScore()).isEqualTo(100);
        mockServer.verify();
    }

    @Test
    void classify_groqToolUseFailed_allStringValues_recoversWithCoercion() {
        // Pattern B: model returns ALL values as strings including numbers and booleans.
        // Groq rejects because schema expects number/boolean types.
        // failed_generation contains the raw output; we coerce string values to correct types.
        String errorBody = """
                {
                  "error": {
                    "message": "tool call validation failed: parameters did not match schema",
                    "type": "invalid_request_error",
                    "code": "tool_use_failed",
                    "failed_generation": "<function=parse_property> {\\"description\\": \\"23 cent record with 900 sqft 2 BHK House in Halekatte Nitte\\", \\"contact_info\\": \\"null\\", \\"land_area_unit\\": \\"cents\\", \\"price\\": \\"null\\", \\"built_area\\": \\"900\\", \\"confidence_score\\": \\"100\\", \\"locality\\": \\"Halekatte Nitte\\", \\"is_real_estate\\": \\"true\\", \\"built_area_unit\\": \\"sqft\\", \\"bedrooms\\": \\"2\\", \\"bathrooms\\": \\"null\\", \\"property_type\\": \\"house\\", \\"contact_phone\\": \\"null\\", \\"land_area\\": \\"23\\"} </function>"
                  }
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withBadRequest().body(errorBody).contentType(MediaType.APPLICATION_JSON));

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "23 cent 2 BHK house Halekatte Nitte");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.HOUSE);
        assertThat(result.locality()).isEqualTo("Halekatte Nitte");
        assertThat(result.builtArea()).isEqualByComparingTo("900");
        assertThat(result.landArea()).isEqualByComparingTo("23");
        assertThat(result.bedrooms()).isEqualTo(2);
        assertThat(result.contactInfo()).isNull();
        assertThat(result.confidenceScore()).isEqualTo(100);
        mockServer.verify();
    }

    @Test
    void classify_httpError_throws() {
        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withServerError());

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("AI API HTTP error");
    }

    @Test
    void classify_sendsCorrectHeaders() {
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": false, \\"property_type\\": \\"other\\", \\"confidence_score\\": 10}"
                        }
                      }]
                    }
                  }]
                }
                """;

        mockServer.expect(requestTo(API_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer test-api-key"))
                .andExpect(header("Content-Type", "application/json"))
                .andRespond(withSuccess(aiResponse, MediaType.APPLICATION_JSON));

        aiClient.classify(UUID.randomUUID(), "test content");

        mockServer.verify();
    }
}
