/**
 * Extension Popup Script
 *
 * Controls the popup UI shown when clicking the extension icon.
 *
 * Two views:
 * 1. **Pairing View** - Shown when the extension is not yet paired.
 *    Displays an invite code input and a "Connect" button.
 * 2. **Main View** - Shown when paired. Displays org info, sync status,
 *    Force Refresh, Toggle Sidebar, and Disconnect buttons.
 */

/** Admin portal URL — injected at build time from .env.production */
const ADMIN_PORTAL_URL = typeof process !== "undefined" && process.env?.VITE_ADMIN_PORTAL_URL || 'http://localhost:5173';

/** SVG icon for the refresh button */
const REFRESH_ICON_SVG = `
  <svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14">
    <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0A5.5 5.5 0 008 2.5zM2.5 8a.75.75 0 00-1.5 0 7.001 7.001 0 0012.193 4.693l1.38 1.38a.25.25 0 00.427-.177V10.25a.25.25 0 00-.25-.25h-3.646a.25.25 0 00-.177.427l1.204 1.204A5.487 5.487 0 018 13.5 5.5 5.5 0 012.5 8z"/>
  </svg>`;

interface ExtractionSnapshotField {
  fieldPath: string;
  hasValue: boolean;
  selectorConfigured: boolean;
  selectorFound: boolean | null;
  valuePreview: string;
  valueType: 'null' | 'string' | 'number' | 'boolean' | 'array' | 'object';
}

interface ExtractionSnapshot {
  platform: string;
  capturedAt: string;
  totalFields: number;
  extractedFields: number;
  selectorHits: number;
  missingWithSelector: number;
  missingWithoutSelector: number;
  fields: ExtractionSnapshotField[];
}

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the popup
 */
async function initializePopup(): Promise<void> {
  try {
    // Update version display
    const versionEl = document.getElementById('version');
    if (versionEl) {
      const manifest = chrome.runtime.getManifest();
      versionEl.textContent = `v${manifest.version}`;
    }

    // Set up admin portal link
    const adminLink = document.getElementById('admin-link') as HTMLAnchorElement | null;
    if (adminLink) {
      adminLink.href = ADMIN_PORTAL_URL;
    }

    // Check if the extension is paired
    const storage = await chrome.storage.local.get('extensionToken');
    const isPaired = !!storage.extensionToken;

    if (isPaired) {
      await showMainView();
    } else {
      showPairingView();
    }
  } catch (err) {
    showError(String(err));
  }
}

// Run initialization when DOM is ready (or immediately if already ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  // DOM is already loaded, run immediately
  initializePopup();
}

// ─── Pairing View ──────────────────────────────────────────────────────────

/**
 * Show the pairing view and set up event listeners
 */
function showPairingView(): void {
  const loadingEl = document.getElementById('loading');
  const pairingView = document.getElementById('pairing-view');
  const bodyEl = document.getElementById('body');

  if (loadingEl) loadingEl.style.display = 'none';
  if (pairingView) pairingView.style.display = 'block';
  if (bodyEl) bodyEl.style.display = 'none';

  setupPairingListeners();
}

/**
 * Set up event listeners for the pairing form
 */
function setupPairingListeners(): void {
  const pairBtn = document.getElementById('btn-pair');
  const inviteInput = document.getElementById('invite-code') as HTMLInputElement | null;

  pairBtn?.addEventListener('click', () => handlePair());

  // Allow Enter key to submit
  inviteInput?.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handlePair();
    }
  });
}

/**
 * Handle the pairing form submission
 */
async function handlePair(): Promise<void> {
  const inviteInput = document.getElementById('invite-code') as HTMLInputElement | null;
  const pairBtn = document.getElementById('btn-pair');
  const pairingError = document.getElementById('pairing-error');
  const pairingSuccess = document.getElementById('pairing-success');

  if (!inviteInput) return;

  const inviteCode = inviteInput.value.trim();
  if (!inviteCode) {
    showPairingError('Please enter an invite code.');
    return;
  }

  // Hide previous messages
  if (pairingError) pairingError.style.display = 'none';
  if (pairingSuccess) pairingSuccess.style.display = 'none';

  // Disable form during request
  if (pairBtn) {
    pairBtn.setAttribute('disabled', 'true');
    pairBtn.textContent = 'Connecting...';
  }
  if (inviteInput) inviteInput.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'pairExtension',
      inviteCode,
    }) as { success: boolean; organization?: { id: string; name: string; slug: string }; error?: string };

    if (result.success && result.organization) {
      // Show success message briefly, then switch to main view
      showPairingSuccess(`Connected to ${result.organization.name}`);

      setTimeout(async () => {
        await showMainView();
      }, 1200);
    } else {
      showPairingError(result.error ?? 'Pairing failed. Check your invite code and try again.');
      // Re-enable form
      if (pairBtn) {
        pairBtn.removeAttribute('disabled');
        pairBtn.textContent = 'Connect Extension';
      }
      if (inviteInput) inviteInput.disabled = false;
    }
  } catch (err) {
    showPairingError(`Connection failed: ${err}`);
    // Re-enable form
    if (pairBtn) {
      pairBtn.removeAttribute('disabled');
      pairBtn.textContent = 'Connect Extension';
    }
    if (inviteInput) inviteInput.disabled = false;
  }
}

/**
 * Show an error in the pairing view
 */
function showPairingError(message: string): void {
  const el = document.getElementById('pairing-error');
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
  }
}

/**
 * Show a success message in the pairing view
 */
function showPairingSuccess(message: string): void {
  const el = document.getElementById('pairing-success');
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
  }
}

// ─── Main View ───────────────────────────────────────────────────────────────

/**
 * Show the main view with status and controls
 */
async function showMainView(): Promise<void> {
  const loadingEl = document.getElementById('loading');
  const pairingView = document.getElementById('pairing-view');
  const bodyEl = document.getElementById('body');

  if (loadingEl) loadingEl.style.display = 'none';
  if (pairingView) pairingView.style.display = 'none';
  if (bodyEl) bodyEl.style.display = 'block';

  await loadStatus();
  setupMainListeners();
}

/**
 * Load current status from the service worker
 */
async function loadStatus(): Promise<void> {
  try {
    // Get sync status from service worker (with 3s timeout to avoid hanging popup)
    const statusPromise = chrome.runtime.sendMessage({ type: 'getSyncStatus' });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Service worker timeout')), 3000)
    );
    const status = await Promise.race([statusPromise, timeoutPromise]) as {
      orgName: string | null;
      orgId: string | null;
      activeAccountId: string | null;
      version: string;
    };

    // Update organization name
    const orgEl = document.getElementById('org-name');
    if (orgEl) {
      if (status.orgName) {
        orgEl.textContent = status.orgName;
        orgEl.classList.remove('popup__value--empty');
      } else {
        orgEl.textContent = 'Not paired';
        orgEl.classList.add('popup__value--empty');
      }
    }

    // Update active account
    const accountEl = document.getElementById('account-id');
    if (accountEl) {
      if (status.activeAccountId) {
        accountEl.textContent = status.activeAccountId;
        accountEl.classList.remove('popup__value--empty');
      } else {
        accountEl.textContent = 'No active account';
        accountEl.classList.add('popup__value--empty');
      }
    }

    // Update sync status
    updateSyncStatus('synced');
  } catch (err) {
    showError('Failed to load status. Extension may not be fully initialized.');
    updateSyncStatus('error');
  }
}

/**
 * Set up event listeners for the main view buttons
 */
function setupMainListeners(): void {
  // Force Refresh button
  const refreshBtn = document.getElementById('btn-refresh');
  refreshBtn?.addEventListener('click', handleForceRefresh);

  // Toggle Sidebar button
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  toggleBtn?.addEventListener('click', handleToggleSidebar);

  // Disconnect button
  const unpairBtn = document.getElementById('btn-unpair');
  unpairBtn?.addEventListener('click', handleUnpair);

  // Selector Debug Mode button
  const debugBtn = document.getElementById('btn-debug-mode');
  debugBtn?.addEventListener('click', handleToggleDebugMode);

  // Live extraction snapshot button
  const snapshotBtn = document.getElementById('btn-capture-snapshot');
  snapshotBtn?.addEventListener('click', handleCaptureSnapshot);

  // Selector Health toggle
  const shToggle = document.getElementById('selector-health-toggle');
  shToggle?.addEventListener('click', toggleSelectorHealth);

  // Selector Health clear button
  const shClear = document.getElementById('sh-clear');
  shClear?.addEventListener('click', clearSelectorTelemetry);

  // Load selector health data
  loadSelectorHealth();
}

// ─── Button Handlers ───────────────────────────────────────────────────────

/**
 * Handle Force Refresh button click.
 *
 * 1. Disable button and show "Refreshing..." state
 * 2. Send forceRefresh to service worker (clears IndexedDB, re-fetches)
 * 3. Notify active content script to re-evaluate
 * 4. Show success/error feedback
 */
async function handleForceRefresh(): Promise<void> {
  const refreshBtn = document.getElementById('btn-refresh');
  if (!refreshBtn) return;

  refreshBtn.setAttribute('disabled', 'true');
  refreshBtn.textContent = 'Refreshing...';

  try {
    const storage = await chrome.storage.local.get('activeAccountId');
    const accountId = storage.activeAccountId as string | undefined;

    if (!accountId) {
      showFeedback('No active account to refresh.', 'error');
      return;
    }

    const result = await chrome.runtime.sendMessage({
      type: 'forceRefresh',
      accountId,
    }) as { error?: string } | null;

    if (result && 'error' in result) {
      showFeedback(result.error as string, 'error');
      updateSyncStatus('error');
    } else {
      updateSyncStatus('synced');
      showFeedback('Rules refreshed successfully.', 'success');

      // Notify active tab's content script to re-evaluate
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'forceRefresh' });
        }
      } catch {
        // Content script may not be loaded on the current tab
      }
    }
  } catch (err) {
    showFeedback(`Refresh failed: ${err}`, 'error');
    updateSyncStatus('error');
  } finally {
    refreshBtn.removeAttribute('disabled');
    refreshBtn.innerHTML = `${REFRESH_ICON_SVG} Force Refresh`;
  }
}

/**
 * Handle Toggle Sidebar button click
 */
async function handleToggleSidebar(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'toggleSidebar' });
    }
  } catch {
    // Content script may not be loaded on current tab
  }
}

/**
 * Handle Disconnect (unpair) button click.
 *
 * Clears all stored credentials and shows the pairing view.
 */
async function handleUnpair(): Promise<void> {
  const unpairBtn = document.getElementById('btn-unpair');

  // Confirm action
  if (unpairBtn?.textContent === 'Disconnect Extension') {
    unpairBtn.textContent = 'Click again to confirm';
    unpairBtn.classList.add('popup__btn--primary');
    setTimeout(() => {
      if (unpairBtn.textContent === 'Click again to confirm') {
        unpairBtn.textContent = 'Disconnect Extension';
        unpairBtn.classList.remove('popup__btn--primary');
      }
    }, 3000);
    return;
  }

  if (unpairBtn) {
    unpairBtn.setAttribute('disabled', 'true');
    unpairBtn.textContent = 'Disconnecting...';
  }

  try {
    await chrome.runtime.sendMessage({ type: 'unpairExtension' });
    showPairingView();
  } catch (err) {
    showError(`Failed to disconnect: ${err}`);
    if (unpairBtn) {
      unpairBtn.removeAttribute('disabled');
      unpairBtn.textContent = 'Disconnect Extension';
      unpairBtn.classList.remove('popup__btn--primary');
    }
  }
}

// ─── Selector Debug Mode ─────────────────────────────────────────────────────

/** Whether selector debug mode is currently enabled */
let debugModeEnabled = false;

/**
 * Handle Selector Debug Mode toggle.
 *
 * Sends a message to the active tab's content script to enable or disable
 * visual debug overlays on selector-matched DOM elements.
 */
async function handleToggleDebugMode(): Promise<void> {
  const debugBtn = document.getElementById('btn-debug-mode');
  if (!debugBtn) return;

  debugModeEnabled = !debugModeEnabled;
  debugBtn.textContent = `Selector Debug Mode: ${debugModeEnabled ? 'ON' : 'OFF'}`;

  if (debugModeEnabled) {
    debugBtn.classList.add('active');
  } else {
    debugBtn.classList.remove('active');
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'toggleDebugMode',
        enabled: debugModeEnabled,
      });
    }
  } catch {
    // Content script may not be loaded on current tab
    showFeedback('No ad platform page active.', 'error');
    // Revert toggle state
    debugModeEnabled = !debugModeEnabled;
    debugBtn.textContent = `Selector Debug Mode: ${debugModeEnabled ? 'ON' : 'OFF'}`;
    if (debugModeEnabled) {
      debugBtn.classList.add('active');
    } else {
      debugBtn.classList.remove('active');
    }
  }
}

/**
 * Capture a live field extraction snapshot from the active content script.
 *
 * This helps diagnose the exact Meta mismatch category:
 * selector drift vs extraction/normalization drift.
 */
async function handleCaptureSnapshot(): Promise<void> {
  const snapshotBtn = document.getElementById('btn-capture-snapshot');
  if (!snapshotBtn) return;

  snapshotBtn.setAttribute('disabled', 'true');
  snapshotBtn.textContent = 'Capturing...';

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showFeedback('No active tab available.', 'error');
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'captureExtractionSnapshot',
    }) as { success: boolean; snapshot?: ExtractionSnapshot; error?: string };

    if (!response.success || !response.snapshot) {
      showFeedback(response.error ?? 'Snapshot capture failed.', 'error');
      return;
    }

    renderExtractionSnapshot(response.snapshot);
    showFeedback('Live extraction snapshot captured.', 'success');
  } catch {
    showFeedback('No supported Meta tab is active.', 'error');
  } finally {
    snapshotBtn.removeAttribute('disabled');
    snapshotBtn.textContent = 'Capture Live Snapshot';
  }
}

// ─── Selector Health ─────────────────────────────────────────────────────────

/**
 * Load and display selector health telemetry data
 */
async function loadSelectorHealth(): Promise<void> {
  const container = document.getElementById('selector-health');
  if (!container) return;

  try {
    // Import telemetry functions dynamically
    const { getFieldExtractionStats, getSSEHealthMetrics, getComplianceEventStats } =
      await import('../utils/telemetry.js');

    const selectorHealth = await chrome.runtime.sendMessage({
      type: 'getSelectorHealth',
    }) as {
      totalLookups: number;
      successCount: number;
      failureCount: number;
      successRate: number;
      failingFields: Array<{ fieldPath: string; platform: string; failureCount: number }>;
      recentFailures: Array<{ selector: string; platform: string; fieldPath: string; timestamp: string }>;
    };

    // Get telemetry data
    const fieldStats = await getFieldExtractionStats();
    const sseHealth = await getSSEHealthMetrics();
    const complianceStats = await getComplianceEventStats();

    // Show the section (even if no data yet)
    container.style.display = 'block';

    // Update stats
    const successRateEl = document.getElementById('sh-success-rate');
    const totalEl = document.getElementById('sh-total');
    const failuresEl = document.getElementById('sh-failures');

    if (successRateEl) {
      successRateEl.textContent = `${selectorHealth.successRate}%`;
      successRateEl.className = 'selector-health__stat-value';
      const rate = selectorHealth.successRate;
      if (rate >= 95) {
        successRateEl.classList.add('selector-health__stat-value--good');
      } else if (rate >= 80) {
        successRateEl.classList.add('selector-health__stat-value--warn');
      } else {
        successRateEl.classList.add('selector-health__stat-value--bad');
      }
    }

    if (totalEl) {
      totalEl.textContent = String(selectorHealth.totalLookups);
    }

    if (failuresEl) {
      const failureCount = selectorHealth.failureCount;
      failuresEl.textContent = String(failureCount);
      failuresEl.className = 'selector-health__stat-value';
      if (failureCount === 0) {
        failuresEl.classList.add('selector-health__stat-value--good');
      } else {
        failuresEl.classList.add('selector-health__stat-value--bad');
      }
    }

    // Render detailed statistics
    const failingFieldsEl = document.getElementById('sh-failing-fields');
    if (failingFieldsEl) {
      const strategyBreakdown = Object.entries(fieldStats.byStrategy)
        .map(([strategy, stats]) => ({
          strategy,
          count: stats.count,
          percentage: stats.percentage.toFixed(1),
        }))
        .sort((a, b) => b.count - a.count);

      const failingFields = selectorHealth.failingFields.slice(0, 5);
      const recentFailures = selectorHealth.recentFailures.slice(0, 3);

      const html = `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #6B7280; margin-bottom: 6px;">Top Selector Failures</div>
          ${failingFields.length > 0
            ? failingFields
              .map(
                (entry) => `
                  <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
                    <span style="color: #1F2937; font-family: 'SF Mono', 'Menlo', monospace;">${escapeHtml(entry.fieldPath)}</span>
                    <span style="color: #DC2626;">${entry.failureCount}</span>
                  </div>`
              )
              .join('')
            : '<div style="font-size: 11px; color: #6B7280;">No selector failures captured yet.</div>'}
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #6B7280; margin-bottom: 6px;">Field Extraction Strategy</div>
          ${strategyBreakdown.length > 0
            ? strategyBreakdown
              .map(
                (s) => `
                  <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
                    <span style="color: #1F2937; text-transform: capitalize;">${escapeHtml(s.strategy)}</span>
                    <span style="color: #6B7280;">${s.count} (${s.percentage}%)</span>
                  </div>`
              )
              .join('')
            : '<div style="font-size: 11px; color: #6B7280;">No extraction telemetry captured yet.</div>'}
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #6B7280; margin-bottom: 6px;">SSE Connection</div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
            <span style="color: #1F2937;">Status</span>
            <span style="color: ${sseHealth.state === 'connected' ? '#16A34A' : '#DC2626'}; text-transform: capitalize;">${escapeHtml(sseHealth.state)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
            <span style="color: #1F2937;">Messages Received</span>
            <span style="color: #6B7280;">${sseHealth.messagesReceived}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
            <span style="color: #1F2937;">Avg Latency</span>
            <span style="color: #6B7280;">${sseHealth.averageLatencyMs.toFixed(0)}ms</span>
          </div>
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #6B7280; margin-bottom: 6px;">Compliance Events</div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
            <span style="color: #1F2937;">Success Rate</span>
            <span style="color: ${complianceStats.successRate >= 95 ? '#16A34A' : complianceStats.successRate >= 80 ? '#CA8A04' : '#DC2626'};">${complianceStats.successRate.toFixed(1)}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px;">
            <span style="color: #1F2937;">Total / Success / Failure</span>
            <span style="color: #6B7280;">${complianceStats.total} / ${complianceStats.successCount} / ${complianceStats.failureCount}</span>
          </div>
        </div>
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #6B7280; margin-bottom: 6px;">Recent Selector Misses</div>
          ${recentFailures.length > 0
            ? recentFailures
              .map(
                (entry) => `
                  <div style="padding: 3px 0; font-size: 10px; color: #6B7280;">
                    <div style="color: #1F2937; font-family: 'SF Mono', 'Menlo', monospace;">${escapeHtml(entry.fieldPath)}</div>
                    <div>${escapeHtml(entry.selector)}</div>
                  </div>`
              )
              .join('')
            : '<div style="font-size: 11px; color: #6B7280;">No selector miss samples yet.</div>'}
        </div>
        <div style="font-size: 10px; color: #9CA3AF; margin-top: 8px;">
          Last 24 hours • Avg extraction: ${fieldStats.avgDurationMs.toFixed(0)}ms
        </div>
      `;

      failingFieldsEl.innerHTML = html;
    }
  } catch (err) {
    // Silently fail -- telemetry is non-critical
    console.error('Failed to load selector health:', err);
  }
}

/**
 * Render a live extraction snapshot captured from the active tab.
 */
function renderExtractionSnapshot(snapshot: ExtractionSnapshot): void {
  const container = document.getElementById('extraction-snapshot');
  const summaryEl = document.getElementById('snapshot-summary');
  const mismatchEl = document.getElementById('snapshot-mismatches');
  const valuesEl = document.getElementById('snapshot-values');
  const timestampEl = document.getElementById('snapshot-timestamp');

  if (!container || !summaryEl || !mismatchEl || !valuesEl || !timestampEl) {
    return;
  }

  container.style.display = 'block';
  timestampEl.textContent = new Date(snapshot.capturedAt).toLocaleTimeString();

  summaryEl.innerHTML = `
    <div class="snapshot-panel__stat">
      <span class="snapshot-panel__stat-value">${snapshot.extractedFields}/${snapshot.totalFields}</span>
      <span class="snapshot-panel__stat-label">Extracted</span>
    </div>
    <div class="snapshot-panel__stat">
      <span class="snapshot-panel__stat-value">${snapshot.selectorHits}</span>
      <span class="snapshot-panel__stat-label">Selector Hits</span>
    </div>
    <div class="snapshot-panel__stat">
      <span class="snapshot-panel__stat-value">${snapshot.missingWithSelector}</span>
      <span class="snapshot-panel__stat-label">Getter Gaps</span>
    </div>
    <div class="snapshot-panel__stat">
      <span class="snapshot-panel__stat-value">${snapshot.missingWithoutSelector}</span>
      <span class="snapshot-panel__stat-label">Selector Gaps</span>
    </div>
  `;

  const selectorOnly = snapshot.fields
    .filter((field) => !field.hasValue && field.selectorFound === true)
    .slice(0, 6);
  const selectorMissing = snapshot.fields
    .filter((field) => !field.hasValue && field.selectorFound === false)
    .slice(0, 6);
  const extractedValues = snapshot.fields
    .filter((field) => field.hasValue)
    .slice(0, 8);

  mismatchEl.innerHTML = [
    renderSnapshotGroup(
      'Selector matched, value missing',
      selectorOnly.map((field) => ({
        label: field.fieldPath,
        meta: 'Check getter or normalization',
      })),
      'No getter-side gaps in this capture.',
    ),
    renderSnapshotGroup(
      'Selector missing',
      selectorMissing.map((field) => ({
        label: field.fieldPath,
        meta: 'Check selector coverage',
      })),
      'No selector gaps in this capture.',
    ),
  ].join('');

  valuesEl.innerHTML = renderSnapshotGroup(
    `${snapshot.platform} extracted values`,
    extractedValues.map((field) => ({
      label: field.fieldPath,
      meta: `${field.valueType} • ${field.valuePreview}`,
    })),
    'No field values were extracted in this capture.',
  );
}

function renderSnapshotGroup(
  title: string,
  entries: Array<{ label: string; meta: string }>,
  emptyState: string,
): string {
  return `
    <div class="snapshot-panel__group">
      <div class="snapshot-panel__group-title">${escapeHtml(title)}</div>
      ${entries.length > 0
        ? entries
          .map(
            (entry) => `
              <div class="snapshot-panel__item">
                <div class="snapshot-panel__item-label">${escapeHtml(entry.label)}</div>
                <div class="snapshot-panel__item-meta">${escapeHtml(entry.meta)}</div>
              </div>`
          )
          .join('')
        : `<div class="snapshot-panel__empty">${escapeHtml(emptyState)}</div>`}
    </div>
  `;
}

/**
 * Toggle the selector health detail panel
 */
function toggleSelectorHealth(): void {
  const body = document.getElementById('selector-health-body');
  const arrow = document.getElementById('selector-health-arrow');

  if (body && arrow) {
    const isExpanded = body.classList.contains('expanded');
    body.classList.toggle('expanded');
    arrow.textContent = isExpanded ? 'Show' : 'Hide';
  }
}

/**
 * Clear all selector telemetry data
 */
async function clearSelectorTelemetry(): Promise<void> {
  try {
    const { clearAllTelemetry } = await import('../utils/telemetry.js');
    await Promise.all([
      clearAllTelemetry(),
      chrome.runtime.sendMessage({ type: 'clearSelectorTelemetry' }),
    ]);
    await loadSelectorHealth();
    showFeedback('Telemetry data cleared.', 'success');
  } catch (err) {
    console.error('Failed to clear telemetry:', err);
    showFeedback('Failed to clear telemetry data.', 'error');
  }
}

/**
 * Escape HTML characters for safe rendering
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── UI Helpers ──────────────────────────────────────────────────────────────

/**
 * Update the sync status indicator
 */
function updateSyncStatus(status: 'synced' | 'pending' | 'error'): void {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-status');

  if (dot) {
    dot.className = 'popup__status-dot';
    dot.classList.add(`popup__status-dot--${status}`);
  }

  if (text) {
    switch (status) {
      case 'synced':
        text.textContent = `Synced at ${new Date().toLocaleTimeString()}`;
        break;
      case 'pending':
        text.textContent = 'Syncing...';
        break;
      case 'error':
        text.textContent = 'Sync failed';
        break;
    }
  }
}

/**
 * Show a feedback message (success or error) in the main view
 */
function showFeedback(message: string, type: 'success' | 'error'): void {
  const el = document.getElementById('feedback');
  if (el) {
    el.textContent = message;
    el.className = `feedback--${type}`;

    // Auto-hide after 4 seconds
    setTimeout(() => {
      el.style.display = 'none';
      el.className = '';
    }, 4000);
  }
}

/**
 * Show an error message in the main view
 */
function showError(message: string): void {
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

/**
 * Hide the error message
 */
function hideError(): void {
  const errorEl = document.getElementById('error');
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}
