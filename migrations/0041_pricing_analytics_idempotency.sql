ALTER TABLE pricing_analytics_points ADD COLUMN point_key TEXT;

-- Preserva linhas já gravadas localmente e passa a exigir unicidade determinística
-- para todos os novos pontos, inclusive quando dimensões opcionais são NULL.
UPDATE pricing_analytics_points SET point_key = id WHERE point_key IS NULL;

CREATE UNIQUE INDEX idx_pricing_analytics_point_key
ON pricing_analytics_points(point_key);
