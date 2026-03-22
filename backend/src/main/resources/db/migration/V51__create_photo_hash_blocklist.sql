-- Photo hash blocklist for Photos badge verification.
-- Stores DCT-based perceptual hashes of known stock/blocked images.
-- Hamming distance <= 10 against any entry = blocked.
CREATE TABLE IF NOT EXISTS photo_hash_blocklist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phash       BIGINT NOT NULL,
    description VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_hash_blocklist_phash ON photo_hash_blocklist (phash);
