CREATE TABLE workflows (
 id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','archived')),nodes_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(nodes_json)),edges_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(edges_json)),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(datetime('now')),updated_at TEXT NOT NULL DEFAULT(datetime('now')),published_at TEXT
);
CREATE INDEX idx_workflows_updated ON workflows(updated_at DESC,id);
CREATE TABLE workflow_versions(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,version INTEGER NOT NULL,nodes_json TEXT NOT NULL,edges_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),UNIQUE(workflow_id,version));
