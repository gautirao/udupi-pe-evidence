package com.example.realestate.trust;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;

/**
 * Computes a DCT-based perceptual hash (pHash) for uploaded images and
 * checks whether the hash matches any entry in the {@code photo_hash_blocklist} table.
 *
 * <p>Algorithm:
 * <ol>
 *   <li>Decode image using {@code ImageIO} (format-agnostic; invalid bytes → IOException).</li>
 *   <li>Resize to 32×32 grayscale.</li>
 *   <li>Apply 2D DCT-II (orthonormal convention).</li>
 *   <li>Extract the top-left 8×8 submatrix (64 low-frequency coefficients).</li>
 *   <li>Compute the mean of the 63 non-DC coefficients (DC term at index 0 excluded).</li>
 *   <li>Pack 63 bits into a {@code long}: bit {@code i} (i ≥ 1) = 1 if coefficient ≥ mean; bit 0 = 0.</li>
 * </ol>
 *
 * <p>Two hashes are considered duplicates when their Hamming distance
 * (number of differing bits) is ≤ {@link #HAMMING_THRESHOLD}.
 *
 * <p><b>Blocklist caching:</b> the full blocklist is loaded from the database at most once per
 * {@link #CACHE_TTL_MS} per JVM instance (TTL-based double-checked locking). This prevents a
 * full-table scan on every photo upload while keeping the cache fresh enough for operational
 * blocklist updates.
 */
@Service
public class PhotoHashService {

    private static final Logger log = LoggerFactory.getLogger(PhotoHashService.class);

    /** Side of the 2D DCT input grid (image is resized to this before DCT). */
    private static final int DCT_SIZE = 32;

    /** Side of the submatrix extracted from the DCT output (DCT_SIZE / 4). */
    private static final int HASH_SIZE = 8;

    /**
     * Hamming distance at or below which a hash is considered a blocklist match.
     * 10 is the standard threshold used by the pHash specification.
     */
    static final int HAMMING_THRESHOLD = 10;

    /** Maximum accepted file size for photo verification uploads (5 MB). */
    static final long MAX_FILE_BYTES = 5_242_880L;

    /** Blocklist cache TTL in milliseconds (5 minutes). */
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private final PhotoBlocklistRepository blocklistRepository;

    /** Cached list of blocked hashes. Volatile ensures visibility across threads. */
    private volatile List<Long> cachedBlocklist = null;
    /** Epoch-ms timestamp of when the cache was last loaded. */
    private volatile long cacheLoadedAt = 0L;

    public PhotoHashService(PhotoBlocklistRepository blocklistRepository) {
        this.blocklistRepository = blocklistRepository;
    }

    // -------------------------------------------------------------------------
    // verifyAndCheck — orchestrates file validation + pHash + blocklist
    // -------------------------------------------------------------------------

    /**
     * Validates {@code file}, computes its perceptual hash, and checks the blocklist.
     *
     * <p>This method is the single entry point for all photo verification logic and keeps
     * the calling controller thin. The controller maps the result to HTTP status codes.
     *
     * @param file the uploaded multipart file; must not be null
     * @return a {@link PhotoVerifyResult} describing the outcome
     */
    public PhotoVerifyResult verifyAndCheck(MultipartFile file) {
        if (file.isEmpty()) {
            return PhotoVerifyResult.FILE_EMPTY;
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            return PhotoVerifyResult.FILE_TOO_LARGE;
        }

        byte[] imageBytes;
        try {
            imageBytes = file.getBytes();
        } catch (IOException e) {
            log.warn("Failed to read uploaded file bytes", e);
            return PhotoVerifyResult.INVALID_IMAGE;
        }

        long phash;
        try {
            phash = computePhash(imageBytes);
        } catch (IOException e) {
            log.warn("Cannot decode image bytes as a known image format", e);
            return PhotoVerifyResult.INVALID_IMAGE;
        }

        if (isBlocked(phash)) {
            return PhotoVerifyResult.BLOCKED;
        }

        return PhotoVerifyResult.OK;
    }

    // -------------------------------------------------------------------------
    // computePhash — DCT-based perceptual hash
    // -------------------------------------------------------------------------

    /**
     * Computes a 64-bit DCT-based perceptual hash from raw image bytes.
     *
     * <p>Format detection is delegated to {@code ImageIO.read}: if the bytes cannot be decoded
     * as a recognised image format, {@code null} is returned and this method throws {@link IOException}.
     * This makes the format check immune to client-supplied {@code Content-Type} manipulation.
     *
     * @param imageBytes raw bytes of any image format supported by {@code ImageIO} (JPEG, PNG, etc.)
     * @return 64-bit perceptual hash (bit 0 is always 0 — DC coefficient excluded)
     * @throws IOException if {@code imageBytes} cannot be decoded as an image
     */
    public long computePhash(byte[] imageBytes) throws IOException {
        BufferedImage original = ImageIO.read(new ByteArrayInputStream(imageBytes));
        if (original == null) {
            throw new IOException("Cannot decode image — unsupported format or corrupt data");
        }

        // Resize to DCT_SIZE × DCT_SIZE grayscale
        BufferedImage small = new BufferedImage(DCT_SIZE, DCT_SIZE, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g = small.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.drawImage(original, 0, 0, DCT_SIZE, DCT_SIZE, null);
        g.dispose();

        // Extract pixel values
        double[][] pixels = new double[DCT_SIZE][DCT_SIZE];
        for (int y = 0; y < DCT_SIZE; y++) {
            for (int x = 0; x < DCT_SIZE; x++) {
                pixels[y][x] = small.getRaster().getSample(x, y, 0);
            }
        }

        // Apply 2D DCT-II
        double[][] dct = apply2dDct(pixels);

        // Extract top-left HASH_SIZE × HASH_SIZE submatrix (low-frequency components)
        double[] lowFreq = new double[HASH_SIZE * HASH_SIZE];
        for (int i = 0; i < HASH_SIZE; i++) {
            for (int j = 0; j < HASH_SIZE; j++) {
                lowFreq[i * HASH_SIZE + j] = dct[i][j];
            }
        }

        // Compute mean of non-DC coefficients (skip lowFreq[0] = DC term at [0][0])
        double sum = 0.0;
        for (int i = 1; i < lowFreq.length; i++) {
            sum += lowFreq[i];
        }
        double mean = sum / (lowFreq.length - 1);

        // Pack 63 bits: bit i (i ≥ 1) = 1 if lowFreq[i] ≥ mean.
        // Bit 0 is always 0 — the DC coefficient is excluded from both the mean
        // and the bitmask to avoid it dominating the AC threshold.
        long hash = 0L;
        for (int i = 1; i < lowFreq.length; i++) {
            if (lowFreq[i] >= mean) {
                hash |= (1L << i);
            }
        }

        log.debug("pHash computed: {}", hash);
        return hash;
    }

    // -------------------------------------------------------------------------
    // isBlocked — cached blocklist Hamming distance check
    // -------------------------------------------------------------------------

    /**
     * Returns {@code true} if the hash is within {@link #HAMMING_THRESHOLD} bits of any
     * entry in the blocklist.
     *
     * <p>The blocklist is loaded from the database at most once per {@link #CACHE_TTL_MS}
     * (double-checked locking). An empty blocklist always returns {@code false}.
     */
    public boolean isBlocked(long phash) {
        for (long blocked : getBlockedHashes()) {
            if (Long.bitCount(phash ^ blocked) <= HAMMING_THRESHOLD) {
                log.debug("Photo hash {} blocked (Hamming={})", phash, Long.bitCount(phash ^ blocked));
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the cached list of blocked pHashes, refreshing from the DB when the TTL has elapsed.
     */
    private List<Long> getBlockedHashes() {
        long now = System.currentTimeMillis();
        List<Long> cached = cachedBlocklist;
        if (cached != null && now - cacheLoadedAt <= CACHE_TTL_MS) {
            return cached;
        }
        synchronized (this) {
            // Re-check under lock in case another thread refreshed while we were waiting
            if (cachedBlocklist != null && System.currentTimeMillis() - cacheLoadedAt <= CACHE_TTL_MS) {
                return cachedBlocklist;
            }
            List<Long> fresh = blocklistRepository.findAll()
                    .stream().map(PhotoBlocklistEntry::getPhash).toList();
            cachedBlocklist = fresh;
            cacheLoadedAt = System.currentTimeMillis();
            log.debug("Photo blocklist cache refreshed: {} entries", fresh.size());
            return fresh;
        }
    }

    /**
     * Applies 2D DCT-II to a square matrix.
     * Normalization follows the orthonormal DCT-II convention.
     */
    private double[][] apply2dDct(double[][] pixels) {
        int n = pixels.length;
        double[][] dct = new double[n][n];
        double scale = 2.0 / n;

        for (int u = 0; u < n; u++) {
            double cu = (u == 0) ? 1.0 / Math.sqrt(2.0) : 1.0;
            for (int v = 0; v < n; v++) {
                double cv = (v == 0) ? 1.0 / Math.sqrt(2.0) : 1.0;
                double sum = 0.0;
                for (int i = 0; i < n; i++) {
                    for (int j = 0; j < n; j++) {
                        sum += pixels[i][j]
                                * Math.cos((2 * i + 1) * u * Math.PI / (2.0 * n))
                                * Math.cos((2 * j + 1) * v * Math.PI / (2.0 * n));
                    }
                }
                dct[u][v] = scale * cu * cv * sum;
            }
        }
        return dct;
    }
}
