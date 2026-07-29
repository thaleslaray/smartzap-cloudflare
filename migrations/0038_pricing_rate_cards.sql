CREATE TABLE pricing_rate_card_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  checksum TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staging' CHECK (status IN ('staging','active','failed')),
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0)
);

CREATE TABLE pricing_rate_cards (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES pricing_rate_card_imports(id) ON DELETE RESTRICT,
  source TEXT NOT NULL,
  checksum TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  currency TEXT NOT NULL,
  market TEXT NOT NULL,
  country_iso TEXT,
  category TEXT NOT NULL CHECK (category IN ('MARKETING','UTILITY','AUTHENTICATION','AUTHENTICATION_INTERNATIONAL','SERVICE')),
  tier_from INTEGER NOT NULL DEFAULT 0 CHECK (tier_from >= 0),
  tier_to INTEGER CHECK (tier_to IS NULL OR tier_to >= tier_from),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(import_id, market, category, tier_from)
);

CREATE INDEX idx_pricing_rate_cards_lookup
ON pricing_rate_cards(currency, market, category, effective_from, effective_to, tier_from);
