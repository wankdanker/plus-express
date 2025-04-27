import { Application, Router } from 'express';
import { createRegistry } from './registry';
import { 
  ApiOptions, 
  ExpressPlusApplication, 
  ExpressPlusReturn
} from './types';
import { enhanceHttpMethods, registerMount, combineRegistries } from './utils';

/**
 * Enhances an Express application with typed route handling and OpenAPI documentation
 * 
 * @param app Express application instance
 * @param opts API configuration options (optional)
 * @returns Enhanced Express application and registry
 */
export const expressPlus = (app: Application, opts: ApiOptions = {}): ExpressPlusReturn => {
  // Create registry with the provided options
  const registry = createRegistry(opts);

  // Define the HTTP methods to enhance
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

  // Enhance the app with our augmented methods
  // @ts-ignore TODO: Fix type error
  enhanceHttpMethods(app, methods, registry.createEndpoint);

  // Keep a reference to the original use method
  const originalUse = app.use;

  // Override the use method to track router mounting
  app.use = function(...args: any[]): Application {
    // Check if this is a router being mounted
    if (args.length >= 2) {
      const mountPath = typeof args[0] === 'string' ? args[0] : '/';
      const middleware = args[1];
      
      // If middleware is a RouterPlus, register its mount point
      if (middleware && middleware._isRouterPlus && middleware._registry) {
        registerMount(mountPath, middleware._registry);
      }
    }
    
    // Call the original use method
    // @ts-ignore TODO: Fix type error
    return originalUse.apply(this, args);
  };

  // Override the generateOpenAPIDocument method to combine registries
  const originalGenerateOpenAPIDocument = registry.generateOpenAPIDocument;
  registry.generateOpenAPIDocument = function(config?: Partial<any>): any {
    // First combine all registries
    const combinedRegistry = combineRegistries(registry.getRawRegistry());
    
    // Then generate the document using the original method
    return originalGenerateOpenAPIDocument.call(this, config);
  };

  // Return enhanced app and registry
  return {
    app: app as unknown as ExpressPlusApplication,
    registry
  };
};