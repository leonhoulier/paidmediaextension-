import { Request } from 'express';

/**
 * Authenticated user information extracted from Firebase JWT
 */
export interface AuthenticatedUser {
  uid: string;
  email: string;
  organizationId: string;
  role: string;
  name: string;
}

/**
 * User information extracted from extension token lookup
 */
export interface ExtensionTokenUser {
  userId: string;
  email: string;
  organizationId: string;
  teamIds: string[];
  name: string;
}

/**
 * Express request with authenticated Firebase user
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Express request with extension token user
 */
export interface ExtensionTokenRequest extends Request {
  extensionUser: ExtensionTokenUser;
}
