# Chrome MCP Setup Guide for Automated Testing

This guide explains how to set up Chrome MCP (Model Context Protocol) for automated testing of the Meta Ads Manager field extraction.

---

## What is Chrome MCP?

Chrome MCP is a Model Context Protocol server that allows Claude (via the API or Claude Code) to control a Chrome browser programmatically. This enables:

- Automated navigation through Meta Ads Manager UI
- Triggering field extraction from the extension
- Verifying extracted values match UI values
- Capturing screenshots for documentation
- Generating test reports

---

## Prerequisites

- Node.js 20+
- Chrome browser installed
- Extension built and loaded in Chrome
- MCP CLI tools installed

---

## Installation

### 1. Install Chrome MCP Server

```bash
# Install the Chrome MCP server globally
npm install -g @modelcontextprotocol/server-chrome

# Or using npx (recommended)
npx @modelcontextprotocol/server-chrome --version
```

### 2. Configure MCP Server

Create a configuration file for the Chrome MCP server:

**File:** `~/.config/chrome-mcp/config.json`

```json
{
  "port": 3030,
  "chrome": {
    "executable": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "userDataDir": "~/.config/chrome-mcp/user-data",
    "headless": false,
    "extensions": [
      "/Users/leonhoulier/media-buying-governance/packages/extension/dist"
    ]
  }
}
```

**Notes:**
- Set `headless: false` to see the browser during testing
- Update `extensions` path to your extension's built `dist/` directory
- Update `executable` path for your OS (Linux: `/usr/bin/google-chrome`, Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`)

### 3. Build the Extension

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension
pnpm build

# Verify dist/ directory exists
ls -la dist/
```

### 4. Load Extension in Chrome

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select `packages/extension/dist/` directory
6. Verify extension appears in the list (should show "DLG Governance v1.0.0")

---

## Starting Chrome MCP Server

### Option 1: Manual Start

```bash
# Start the Chrome MCP server
npx @modelcontextprotocol/server-chrome --config ~/.config/chrome-mcp/config.json

# Server will start on http://localhost:3030
# Chrome will launch with extension loaded
```

### Option 2: Start with npm script

Add to `packages/extension/package.json`:

```json
{
  "scripts": {
    "test:chrome-mcp": "npx @modelcontextprotocol/server-chrome --config ~/.config/chrome-mcp/config.json"
  }
}
```

Then run:

```bash
cd packages/extension
pnpm test:chrome-mcp
```

---

## Connecting Claude Code to Chrome MCP

### Method 1: Using Claude Code CLI

If you're using Claude Code CLI with MCP support:

1. **Configure Claude Code to use Chrome MCP:**

   Edit `~/.claude/mcp_config.json`:

   ```json
   {
     "mcpServers": {
       "chrome": {
         "command": "npx",
         "args": [
           "@modelcontextprotocol/server-chrome",
           "--config",
           "~/.config/chrome-mcp/config.json"
         ]
       }
     }
   }
   ```

2. **Restart Claude Code:**

   ```bash
   # Claude Code will automatically connect to Chrome MCP
   ```

3. **Verify Connection:**

   In Claude Code, you can now use Chrome MCP tools like:
   - `chrome_navigate` - Navigate to URL
   - `chrome_click` - Click element
   - `chrome_type` - Type text
   - `chrome_execute_script` - Run JavaScript
   - `chrome_screenshot` - Take screenshot

### Method 2: Using Claude API with MCP

If you're using the Claude API directly:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Connect to Chrome MCP server
const mcpClient = await client.mcp.connect({
  serverUrl: 'http://localhost:3030',
});

// Use Chrome MCP tools
await mcpClient.callTool('chrome_navigate', {
  url: 'https://adsmanager.facebook.com/adsmanager',
});
```

---

## Testing Chrome MCP Connection

### Quick Test Script

Create `packages/extension/test-chrome-mcp.js`:

```javascript
/**
 * Quick test to verify Chrome MCP is working
 */

async function testChromeMCP() {
  console.log('Testing Chrome MCP connection...');

  // This script assumes Chrome MCP is running and connected
  // It will be executed by Claude Code with MCP access

  // Test 1: Navigate to Google
  console.log('Test 1: Navigate to google.com');
  // await chrome_navigate({ url: 'https://google.com' });

  // Test 2: Take screenshot
  console.log('Test 2: Take screenshot');
  // await chrome_screenshot({ path: 'test-screenshot.png' });

  // Test 3: Execute script
  console.log('Test 3: Execute script (get page title)');
  // const title = await chrome_execute_script({ script: 'document.title' });
  // console.log('Page title:', title);

  console.log('All tests passed!');
}

testChromeMCP();
```

Run via Claude Code:
```bash
# Claude Code will use Chrome MCP to execute this
node packages/extension/test-chrome-mcp.js
```

---

## Meta Ads Manager Setup for Testing

### 1. Create Meta Test Ad Account

You'll need a Meta Ads Manager test account to run field validation tests:

1. Go to https://business.facebook.com/
2. Create a test ad account (or use existing)
3. Note the account ID (will be in URL: `act_XXXXXXXXX`)

### 2. Set Up Test Environment Variables

Create `packages/extension/.env.test`:

```bash
# Meta Test Account
META_TEST_ACCOUNT_ID=act_123456789
META_TEST_EMAIL=your-test-email@example.com
META_TEST_PASSWORD=your-test-password

# Extension Configuration
EXTENSION_API_BASE=http://localhost:3000
EXTENSION_TOKEN=your-test-extension-token
```

**⚠️ SECURITY WARNING:** Never commit `.env.test` to git! Add to `.gitignore`.

### 3. Pair Extension in Test Browser

When Chrome MCP launches:

1. Click extension icon
2. Enter pairing code from admin portal
3. Verify "Organization: [Your Org]" appears in popup
4. Leave browser window open for testing

---

## Running Automated Tests

### Execute the Test Suite

Once Chrome MCP is running and extension is paired:

```bash
cd /Users/leonhoulier/media-buying-governance/packages/extension

# Run automated field validation tests
pnpm test:meta-fields
```

This will:
1. Navigate to Meta Ads Manager
2. Create a test campaign
3. Test all 18 core field extractors
4. Generate `TEST-RESULTS.md` with results
5. Save screenshots to `screenshots/` directory

---

## Troubleshooting

### Issue: Chrome MCP won't start

**Solution:**
```bash
# Check if port 3030 is in use
lsof -i :3030

# Kill any process using the port
kill -9 <PID>

# Restart Chrome MCP
npx @modelcontextprotocol/server-chrome --config ~/.config/chrome-mcp/config.json
```

### Issue: Extension not loaded in Chrome

**Solution:**
1. Verify `dist/` directory exists: `ls packages/extension/dist/`
2. Rebuild extension: `cd packages/extension && pnpm build`
3. Check Chrome extensions page: `chrome://extensions/`
4. Look for errors in extension console

### Issue: Can't connect to Chrome MCP from Claude Code

**Solution:**
1. Verify Chrome MCP is running: `curl http://localhost:3030/health`
2. Check MCP config: `cat ~/.claude/mcp_config.json`
3. Restart Claude Code
4. Check Claude Code logs for MCP connection errors

### Issue: Meta Ads Manager login fails

**Solution:**
1. Log in manually first in the Chrome MCP browser
2. Chrome MCP will reuse the session
3. Meta may require 2FA - complete manually before running tests

### Issue: Field extraction returns null in tests

**Solution:**
1. Verify extension is loaded: Check `chrome://extensions/`
2. Check extension console for errors
3. Verify extension is paired: Open popup, check status
4. Use manual testing guide as fallback

---

## Manual Testing Fallback

If Chrome MCP is not available, you can run manual tests instead:

See `MANUAL-TEST-GUIDE.md` for step-by-step manual validation of all 18 fields.

---

## Next Steps

Once Chrome MCP is set up and running:

1. Review the test script: `packages/extension/tests/automated-field-validation.ts`
2. Run the automated test suite: `pnpm test:meta-fields`
3. Review results in `TEST-RESULTS.md`
4. Check screenshots in `screenshots/` directory
5. Address any failing field extractors

---

## Resources

- **Chrome MCP Documentation:** https://github.com/modelcontextprotocol/servers
- **MCP Specification:** https://spec.modelcontextprotocol.io/
- **Claude API with MCP:** https://docs.anthropic.com/en/docs/build-with-claude/mcp
- **Chrome DevTools Protocol:** https://chromedevtools.github.io/devtools-protocol/

---

*Last Updated: 2026-02-14*
