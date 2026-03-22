package com.example.realestate.trust;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link PhotoHashService}.
 * All dependencies are mocked via Mockito — no Spring context.
 */
@ExtendWith(MockitoExtension.class)
class PhotoHashServiceTest {

    @Mock
    private PhotoBlocklistRepository blocklistRepository;

    private PhotoHashService photoHashService;

    @BeforeEach
    void setUp() {
        photoHashService = new PhotoHashService(blocklistRepository);
    }

    // -------------------------------------------------------------------------
    // Helper: generate a solid-colour 32x32 PNG as bytes
    // -------------------------------------------------------------------------

    private byte[] solidColorPng(Color color) throws IOException {
        BufferedImage img = new BufferedImage(32, 32, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 32; y++) {
            for (int x = 0; x < 32; x++) {
                img.setRGB(x, y, color.getRGB());
            }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(img, "png", out);
        return out.toByteArray();
    }

    // -------------------------------------------------------------------------
    // computePhash tests
    // -------------------------------------------------------------------------

    /**
     * Same image bytes must produce the same hash every time (determinism).
     */
    @Test
    void computePhash_sameImageTwice_sameHash() throws IOException {
        byte[] imageBytes = solidColorPng(Color.RED);

        long hash1 = photoHashService.computePhash(imageBytes);
        long hash2 = photoHashService.computePhash(imageBytes);

        assertThat(hash1).isEqualTo(hash2);
    }

    /**
     * Corrupt bytes that cannot be decoded must throw IOException.
     */
    @Test
    void computePhash_corruptBytes_throwsIOException() {
        byte[] corrupt = new byte[]{1, 2, 3};

        assertThatThrownBy(() -> photoHashService.computePhash(corrupt))
                .isInstanceOf(IOException.class);
    }

    // -------------------------------------------------------------------------
    // isBlocked tests
    // -------------------------------------------------------------------------

    /**
     * Empty blocklist — every hash is unblocked.
     */
    @Test
    void isBlocked_emptyBlocklist_returnsFalse() throws IOException {
        when(blocklistRepository.findAll()).thenReturn(Collections.emptyList());

        byte[] imageBytes = solidColorPng(Color.BLUE);
        long phash = photoHashService.computePhash(imageBytes);

        assertThat(photoHashService.isBlocked(phash)).isFalse();
    }

    /**
     * Blocklist entry whose hash is identical to the computed hash (Hamming = 0) — must block.
     */
    @Test
    void isBlocked_exactMatch_returnsTrue() throws IOException {
        byte[] imageBytes = solidColorPng(Color.GREEN);
        long phash = photoHashService.computePhash(imageBytes);

        PhotoBlocklistEntry entry = new PhotoBlocklistEntry();
        entry.setPhash(phash);

        when(blocklistRepository.findAll()).thenReturn(List.of(entry));

        assertThat(photoHashService.isBlocked(phash)).isTrue();
    }

    /**
     * Blocklist entry with Hamming distance exactly 11 (one beyond threshold) — must not block.
     * Distance 11 is achieved by flipping exactly 11 bits of the known hash.
     */
    @Test
    void isBlocked_beyondThreshold_returnsFalse() throws IOException {
        byte[] imageBytes = solidColorPng(Color.CYAN);
        long phash = photoHashService.computePhash(imageBytes);

        // Flip exactly 11 bits (bits 0..10) to create a hash at Hamming distance 11
        long distantHash = phash;
        for (int i = 0; i < 11; i++) {
            distantHash ^= (1L << i);
        }
        // Verify our construction gives Hamming = 11
        assertThat(Long.bitCount(phash ^ distantHash)).isEqualTo(11);

        PhotoBlocklistEntry entry = new PhotoBlocklistEntry();
        entry.setPhash(distantHash);

        when(blocklistRepository.findAll()).thenReturn(List.of(entry));

        assertThat(photoHashService.isBlocked(phash)).isFalse();
    }
}
