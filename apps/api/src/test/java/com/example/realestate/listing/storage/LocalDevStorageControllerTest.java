package com.example.realestate.listing.storage;

import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Path;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest proving the local-storage public GET endpoint actually returns previously-written
 * bytes over real HTTP — i.e. the URL {@link LocalDevStorageService#getPublicUrl} hands back to
 * the frontend genuinely resolves to the uploaded image bytes, not just a plausible-looking
 * string (#2351 blocking fix, required test #2).
 *
 * <p>Uses the real {@link LocalDevStorageService} (filesystem-backed, pointed at a temp dir) so
 * the write→serve round trip is exercised for real rather than mocked.
 */
@WebMvcTest(
        controllers = LocalDevStorageController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({LocalDevStorageService.class, LocalDevStorageControllerTest.TestConfig.class})
@TestPropertySource(properties = "local.dev.storage.enabled=true")
class LocalDevStorageControllerTest {

    @TempDir
    static Path tmp;

    static class TestConfig {
        @Bean
        SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }

        @Bean
        JwtDecoder jwtDecoder() {
            // Never invoked — every request in this test class is permitAll.
            return token -> {
                throw new UnsupportedOperationException("stub");
            };
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private LocalDevStorageService localDevStorageService;

    // Required to satisfy DbRoleJwtAuthenticationConverter (a @Component Converter<Jwt, ...>
    // picked up by the @WebMvcTest slice) even though every request here is permitAll and never
    // decodes a JWT.
    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(localDevStorageService, "rootDir", tmp.toString());
    }

    @Test
    void publicGet_returnsPreviouslyWrittenBytes() throws Exception {
        byte[] bytes = "fake-jpeg-bytes".getBytes();
        localDevStorageService.writeObject("listing-images", "listings/u1/l1/photo.jpg", bytes);

        mockMvc.perform(get("/api/dev/local-storage/public/listing-images/listings/u1/l1/photo.jpg"))
                .andExpect(status().isOk())
                .andExpect(content().bytes(bytes));
    }

    @Test
    void publicGet_missingFile_returns404() throws Exception {
        mockMvc.perform(get("/api/dev/local-storage/public/listing-images/listings/u1/l1/missing.jpg"))
                .andExpect(status().isNotFound());
    }
}
