import { Application, Router } from 'express';
import { createRegistry } from './registry';
import {
  ApiOptions,
  ExpressPlusApplication,
  ExpressPlusReturn
} from './types';
import { enhanceHttpMethods, combineRegistries, normalizeMountPath, MountInfo } from './utils';

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

  // Create an instance-specific mount registry (no global state)
  const mountRegistry: MountInfo[] = [];

  // Define the HTTP methods to enhance
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

  // Enhance the app with our augmented methods
  enhanceHttpMethods(app, methods, registry.createEndpoint as any);

  // Keep a reference to the original use method
  const originalUse = app.use;

  // Override the use method to track router mounting
  app.use = function(...args: any[]): Application {
    // Case 1: Path + RouterPlus (app.use('/path', router))
    if (args.length >= 2) {
      const mountPath = typeof args[0] === 'string' ? args[0] : '/';
      const middleware = args[1];

      // If middleware is a RouterPlus, register its mount point
      if (middleware && middleware._isRouterPlus && middleware._registry) {
        const normalizedPath = normalizeMountPath(mountPath);
        mountRegistry.push({ path: normalizedPath, registry: middleware._registry });
      }
    }

    // Case 2: Just RouterPlus (app.use(router))
    if (args.length === 1 && args[0] && args[0]._isRouterPlus && args[0]._registry) {
      mountRegistry.push({ path: '/', registry: args[0]._registry });
    }

    // Call the original use method
    return originalUse.apply(this, args as any) as Application;
  };

  // Override the generateOpenAPIDocument method to combine registries
  const originalGenerateOpenAPIDocument = registry.generateOpenAPIDocument;
  registry.generateOpenAPIDocument = function(config?: Partial<any>): any {
    // Get the base registry
    const baseRegistry = registry.getRawRegistry();

    // For each mounted registry, copy its definitions to the base registry
    mountRegistry.forEach(({ path, registry: mountedRegistry }) => {
      if (!mountedRegistry) {
        return;
      }

      // Get the raw registry definitions from the Registry object
      const rawRegistry = mountedRegistry.getRawRegistry ?
                         mountedRegistry.getRawRegistry() :
                         mountedRegistry;

      if (!rawRegistry || !rawRegistry.definitions) {
        return;
      }

      // For each definition in the mounted registry, re-register it with the base registry
      rawRegistry.definitions.forEach((def: any) => {
        if (def.type === 'route') {
          // Extract the route details
          const route = def.route;
          let routePath = route.path;

          // Adjust the path
          if (routePath.startsWith('/')) {
            routePath = routePath.substring(1);
          }
          const fullPath = path === '/' ? `/${routePath}` : `${path}/${routePath}`;

          // Re-register the route with the adjusted path using the base registry
          // This properly adds it to the registry's definitions
          baseRegistry.registerPath({
            ...route,
            path: fullPath
          });
        }
        // Note: Non-route definitions (components, schemas, etc.) are skipped
        // They should be defined in the main registry if needed
      });
    });

    // Then generate the document using the original method
    return originalGenerateOpenAPIDocument.call(this, config);
  };

  // Return enhanced app and registry
  return {
    app: app as unknown as ExpressPlusApplication,
    registry
  };
};