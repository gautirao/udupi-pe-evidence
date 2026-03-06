package com.example.realestate.notification;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpEntity;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class EmailServiceTest {

    private RestTemplate restTemplate;
    private EmailService emailService;

    @BeforeEach
    void setUp() {
        restTemplate = mock(RestTemplate.class);
        emailService = new EmailService(restTemplate, "test-api-key", "alerts@test.com");
    }

    @Test
    void sendNewListingAlert_postsToResend() {
        UUID listingId = UUID.randomUUID();

        emailService.sendNewListingAlert("buyer@example.com", "Udupi Town",
                listingId, "3BHK Apartment", 5_000_000_00L); // 50 lakh in paise

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(
                eq("https://api.resend.com/emails"),
                captor.capture(),
                any());

        HttpEntity<Map<String, Object>> entity = captor.getValue();
        Map<String, Object> body = entity.getBody();
        assertThat(body).isNotNull();
        assertThat(body.get("from")).isEqualTo("alerts@test.com");
        assertThat((String[]) body.get("to")).containsExactly("buyer@example.com");
        assertThat((String) body.get("subject")).contains("Udupi Town");
        assertThat((String) body.get("html")).contains("3BHK Apartment");

        // Verify Authorization header
        assertThat(entity.getHeaders().getFirst("Authorization")).isEqualTo("Bearer test-api-key");
    }

    @Test
    void sendNewListingAlert_nullPrice_showsPriceOnRequest() {
        emailService.sendNewListingAlert("buyer@example.com", "Kinnimulky",
                UUID.randomUUID(), "Plot for sale", null);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<HttpEntity<Map<String, Object>>> captor = ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(anyString(), captor.capture(), any());

        String html = (String) captor.getValue().getBody().get("html");
        assertThat(html).contains("Price on request");
    }

    @Test
    void sendNewListingAlert_propagatesException() {
        doThrow(new RuntimeException("Network error"))
                .when(restTemplate).postForObject(anyString(), any(), any());

        org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
                () -> emailService.sendNewListingAlert("buyer@example.com", "Udupi",
                        UUID.randomUUID(), "Plot", 100_000_00L));
    }
}
