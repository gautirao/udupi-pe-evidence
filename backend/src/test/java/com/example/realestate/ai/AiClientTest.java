package com.example.realestate.ai;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiClientTest {

    @Mock
    private RestTemplate restTemplate;

    private AiClient aiClient;

    @BeforeEach
    void setUp() {
        aiClient = new AiClient(
                restTemplate,
                "https://ai.test/v1/chat/completions",
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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "3BHK house for sale");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo(PropertyType.HOUSE);
        assertThat(result.price()).isEqualByComparingTo("5000000");
        assertThat(result.priceUnit()).isEqualTo("INR");
        assertThat(result.locality()).isEqualTo("Udupi");
        assertThat(result.bedrooms()).isEqualTo(3);
        assertThat(result.bathrooms()).isEqualTo(2);
        assertThat(result.landArea()).isEqualByComparingTo("1200");
        assertThat(result.landAreaUnit()).isEqualTo("sqft");
        assertThat(result.builtArea()).isEqualByComparingTo("1800");
        assertThat(result.builtAreaUnit()).isEqualTo("sqft");
        assertThat(result.contactPhone()).isEqualTo("9876543210");
        assertThat(result.contactInfo()).isEqualTo("John");
        assertThat(result.description()).isEqualTo("3BHK house for sale in Udupi");
        assertThat(result.confidenceScore()).isEqualTo(92);
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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "Selling furniture");

        assertThat(result.isRealEstate()).isFalse();
        assertThat(result.propertyType()).isEqualTo(PropertyType.OTHER);
        assertThat(result.confidenceScore()).isEqualTo(15);
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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

        ClassificationResult result = aiClient.classify(UUID.randomUUID(), "2BHK apartment");

        assertThat(result.propertyType()).isEqualTo(PropertyType.APARTMENT);
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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Failed to parse AI response");
    }

    @Test
    void classify_unknownPropertyInArguments_throws() {
        // Strict mode: unknown fields cause failure
        String aiResponse = """
                {
                  "choices": [{
                    "message": {
                      "tool_calls": [{
                        "function": {
                          "name": "parse_property",
                          "arguments": "{\\"is_real_estate\\": true, \\"property_type\\": \\"house\\", \\"confidence_score\\": 80, \\"unexpected_field\\": \\"surprise\\"}"
                        }
                      }]
                    }
                  }]
                }
                """;

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Failed to parse AI response");
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

        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(aiResponse);

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Failed to parse AI response");
    }

    @Test
    void classify_httpError_throws() {
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenThrow(new RestClientException("Connection refused"));

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("AI API HTTP error");
    }

    @Test
    void classify_nullResponse_throws() {
        when(restTemplate.postForObject(any(String.class), any(HttpEntity.class), eq(String.class)))
                .thenReturn(null);

        UUID postId = UUID.randomUUID();
        assertThatThrownBy(() -> aiClient.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("null response");
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

        ArgumentCaptor<HttpEntity> captor = ArgumentCaptor.forClass(HttpEntity.class);
        when(restTemplate.postForObject(any(String.class), captor.capture(), eq(String.class)))
                .thenReturn(aiResponse);

        aiClient.classify(UUID.randomUUID(), "test content");

        HttpEntity<?> captured = captor.getValue();
        assertThat(captured.getHeaders().getFirst("Authorization")).isEqualTo("Bearer test-api-key");
        assertThat(captured.getHeaders().getFirst("Content-Type")).isEqualTo("application/json");
    }
}
