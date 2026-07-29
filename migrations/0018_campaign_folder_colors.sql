ALTER TABLE campaign_folders ADD COLUMN color TEXT CHECK (color IS NULL OR (
  length(color) = 7 AND substr(color, 1, 1) = '#'
  AND lower(substr(color, 2)) NOT GLOB '*[^0-9a-f]*'
));
