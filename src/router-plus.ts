import { Router } from 'express';
import { createRegistry } from './registry';
import { 
  ApiOptions, 
  RouterPlus,
  RouterPlusReturn
} from './types';
import { enhanceHttpMethods, registerMount } from './utils';

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

  // Define the HTTP methods to enhance
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

  // Enhance the router with our augmented methods
  // @ts-ignore TODO: Fix type error
  enhanceHttpMethods(routerInstance, methods, registry.createEndpoint);

  // Mark the router as a RouterPlus and attach registry
  Object.defineProperties(routerInstance, {
    _isRouterPlus: {
      value: true,
      writable: false,
      enumerable: false
    },
    _registry: {
      value: registry.getRawRegistry(),
      writable: false,
      enumerable: false
    }
  });

  // Keep track of nested routers
  const originalUse = routerInstance.use;
  routerInstance.use = function(...args: any[]): Router {
    // Check if this is a router being mounted
    if (args.length >= 2) {
      const mountPath = typeof args[0] === 'string' ? args[0] : '/';
      const middleware = args[1];
      
      // If middleware is a RouterPlus, register its mount point
      if (middleware && middleware._isRouterPlus && middleware._registry) {
        // Register with a combined path (this will be handled when the parent router is mounted)
        registerMount(mountPath, middleware._registry);
      }
    }
    
    // Call the original use method
    // @ts-ignore TODO: Fix type error
    return originalUse.apply(this, args);
  };

  // Return enhanced router and registry
  return {
    router: routerInstance as unknown as RouterPlus,
    registry
  };
};