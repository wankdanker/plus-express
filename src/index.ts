import { Application, Router } from 'express';
import { expressPlus } from './express-plus';
import { routerPlus } from './router-plus';
import { createRegistry } from './registry';
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { ApiOptions, ExpressPlusReturn, RouterPlusReturn } from './types';

// Re-export types
export * from './types';

// Ensure Zod is extended with OpenAPI
extendZodWithOpenApi(z);

/**
 * PlusExpress - Enhanced Express with validation and OpenAPI documentation
 */
export {
  expressPlus,
  routerPlus,
  createRegistry,
  z
};

// Export plusRouter as an alias for those who prefer explicit naming
export { routerPlus as plusRouter };

/**
 * Unified plus() function that works with both Express apps and routers
 *
 * The overloads are carefully ordered to discriminate between Application and Router:
 * - Application has a listen() method
 * - Router does not have a listen() method
 */

// Overload 1: Create a new enhanced router (no arguments)
export function plus(): RouterPlusReturn;

// Overload 2: Enhance an Express application
// We use an intersection type to explicitly require the listen method
export function plus(
  app: Application & { listen: (...args: never[]) => unknown },
  opts?: ApiOptions
): ExpressPlusReturn;

// Overload 3: Enhance an Express router
export function plus(router: Router, opts?: ApiOptions): RouterPlusReturn;

/**
 * Unified plus() function implementation
 */
export function plus(
  appOrRouter?: Application | Router,
  opts: ApiOptions = {}
): ExpressPlusReturn | RouterPlusReturn {
  // If nothing provided, create a new router
  if (!appOrRouter) {
    return routerPlus(undefined, opts);
  }

  // Check if it's an Application (has listen method)
  // Applications have listen(), Routers don't
  if ('listen' in appOrRouter && typeof appOrRouter.listen === 'function') {
    return expressPlus(appOrRouter as Application, opts);
  }

  // Otherwise, treat it as a Router
  return routerPlus(appOrRouter as Router, opts);
}

/**
 * Create an enhanced Express application
 *
 * @param app Optional Express application (creates one if not provided)
 * @param options Configuration options
 */
export function createExpressPlus(app?: Application, options = {}) {
  // If no app is provided, try to require express and create one
  if (!app) {
    try {
      const express = require('express');
      app = express();
    } catch (error) {
      throw new Error(
        'Express is not installed. Please install express or provide an express application instance.',
        { cause: error },
      );
    }
  }

  return expressPlus(app as Application, options);
}

/**
 * Create an enhanced Express router
 *
 * @param router Optional Express router (creates one if not provided)
 * @param options Configuration options
 */
export function createRouterPlus(router?: Router, options = {}) {
  return routerPlus(router, options);
}

// Default export as a factory function
export default createExpressPlus;