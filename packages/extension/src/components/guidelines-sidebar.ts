/**
 * Guidelines Sidebar Component (Backward Compatibility Re-export)
 *
 * The canonical sidebar implementation is now in `./sidebar.ts`.
 * This file re-exports the `Sidebar` class as `GuidelinesSidebar`
 * so that existing imports in injector.ts and adapter code continue
 * to work without modification.
 *
 * @module guidelines-sidebar
 */

import { Sidebar } from './sidebar.js';
import type { ScrollToFieldCallback } from './sidebar.js';

/**
 * @deprecated Use `Sidebar` from `./sidebar.js` instead.
 *
 * Re-exported as GuidelinesSidebar for backward compatibility.
 */
export class GuidelinesSidebar extends Sidebar {}

export type { ScrollToFieldCallback };
