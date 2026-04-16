/**
 * Load .env BEFORE any module that reads process.env at import-time.
 *
 * This file has no other exports — the `import './config/env'` side-effect
 * in server.ts (placed at the top of the import list) guarantees dotenv
 * runs before routes/services that might cache env-derived state.
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../.env') });
