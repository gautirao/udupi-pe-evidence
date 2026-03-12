package com.example.realestate.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final String RESEND_EMAILS_URL = "https://api.resend.com/emails";

    private final RestTemplate restTemplate;
    private final String apiKey;
    private final String fromAddress;

    public EmailService(RestTemplate restTemplate,
                        @Value("${app.email.resend-api-key}") String apiKey,
                        @Value("${app.email.from-address}") String fromAddress) {
        this.restTemplate = restTemplate;
        this.apiKey = apiKey;
        this.fromAddress = fromAddress;
    }

    /**
     * Sends a booking notification email to the dealer via Resend.
     * Fire-and-forget — callers must handle exceptions.
     *
     * @param dealerEmail the dealer's email address (required — caller should skip if null)
     * @param buyerName   buyer's display name, or null (falls back to "A potential buyer")
     * @param listingTitle listing title, or null (falls back to "your listing")
     * @param listingId   the listing UUID for the detail link
     */
    public void sendBookingNotification(String dealerEmail, String buyerName,
                                         String listingTitle, UUID listingId) {
        String safeBuyerName = (buyerName != null && !buyerName.isBlank()) ? buyerName : "A potential buyer";
        String safeTitle = (listingTitle != null && !listingTitle.isBlank()) ? listingTitle : "your listing";

        String subject = "New viewing request for " + safeTitle;
        String html = buildBookingHtml(safeBuyerName, safeTitle, listingId);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        Map<String, Object> body = Map.of(
                "from", fromAddress,
                "to", new String[]{dealerEmail},
                "subject", subject,
                "html", html
        );

        restTemplate.postForObject(RESEND_EMAILS_URL, new HttpEntity<>(body, headers), Map.class);
        log.debug("Booking notification email sent to={} listingId={}", dealerEmail, listingId);
    }

    /**
     * Sends a new-listing alert email via Resend.
     * Fire-and-forget — callers must handle exceptions.
     */
    public void sendNewListingAlert(String toEmail, String areaLabel,
                                    UUID listingId, String listingTitle,
                                    Long pricePaise) {
        String priceDisplay = pricePaise != null
                ? formatRupees(pricePaise / 100L)
                : "Price on request";

        String html = buildHtml(areaLabel, listingTitle, priceDisplay, listingId);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

        Map<String, Object> body = Map.of(
                "from", fromAddress,
                "to", new String[]{toEmail},
                "subject", "New listing in " + areaLabel + ": " + listingTitle,
                "html", html
        );

        restTemplate.postForObject(RESEND_EMAILS_URL, new HttpEntity<>(body, headers), Map.class);
        log.debug("Alert email sent to={} listingId={}", toEmail, listingId);
    }

    private String buildBookingHtml(String buyerName, String listingTitle, UUID listingId) {
        return "<html><body style=\"font-family:sans-serif;\">" +
               "<h2>New viewing request</h2>" +
               "<p>" + escapeHtml(buyerName) + " has requested a viewing for " +
               "<strong>" + escapeHtml(listingTitle) + "</strong>.</p>" +
               "<p><a href=\"/listing/" + listingId + "\">View listing</a></p>" +
               "<hr/><p style=\"color:#888;font-size:12px;\">You received this because you are " +
               "the listing owner on Udupi Properties.</p>" +
               "</body></html>";
    }

    private String buildHtml(String area, String title, String price, UUID listingId) {
        return "<html><body style=\"font-family:sans-serif;\">" +
               "<h2>New property in " + escapeHtml(area) + "</h2>" +
               "<p><strong>" + escapeHtml(title) + "</strong></p>" +
               "<p>Price: " + escapeHtml(price) + "</p>" +
               "<p><a href=\"/listing/" + listingId + "\">View listing</a></p>" +
               "<hr/><p style=\"color:#888;font-size:12px;\">You received this because you saved " +
               escapeHtml(area) + " with alerts enabled.</p>" +
               "</body></html>";
    }

    private static String formatRupees(long rupees) {
        // Simple Indian-locale formatting (e.g. 5000000 → ₹50,00,000)
        if (rupees >= 10_000_000) {
            return String.format("₹%.1f Cr", rupees / 10_000_000.0);
        } else if (rupees >= 100_000) {
            return String.format("₹%.1f L", rupees / 100_000.0);
        }
        return "₹" + String.format("%,d", rupees);
    }

    private static String escapeHtml(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
