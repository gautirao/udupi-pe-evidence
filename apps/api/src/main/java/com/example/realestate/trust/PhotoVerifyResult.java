package com.example.realestate.trust;

/**
 * Result of a photo file verification attempt.
 *
 * @see PhotoHashService#verifyAndCheck(org.springframework.web.multipart.MultipartFile)
 */
public enum PhotoVerifyResult {
    /** Image bytes are valid, pHash computed, not in blocklist — ready to submit for review. */
    OK,
    /** File is empty (zero bytes). */
    FILE_EMPTY,
    /** File exceeds the configured size limit. */
    FILE_TOO_LARGE,
    /** File bytes cannot be decoded by ImageIO (corrupt, unsupported format, or unreadable). */
    INVALID_IMAGE,
    /** pHash matches a blocklist entry within the configured Hamming distance threshold. */
    BLOCKED
}
