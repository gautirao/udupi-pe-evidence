package com.example.realestate.listing.storage;

import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Surfaces the effective state of {@link SupabaseStorageService} at {@code /actuator/info}.
 *
 * <p>Example payload fragment:
 * <pre>
 * "supabaseStorage": {
 *   "enabled": false,
 *   "reason": "missing-credentials"
 * }
 * </pre>
 *
 * <p>Reasons:
 * <ul>
 *   <li>{@code enabled} — configured flag is true AND credentials present AND HTTPS URL</li>
 *   <li>{@code disabled-by-flag} — {@code SUPABASE_STORAGE_ENABLED=false} (default)</li>
 *   <li>{@code missing-credentials} — flag is true but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is absent</li>
 * </ul>
 *
 * <p>Operators can hit {@code /actuator/info} to confirm why storage is (or isn't) active
 * without tailing logs. Requires {@code info} in {@code management.endpoints.web.exposure.include}
 * (already set in {@code application.yml}).
 */
@Component
public class SupabaseStorageInfoContributor implements InfoContributor {

    private final SupabaseStorageService storageService;

    public SupabaseStorageInfoContributor(SupabaseStorageService storageService) {
        this.storageService = storageService;
    }

    @Override
    public void contribute(Info.Builder builder) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("enabled", storageService.isEnabled());
        details.put("reason", storageService.getStatusReason());
        builder.withDetail("supabaseStorage", details);
    }
}
