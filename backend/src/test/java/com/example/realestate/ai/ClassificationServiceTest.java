package com.example.realestate.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClassificationServiceTest {

    @Mock
    private RestTemplate restTemplate;

    private ClassificationService service;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        service = new ClassificationService(
                restTemplate, objectMapper,
                "https://ai.test/v1/chat/completions",
                "test-api-key",
                "test-model"
        );
    }

    @Test
    void classify_realEstateListing_returnsCorrectResult() {
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

        ClassificationResult result = service.classify(UUID.randomUUID(), "3BHK house for sale in Udupi");

        assertThat(result.isRealEstate()).isTrue();
        assertThat(result.propertyType()).isEqualTo("house");
        assertThat(result.price()).isEqualByComparingTo("5000000");
        assertThat(result.priceUnit()).isEqualTo("INR");
        assertThat(result.locality()).isEqualTo("Udupi");
        assertThat(result.bedrooms()).isEqualTo(3);
        assertThat(result.bathrooms()).isEqualTo(2);
        assertThat(result.confidenceScore()).isEqualTo(92);
        assertThat(result.contactPhone()).isEqualTo("9876543210");
        assertThat(result.description()).isEqualTo("3BHK house for sale in Udupi");
    }

    @Test
    void classify_notRealEstate_returnsCorrectResult() {
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

        ClassificationResult result = service.classify(UUID.randomUUID(), "Selling old furniture");

        assertThat(result.isRealEstate()).isFalse();
        assertThat(result.confidenceScore()).isEqualTo(15);
    }

    @Test
    void classify_noToolCallInResponse_throwsException() {
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
        assertThatThrownBy(() -> service.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("No tool call arguments");
    }

    @Test
    void classify_malformedJson_throwsException() {
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
        assertThatThrownBy(() -> service.classify(postId, "test"))
                .isInstanceOf(ClassificationException.class)
                .hasMessageContaining("Failed to parse AI response");
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

        service.classify(UUID.randomUUID(), "test content");

        HttpEntity<?> captured = captor.getValue();
        assertThat(captured.getHeaders().getFirst("Authorization")).isEqualTo("Bearer test-api-key");
        assertThat(captured.getHeaders().getFirst("Content-Type")).isEqualTo("application/json");
    }
}
