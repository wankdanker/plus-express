import { Router } from 'express';
import { createRegistry } from './registry';
import {
  ApiOptions,
  RouterPlus,
  RouterPlusReturn
} from './types';
import { enhanceHttpMethods, normalizeMountPath, MountInfo } from './utils';

/**
 * Enhances an Express Router with typed route handling and OpenAPI documentation
 * 
 * @param router Express Router instance (or creates a new one if not provided)
 * @param opts API configuration options (optional)
 * @returns Enhanced Router and registry
 */
export const routerPlus = (router?: Router, opts: ApiOptions = {}): RouterPlusReturn => {
  // Create a new router if one wasn't provided
  const routerInstance = router || Router();

  // Create registry with the provided options
  const registry = createRegistry(opts);

  // Create an instance-specific mount registry for nested routers
  const nestedMountRegistry: MountInfo[] = [];

  // Define the HTTP methods to enhance
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

  // Enhance the router with our augmented methods
  enhanceHttpMethods(routerInstance, methods, registry.createEndpoint as any);

  // Mark the router as a RouterPlus and attach registry
  Object.defineProperties(routerInstance, {
    _isRouterPlus: {
      value: true,
      writable: false,
      enumerable: false
    },
    _registry: {
      // Store the actual registry object, not just a getter
      value: registry,
      writable: false,
      enumerable: false
    },
    _nestedMountRegistry: {
      // Store nested mount registry for this router instance
      value: nestedMountRegistry,
      writable: false,
      enumerable: false
    }
  });

  // Make the router compatible with Express's app.use() typings
  (routerInstance as any).__esModule = true;

  // Keep track of nested routers
  const originalUse = routerInstance.use;
  routerInstance.use = function(...args: any[]): Router {
    // Case 1: path + router (router.use('/path', routerPlus))
    if (args.length >= 2) {
      const mountPath = typeof args[0] === 'string' ? args[0] : '/';
      const middleware = args[1];

      // If middleware is a RouterPlus, register its mount point
      if (middleware && middleware._isRouterPlus && middleware._registry) {
        const normalizedPath = normalizeMountPath(mountPath);
        nestedMountRegistry.push({ path: normalizedPath, registry: middleware._registry });
      }
    }

    // Case 2: Just router (router.use(routerPlus))
    if (args.length === 1 && args[0] && args[0]._isRouterPlus && args[0]._registry) {
      nestedMountRegistry.push({ path: '/', registry: args[0]._registry });
    }

    // Call the original use method
    return originalUse.apply(this, args as any) as Router;
  };

  // Return enhanced router and registry
  return {
    router: routerInstance as unknown as RouterPlus,
    registry
  };
};