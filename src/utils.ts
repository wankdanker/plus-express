import { Router, Application, RequestHandler } from 'express';
import { HttpMethod, EndpointOptions } from './types';

/**
 * Enhances HTTP methods on an Express application or Router with typed validation and OpenAPI documentation
 * 
 * @param target The Express app or Router to enhance
 * @param methods HTTP methods to enhance
 * @param createEndpoint Function to create validation middleware
 */
export function enhanceHttpMethods(
  target: Application | Router,
  methods: readonly HttpMethod[],
  createEndpoint: (method: HttpMethod, path: string, options?: EndpointOptions<any>) => RequestHandler
): void {
  methods.forEach((method) => {
    const originalMethod = target[method];

    // Replace the method with our enhanced version
    target[method] = function(...args: any[]) {
      // Case 1: When first arg is an options object (options-only pattern)
      if (args.length > 1 && typeof args[0] === 'object' && args[0] !== null &&
          !Array.isArray(args[0]) && !(args[0] instanceof RegExp)) {
        const [opts, handler, ...rest] = args;

        if (!opts.path) {
          throw new Error(`Path is required when using options as first argument for ${method}`);
        }
        
        const validationMiddleware = createEndpoint(method, opts.path, opts);

        // @ts-expect-error - This works but TypeScript is being strict
        return originalMethod.call(target, opts.path, validationMiddleware, handler, ...rest);
      }

      // Case 2: When first arg is string and second is options object (path + options pattern)
      if (args.length > 2 && typeof args[0] === 'string' &&
          typeof args[1] === 'object' && args[1] !== null &&
          !Array.isArray(args[1]) && !(args[1] instanceof RegExp)) {
        const [path, opts, handler, ...rest] = args;

        const validationMiddleware = createEndpoint(method, path, opts);

        // @ts-expect-error - This works but TypeScript is being strict
        return originalMethod.call(target, path, validationMiddleware, handler, ...rest);
      }

      // Default behavior for any other pattern
      // @ts-expect-error - This works but TypeScript is being strict
      return originalMethod.apply(target, args);
    } as any;
  });
}

/**
 * Interface for tracking mount path information
 */
export interface MountInfo {
  path: string;
  registry: any;
}

/**
 * Store for mount information
 */
export const mountRegistry: MountInfo[] = [];

/**
 * Register a mount point for a router with its associated registry
 * 
 * @param mountPath The path where the router is mounted
 * @param registry The OpenAPI registry associated with the router
 */
export function registerMount(mountPath: string, registry: any): void {
  // Normalize path to ensure it starts with / and doesn't end with /
  let normalizedPath = mountPath;
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  // Add to mount registry
  mountRegistry.push({
    path: normalizedPath,
    registry
  });
}

/**
 * Combines multiple OpenAPI registries based on mount points
 * 
 * @param baseRegistry The base registry to combine others into
 * @returns The combined registry
 */
export function combineRegistries(baseRegistry: any): any {
  // For each mounted registry, add its definitions to the base registry
  // with paths adjusted to include the mount path
  
  // Get all definitions from the base registry
  const baseDefinitions = baseRegistry.definitions;
  
  // Process each mounted registry
  mountRegistry.forEach(({ path, registry }) => {
    // Skip if the path is '/' as it doesn't need adjustment
    if (path === '/') {
      // Just merge the definitions directly
      registry.definitions.forEach((def: any) => {
        if (!baseDefinitions.some((baseDef: any) => 
            baseDef.type === def.type && 
            JSON.stringify(baseDef.schema) === JSON.stringify(def.schema))) {
          baseDefinitions.push(def);
        }
      });
      return;
    }
    
    // For each definition in the mounted registry
    registry.definitions.forEach((def: any) => {
      // If it's a path definition, adjust the path
      if (def.type === 'path') {
        // Create a copy of the definition with the adjusted path
        const adjustedDef = { ...def };
        
        // Combine the mount path with the route path
        // Ensure no double slashes
        let routePath = def.schema.path;
        if (routePath.startsWith('/')) {
          routePath = routePath.substring(1);
        }
        adjustedDef.schema = {
          ...def.schema,
          path: `${path}/${routePath}`
        };
        
        // Add to base registry if not already there
        if (!baseDefinitions.some((baseDef: any) => 
            baseDef.type === 'path' && 
            baseDef.schema.path === adjustedDef.schema.path &&
            baseDef.schema.method === adjustedDef.schema.method)) {
          baseDefinitions.push(adjustedDef);
        }
      } else {
        // For non-path definitions (schemas, responses, etc.), add directly if not exists
        if (!baseDefinitions.some((baseDef: any) => 
            baseDef.type === def.type && 
            (baseDef.name === def.name || JSON.stringify(baseDef.schema) === JSON.stringify(def.schema)))) {
          baseDefinitions.push(def);
        }
      }
    });
  });
  
  return baseRegistry;
}