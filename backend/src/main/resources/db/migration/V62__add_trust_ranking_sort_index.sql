CREATE INDEX idx_listings_trust_ranking
ON property_listings (trust_tier ASC, ranking_score DESC, created_at DESC);
