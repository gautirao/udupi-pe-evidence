-- Schools table for school-first search and nearby schools overlay.
-- Stores known educational institutions in the Udupi district.

CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    board_type VARCHAR(50),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    district VARCHAR(100) DEFAULT 'Udupi',
    source VARCHAR(50) DEFAULT 'UDISE+',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for autocomplete search on name
CREATE INDEX IF NOT EXISTS idx_schools_name ON schools (name);

-- Composite index for spatial bounding-box queries
CREATE INDEX IF NOT EXISTS idx_schools_lat_lon ON schools (latitude, longitude);

-- Seed with real Udupi district educational institutions
INSERT INTO schools (name, board_type, latitude, longitude, address) VALUES
    ('Manipal Institute of Technology', 'AICTE', 13.3525, 74.7923, 'Manipal, Udupi'),
    ('Vidyodaya High School', 'State', 13.3409, 74.7421, 'Ajjarkad, Udupi'),
    ('Christ King PU College', 'State', 13.3433, 74.7456, 'Kunjibettu, Udupi'),
    ('Sri Bhuvanendra College', 'State', 13.3345, 74.7312, 'Karkala Road, Udupi'),
    ('Dr TMA Pai Composite PU College', 'State', 13.3521, 74.7935, 'Manipal, Udupi'),
    ('Sharada Vidyalaya', 'CBSE', 13.3511, 74.7871, 'Manipal, Udupi'),
    ('Basel Mission Higher Primary School', 'State', 13.3380, 74.7398, 'Car Street, Udupi'),
    ('MGM College Udupi', 'State', 13.3452, 74.7489, 'Shivalli, Udupi'),
    ('Poornaprajna College', 'State', 13.3398, 74.7435, 'Ajjarkad, Udupi'),
    ('Milagres PU College', 'State', 13.3461, 74.7382, 'Kallianpur, Udupi'),
    ('Manipal Academy of Higher Education', 'AICTE', 13.3515, 74.7868, 'Manipal, Udupi'),
    ('Kasturba Medical College', 'AICTE', 13.3498, 74.7862, 'Manipal, Udupi'),
    ('Sri Sharada PU College', 'State', 13.3385, 74.7405, 'Kalsanka, Udupi'),
    ('Jnanaganga PU College', 'State', 13.3267, 74.7478, 'Moodubelle, Udupi'),
    ('Sacred Heart High School', 'ICSE', 13.3448, 74.7365, 'Brahmavar Road, Udupi'),
    ('Board High School Udupi', 'State', 13.3412, 74.7428, 'Market Area, Udupi'),
    ('Vidyarashmi Vidyalaya', 'CBSE', 13.3505, 74.7840, 'Eshwar Nagar, Manipal'),
    ('Aloysius PU College', 'ICSE', 13.3370, 74.7950, 'Sastan, Udupi'),
    ('St Cecily''s PU College', 'State', 13.3360, 74.7360, 'Puttur, Udupi'),
    ('Bhandarkar''s College of Arts and Science', 'State', 13.3415, 74.7445, 'Kundapura Road, Udupi');
