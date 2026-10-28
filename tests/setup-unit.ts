import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Hver testkørsel får sin egen, tomme datamappe.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "agency-unit-"));
process.env.PLATFORM_DEFAULT_MODE = "demo";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.BRAVE_SEARCH_API_KEY;
