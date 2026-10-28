import { Router } from 'express';
import { createRegistry } from './registry';
import {
  ApiOptions,
  MountInfo,
  RouterPlus,
  RouterPlusReturn,
} from './types';
import { enhanceHttpMethods, recordRouterPlusMount } from './utils';

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
  enhanceHttpMethods(routerInstance, methods, registry.createEndpoint);

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

  // Keep track of nested routers
  const originalUse = routerInstance.use as unknown as (...args: unknown[]) => Router;
  routerInstance.use = function(this: Router, ...args: unknown[]): Router {
    recordRouterPlusMount(args, nestedMountRegistry);

    // Call the original use method
    return originalUse.apply(this, args);
  } as Router['use'];

  // Return enhanced router and registry
  return {
    router: routerInstance as unknown as RouterPlus,
    registry
  };
};