import { Platform } from './enums.js';
import { ExtensionContext, InjectionPoint } from './models.js';
export interface PlatformAdapter {
    platform: Platform;
    detectContext(): ExtensionContext | null;
    extractFieldValues(): Promise<Record<string, unknown>>;
    getInjectionPoint(ruleType: string, fieldPath: string): InjectionPoint | null;
    interceptCreation(callback: (allow: boolean) => void): void;
    observeFieldChanges(callback: (fieldPath: string, value: unknown) => void): void;
    cleanup(): void;
}
export interface RemoteEvalQuery {
    type: 'evalQuery.governance';
    queryId: string;
    id?: string;
    params?: Record<string, unknown>;
    expression?: string;
    getters: Array<{
        field: string;
        method: 'elementText' | 'elementValue' | 'elementAttribute' | 'FindReact' | 'FindReactFiber_v17' | 'FindReactNodes' | 'GetCompFiber' | 'FindContexts' | 'FindFacebookContextSelector' | 'FindPath' | 'FacebookClearExtensionDetection' | 'FindVue' | 'FindJQuery' | 'FindContext_v0' | 'facebookEditorTree' | 'callSelector' | 'elementExists' | 'elementTextAll' | 'elementChecked' | 'elementStyle' | 'selectedOptionText';
        selector?: string;
        attribute?: string;
    }>;
}
export interface RemoteEvalResult {
    type: 'evalResult.governance';
    queryId: string;
    results: Record<string, unknown>;
    errors: Record<string, string>;
    buffer?: ArrayBuffer;
}
