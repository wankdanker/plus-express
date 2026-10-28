import { Router, Application } from 'express';
import { ZodType } from 'zod';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { AnyZodObject, HttpMethod, EndpointOptions, MountInfo, Registry, RouterPlus } from './types';

type RouteMethod = (...args: unknown[]) => unknown;
type AnyEndpointOptions = EndpointOptions<ZodType, AnyZodObject, AnyZodObject, AnyZodObject>;

/**
 * Checks whether a value is an options object (not an array, RegExp, or handler function)
 */
function isOptionsObject(value: unknown): value is AnyEndpointOptions {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof RegExp);
}

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
  createEndpoint: Registry['createEndpoint']
): void {
  const routeMethods = target as unknown as Record<HttpMethod, RouteMethod>;

  methods.forEach((method) => {
    const originalMethod = routeMethods[method];

    // Replace the method with our enhanced version
    routeMethods[method] = function(...args: unknown[]) {
      // Case 1: When first arg is an options object (options-only pattern)
      if (args.length > 1 && isOptionsObject(args[0])) {
        const [opts, handler, ...rest] = args as [AnyEndpointOptions, ...unknown[]];

        if (!opts.path) {
          throw new Error(`Path is required when using options as first argument for ${method}`);
        }

        const validationMiddleware = createEndpoint(method, opts.path, opts);

        return originalMethod.call(target, opts.path, validationMiddleware, handler, ...rest);
      }

      // Case 2: When first arg is string and second is options object (path + options pattern)
      if (args.length > 2 && typeof args[0] === 'string' && isOptionsObject(args[1])) {
        const [path, opts, handler, ...rest] = args as [string, AnyEndpointOptions, ...unknown[]];

        const validationMiddleware = createEndpoint(method, path, opts);

        return originalMethod.call(target, path, validationMiddleware, handler, ...rest);
      }

      // Default behavior for any other pattern
      return originalMethod.apply(target, args);
    };
  });
}

/**
 * Checks whether a value is a RouterPlus instance
 */
function isRouterPlus(value: unknown): value is RouterPlus & { _registry: Registry } {
  return typeof value === 'function' &&
    (value as RouterPlus)._isRouterPlus === true &&
    (value as RouterPlus)._registry !== undefined;
}

/**
 * Records a RouterPlus mount from the arguments of an app.use() or router.use() call
 *
 * @param args Arguments passed to use()
 * @param mounts Mount list to record into
 */
export function recordRouterPlusMount(args: unknown[], mounts: MountInfo[]): void {
  // Case 1: path + router (use('/path', routerPlus))
  if (args.length >= 2 && isRouterPlus(args[1])) {
    const mountPath = typeof args[0] === 'string' ? args[0] : '/';
    mounts.push({
      path: normalizeMountPath(mountPath),
      registry: args[1]._registry,
      mounts: args[1]._nestedMountRegistry,
    });
  }

  // Case 2: Just router (use(routerPlus))
  if (args.length === 1 && isRouterPlus(args[0])) {
    mounts.push({ path: '/', registry: args[0]._registry, mounts: args[0]._nestedMountRegistry });
  }
}

/**
 * Re-registers the routes of mounted routers, and of any routers nested within them,
 * into the base registry with each path prefixed by its full mount path
 *
 * @param baseRegistry The raw OpenAPI registry to register routes into
 * @param mounts Mount information for routers mounted at this level
 * @param prefix Mount path accumulated from parent routers
 */
export function registerMountedRoutes(baseRegistry: OpenAPIRegistry, mounts: MountInfo[], prefix = ''): void {
  mounts.forEach(({ path, registry, mounts: nestedMounts }) => {
    const mountPath = path === '/' ? prefix : `${prefix}${path}`;

    registry.getRawRegistry().definitions.forEach((def) => {
      // Non-route definitions (components, schemas, etc.) are skipped
      // They should be defined in the main registry if needed
      if (def.type !== 'route') {
        return;
      }

      const routePath = def.route.path.startsWith('/') ? def.route.path.substring(1) : def.route.path;

      baseRegistry.registerPath({
        ...def.route,
        path: `${mountPath}/${routePath}`,
      });
    });

    if (nestedMounts) {
      registerMountedRoutes(baseRegistry, nestedMounts, mountPath);
    }
  });
}

type OpenAPIDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

/**
 * Marks every path parameter as required, as the OpenAPI spec mandates.
 * zod-to-openapi infers `required` by test-parsing the schema, which coercing
 * schemas (z.coerce.*) can pass, so it reports them as optional.
 *
 * @param document Generated OpenAPI document (modified in place)
 * @returns The same document
 */
export function requirePathParameters(document: OpenAPIDocument): OpenAPIDocument {
  const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

  Object.values(document.paths ?? {}).forEach((pathItem) => {
    methods.forEach((method) => {
      pathItem[method]?.parameters?.forEach((parameter) => {
        if ('in' in parameter && parameter.in === 'path') {
          parameter.required = true;
        }
      });
    });
  });

  return document;
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
