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
    (target as any)[method] = function(...args: any[]) {
      // Case 1: When first arg is an options object (options-only pattern)
      if (args.length > 1 && typeof args[0] === 'object' && args[0] !== null &&
          !Array.isArray(args[0]) && !(args[0] instanceof RegExp)) {
        const [opts, handler, ...rest] = args;

        if (!opts.path) {
          throw new Error(`Path is required when using options as first argument for ${method}`);
        }

        const validationMiddleware = createEndpoint(method, opts.path, opts);

        return (originalMethod as any).call(target, opts.path, validationMiddleware, handler, ...rest);
      }

      // Case 2: When first arg is string and second is options object (path + options pattern)
      if (args.length > 2 && typeof args[0] === 'string' &&
          typeof args[1] === 'object' && args[1] !== null &&
          !Array.isArray(args[1]) && !(args[1] instanceof RegExp)) {
        const [path, opts, handler, ...rest] = args;

        const validationMiddleware = createEndpoint(method, path, opts);

        return (originalMethod as any).call(target, path, validationMiddleware, handler, ...rest);
      }

      // Default behavior for any other pattern
      return (originalMethod as any).apply(target, args);
    };
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
 * Normalize a mount path to ensure it starts with / and doesn't end with /
 *
 * @param mountPath The path to normalize
 * @returns Normalized path
 */
export function normalizeMountPath(mountPath: string): string {
  let normalizedPath = mountPath;
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath;
  }
  if (normalizedPath.endsWith('/') && normalizedPath.length > 1) {
    normalizedPath = normalizedPath.slice(0, -1);
  }
  return normalizedPath;
}

/**
 * Combines multiple OpenAPI registries based on mount points
 *
 * @param baseRegistry The base registry to combine others into
 * @param mountRegistry Array of mount information
 * @returns The combined registry
 */
export function combineRegistries(baseRegistry: any, mountRegistry: MountInfo[]): any {
  // For each mounted registry, add its definitions to the base registry
  // with paths adjusted to include the mount path

  // Get all definitions from the base registry
  const baseDefinitions = baseRegistry.definitions;

  // Process each mounted registry
  mountRegistry.forEach(({ path, registry }) => {
    // Skip if the registry is not valid
    if (!registry || !registry.definitions) {
      return;
    }

    // Root path special case
    if (path === '/') {
      // Just merge the definitions directly
      registry.definitions.forEach((def: any) => {
        if (!baseDefinitions.some((baseDef: any) =>
            baseDef.type === def.type &&
            (def.name ? baseDef.name === def.name :
            JSON.stringify(baseDef.schema) === JSON.stringify(def.schema)))) {
          baseDefinitions.push(def);
        }
      });
      return;
    }

    // For each definition in the mounted registry
    registry.definitions.forEach((def: any) => {
      // If it's a route definition, adjust the path
      if (def.type === 'route') {
        // Create a deep copy of the definition
        const adjustedDef = JSON.parse(JSON.stringify(def));

        // Combine the mount path with the route path
        // Ensure no double slashes
        let routePath = def.route.path;
        if (routePath.startsWith('/')) {
          routePath = routePath.substring(1);
        }

        // Normalize the path combining
        const normalizedPath = path === '/' ? `/${routePath}` : `${path}/${routePath}`;

        adjustedDef.route.path = normalizedPath;

        // Add to base registry if not already there
        if (!baseDefinitions.some((baseDef: any) =>
            baseDef.type === 'route' &&
            baseDef.route.path === adjustedDef.route.path &&
            baseDef.route.method === adjustedDef.route.method)) {
          baseDefinitions.push(adjustedDef);
        }
      } else {
        // For non-path definitions (schemas, responses, etc.), add directly if not exists
        if (!baseDefinitions.some((baseDef: any) =>
            baseDef.type === def.type &&
            (def.name ? baseDef.name === def.name :
            JSON.stringify(baseDef.schema) === JSON.stringify(def.schema)))) {
          baseDefinitions.push(def);
        }
      }
    });
  });

  return baseRegistry;
}