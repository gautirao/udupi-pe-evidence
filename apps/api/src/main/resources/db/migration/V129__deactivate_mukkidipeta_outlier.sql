-- #2313: Mukkidipeta (area_key IN|KA|Bengaluru|Mukkidipeta) is a mis-geocoded outlier
-- (~66km from its North Bangalore siblings), stretching the d:n Direction's bounding box.
--
-- Root cause: a single mis-tagged property listing (locality "Mukkidipeta", actually near
-- Hindupur, Andhra Pradesh) was imported under the Bengaluru city geography. The areas row
-- cannot be hard-deleted (FK RESTRICT from property_listings), so this soft-excludes it via
-- lifecycle_status = 'INACTIVE'. Per AreaLifecycleStatus's contract, an INACTIVE area is never
-- hard-deleted and remains resolvable for schools/listings/agri-classification consumers —
-- only NavigationTreeGenerationService's areaByKey construction filters on ACTIVE status
-- (see that class), so this migration alone does not change navigation output until the next
-- navigation-tree regeneration for Bangalore.
--
-- Idempotent: safe to re-run: the WHERE clause naturally no-ops once the row is already
-- INACTIVE.
UPDATE areas
SET lifecycle_status = 'INACTIVE'
WHERE area_key = 'IN|KA|Bengaluru|Mukkidipeta'
  AND lifecycle_status <> 'INACTIVE';
