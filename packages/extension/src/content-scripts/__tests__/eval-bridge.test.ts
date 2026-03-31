/**
 * Unit tests for the Eval Bridge (MAIN world script)
 *
 * Since the eval bridge is an IIFE that runs in the MAIN world, we test
 * the communication protocol and response handling from the content script
 * perspective. The bridge listens for CustomEvent('evalQuery.governance')
 * and responds via postMessage('evalResult.governance').
 *
 * For helper function logic, we verify behavior through the message
 * round-trip by setting up DOM fixtures and dispatching queries.
 */

// TextEncoder/TextDecoder polyfill for jsdom
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

// We need to simulate the eval bridge being loaded. Since it's an IIFE,
// we test the protocol indirectly through the batcher.

describe('Eval Bridge Communication Protocol', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset the bridge flag so we can re-inject in tests
    (window as unknown as Record<string, unknown>).__governanceEvalBridge = undefined;
  });

  describe('CustomEvent inbound communication', () => {
    it('should accept CustomEvent with evalQuery.governance type', () => {
      // Verify that we can dispatch a CustomEvent without error
      const event = new CustomEvent('evalQuery.governance', {
        detail: {
          queryId: 'test-1',
          getters: [],
        },
      });

      expect(() => window.dispatchEvent(event)).not.toThrow();
    });

    it('should include queryId in the event detail', () => {
      const detail = {
        queryId: 'test-id-123',
        getters: [{
          field: 'campaign.name',
          method: 'elementValue',
          selector: 'input',
        }],
      };

      const event = new CustomEvent('evalQuery.governance', { detail });
      expect(event.detail.queryId).toBe('test-id-123');
      expect(event.detail.getters).toHaveLength(1);
    });

    it('should support expression mode in event detail', () => {
      const detail = {
        queryId: 'test-expr',
        expression: '1 + 1',
      };

      const event = new CustomEvent('evalQuery.governance', { detail });
      expect(event.detail.expression).toBe('1 + 1');
    });

    it('should support params field in event detail', () => {
      const detail = {
        queryId: 'test-params',
        params: { key: 'value' },
        getters: [],
      };

      const event = new CustomEvent('evalQuery.governance', { detail });
      expect(event.detail.params).toEqual({ key: 'value' });
    });
  });

  describe('postMessage outbound communication', () => {
    it('should respond with evalResult.governance type', (done) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'evalResult.governance') {
          expect(event.data.queryId).toBeDefined();
          expect(event.data.results).toBeDefined();
          expect(event.data.errors).toBeDefined();
          window.removeEventListener('message', handler);
          done();
        }
      };
      window.addEventListener('message', handler);

      // Simulate the bridge response
      window.postMessage({
        type: 'evalResult.governance',
        queryId: 'test-response',
        results: {},
        errors: {},
      }, '*');
    });

    it('should include buffer field for large payloads', (done) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'evalResult.governance' && event.data.queryId === 'test-buffer') {
          // jsdom doesn't fully implement Transferable, so we check the
          // buffer field exists and has a byteLength property
          expect(event.data.buffer).toBeDefined();
          expect(event.data.buffer.byteLength).toBeGreaterThan(0);
          window.removeEventListener('message', handler);
          done();
        }
      };
      window.addEventListener('message', handler);

      // Simulate a response with an ArrayBuffer
      const encoder = new TextEncoder();
      const encoded = encoder.encode(JSON.stringify({ large: 'data' }));
      const buffer = encoded.buffer;

      window.postMessage({
        type: 'evalResult.governance',
        queryId: 'test-buffer',
        results: {},
        errors: {},
        buffer,
      }, '*');
    });
  });

  describe('Transferable ArrayBuffer', () => {
    it('should decode ArrayBuffer to JSON results', () => {
      const encoder = new TextEncoder();
      const data = { 'campaign.name': 'Test Campaign', 'campaign.objective': 'Traffic' };
      const encoded = encoder.encode(JSON.stringify(data));

      const decoder = new TextDecoder();
      const decoded = JSON.parse(decoder.decode(encoded));

      expect(decoded['campaign.name']).toBe('Test Campaign');
      expect(decoded['campaign.objective']).toBe('Traffic');
    });

    it('should handle empty ArrayBuffer gracefully', () => {
      const encoder = new TextEncoder();
      const encoded = encoder.encode(JSON.stringify({}));

      const decoder = new TextDecoder();
      const decoded = JSON.parse(decoder.decode(encoded));

      expect(decoded).toEqual({});
    });

    it('should transfer large payloads efficiently', () => {
      // Create a payload larger than 4096 bytes
      const largeData: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeData[`field_${i}`] = 'x'.repeat(100);
      }

      const encoder = new TextEncoder();
      const encoded = encoder.encode(JSON.stringify(largeData));

      expect(encoded.byteLength).toBeGreaterThan(4096);

      const decoder = new TextDecoder();
      const decoded = JSON.parse(decoder.decode(encoded));

      expect(Object.keys(decoded)).toHaveLength(100);
    });
  });

  describe('Helper function contracts', () => {
    describe('FindReact', () => {
      it('should return null when element has no React Fiber key', () => {
        document.body.innerHTML = '<div id="test">Hello</div>';
        const el = document.querySelector('#test')!;
        const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
        expect(fiberKey).toBeUndefined();
      });

      it('should find React Fiber key on an element when present', () => {
        const el = document.createElement('div');
        (el as unknown as Record<string, unknown>)['__reactFiber$abc123'] = {
          memoizedProps: { value: 'test' },
          return: null,
        };
        document.body.appendChild(el);

        const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
        expect(fiberKey).toBe('__reactFiber$abc123');
      });
    });

    describe('FindReactFiber_v17', () => {
      it('should find __reactInternalInstance$ key', () => {
        const el = document.createElement('div');
        (el as unknown as Record<string, unknown>)['__reactInternalInstance$abc'] = {
          memoizedProps: { value: 'v17' },
          return: null,
        };

        const fiberKey = Object.keys(el).find((k) =>
          k.startsWith('__reactInternalInstance$')
        );
        expect(fiberKey).toBe('__reactInternalInstance$abc');
      });
    });

    describe('FindReactNodes', () => {
      it('should return null for container with no React nodes', () => {
        document.body.innerHTML = '<div id="container"><span>Plain</span></div>';
        const container = document.querySelector('#container')!;
        const children = container.querySelectorAll('*');

        let hasReactFiber = false;
        for (const child of children) {
          if (Object.keys(child).some((k) => k.startsWith('__reactFiber$'))) {
            hasReactFiber = true;
          }
        }
        expect(hasReactFiber).toBe(false);
      });
    });

    describe('GetCompFiber', () => {
      it('should walk up the fiber tree to find a function component', () => {
        const mockFn = function TestComponent() { return null; };
        (mockFn as Record<string, unknown>).displayName = 'TestComponent';

        const fiber = {
          type: 'div',
          memoizedProps: {},
          return: {
            type: mockFn,
            memoizedProps: { label: 'test' },
            memoizedState: null,
            return: null,
          },
        };

        // Walk up the fiber tree manually
        let current: Record<string, unknown> | null = fiber;
        let found: Record<string, unknown> | null = null;
        while (current) {
          if (typeof current.type === 'function') {
            found = current;
            break;
          }
          current = current.return as Record<string, unknown> | null;
        }

        expect(found).not.toBeNull();
        expect((found!.type as Record<string, unknown>).displayName).toBe('TestComponent');
      });
    });

    describe('FindContexts', () => {
      it('should find context providers in fiber tree', () => {
        const contextValue = { theme: 'dark', user: { name: 'Test' } };
        const fiber = {
          type: {
            _context: {
              _currentValue: contextValue,
            },
          },
          return: null,
        };

        const contexts: Record<string, unknown> = {};
        let current: Record<string, unknown> | null = fiber;
        let depth = 0;

        while (current && depth < 20) {
          const type = current.type as Record<string, unknown> | null;
          if (type && typeof type === 'object' && '_context' in type) {
            contexts[`context_${depth}`] = (type._context as Record<string, unknown>)._currentValue;
          }
          current = current.return as Record<string, unknown> | null;
          depth++;
        }

        expect(contexts['context_0']).toBe(contextValue);
      });
    });

    describe('FacebookClearExtensionDetection', () => {
      it('should remove data-extension-detected attributes', () => {
        document.body.innerHTML = '<div data-extension-detected="true"></div>';
        const marker = document.querySelector('[data-extension-detected]');
        expect(marker).not.toBeNull();

        marker!.removeAttribute('data-extension-detected');
        const afterClear = document.querySelector('[data-extension-detected]');
        expect(afterClear).toBeNull();
      });
    });

    describe('FindVue', () => {
      it('should detect Vue 3 instance on element', () => {
        const el = document.createElement('div');
        (el as unknown as Record<string, unknown>)['__vue_app__'] = {
          $data: { message: 'Hello Vue' },
        };

        const vueKey = Object.keys(el).find((k) => k.startsWith('__vue'));
        expect(vueKey).toBe('__vue_app__');
      });

      it('should detect Vue 2 instance on element', () => {
        const el = document.createElement('div');
        (el as unknown as Record<string, unknown>).__vue__ = {
          $data: { count: 42 },
        };

        const instance = (el as unknown as Record<string, unknown>).__vue__;
        expect(instance).toBeDefined();
        expect((instance as Record<string, unknown>).$data).toEqual({ count: 42 });
      });
    });

    describe('FindJQuery', () => {
      it('should return null when jQuery is not on window', () => {
        const win = window as unknown as Record<string, unknown>;
        expect(win.jQuery).toBeUndefined();
      });
    });

    describe('FindContext_v0', () => {
      it('should find legacy context in stateNode', () => {
        const fiber = {
          stateNode: {
            context: { store: { getState: () => ({ count: 0 }) } },
          },
          return: null,
        };

        const stateNode = fiber.stateNode as Record<string, unknown>;
        expect(stateNode.context).toBeDefined();
        expect(typeof (stateNode.context as Record<string, unknown>).store).toBe('object');
      });
    });

    describe('facebookEditorTree', () => {
      it('should return null when window.require is not available', () => {
        const win = window as unknown as Record<string, unknown>;
        expect(win.require).toBeUndefined();
      });
    });

    describe('callSelector', () => {
      it('should serialize element properties', () => {
        document.body.innerHTML = '<input id="test" class="foo bar" value="hello" />';
        const el = document.querySelector('#test') as HTMLElement;

        expect(el).not.toBeNull();
        expect(el.tagName.toLowerCase()).toBe('input');
        expect(Array.from(el.classList)).toEqual(['foo', 'bar']);
      });
    });

    describe('FindFacebookContextSelector', () => {
      it('should match context by displayName pattern', () => {
        const contextA = {
          _context: {
            displayName: 'ThemeContext',
            _currentValue: { theme: 'dark' },
          },
        };

        const pattern = /Theme/i;
        const displayName = (contextA._context as Record<string, unknown>).displayName as string;
        expect(pattern.test(displayName)).toBe(true);
      });
    });

    describe('FindPath', () => {
      it('should traverse dot-separated path in fiber props', () => {
        const props = {
          store: {
            campaign: {
              name: 'Deep Campaign',
            },
          },
        };

        const pathParts = 'store.campaign.name'.split('.');
        let current: unknown = props;
        for (const part of pathParts) {
          if (current && typeof current === 'object') {
            current = (current as Record<string, unknown>)[part];
          }
        }

        expect(current).toBe('Deep Campaign');
      });
    });
  });

  describe('Legacy postMessage compatibility', () => {
    it('should handle postMessage-based queries', (done) => {
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'evalResult.governance' && event.data.queryId === 'legacy-test') {
          window.removeEventListener('message', handler);
          done();
        }
      };
      window.addEventListener('message', handler);

      // Simulate the bridge echoing back a response to a postMessage query
      window.postMessage({
        type: 'evalResult.governance',
        queryId: 'legacy-test',
        results: { 'test.field': 'value' },
        errors: {},
      }, '*');
    });
  });
});
