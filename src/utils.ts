import { isDeepStrictEqual } from 'node:util';
import { Router, Application } from 'express';
import { z, ZodType } from 'zod';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { AnyZodObject, HttpMethod, EndpointOptions, MountInfo, Registry, RouterPlus } from './types';

type RouteMethod = (...args: unknown[]) => unknown;
type AnyEndpointOptions = EndpointOptions<ZodType, AnyZodObject, AnyZodObject, AnyZodObject>;
type Definition = OpenAPIRegistry['definitions'][number];

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
 * Records the RouterPlus mounts from the arguments of an app.use() or router.use() call
 *
 * Like Express, the first argument is the mount path unless it is a handler (or an array
 * starting with one). Every RouterPlus among the handlers is recorded, including routers
 * passed after other middleware or inside arrays, under each mount path.
 *
 * @param args Arguments passed to use()
 * @param mounts Mount list to record into
 */
export function recordRouterPlusMount(args: unknown[], mounts: MountInfo[]): void {
  let first = args[0];
  while (Array.isArray(first) && first.length > 0) {
    first = first[0];
  }
  const hasPath = args.length > 0 && typeof first !== 'function';

  // RegExp mount paths can't be expressed in OpenAPI, so those routers are documented at the root
  const mountPaths = (hasPath ? [args[0]].flat(Infinity) : ['/'])
    .map((path) => normalizeMountPath(typeof path === 'string' ? path : '/'));
  const handlers = (hasPath ? args.slice(1) : args).flat(Infinity);

  handlers.filter(isRouterPlus).forEach((router) => {
    mountPaths.forEach((path) => {
      mounts.push({ path, registry: router._registry, mounts: router._nestedMountRegistry });
    });
  });
}

/**
 * Collects the definitions of mounted routers, and of any routers nested within them,
 * with each route path prefixed by its full mount path. The registries are not modified,
 * so collecting again (on every document generation) returns the same result.
 *
 * @param mounts Mount information for routers mounted at this level
 * @param prefix Mount path accumulated from parent routers
 * @returns One list of definitions per mounted registry
 */
export function collectMountedDefinitions(mounts: MountInfo[], prefix = ''): Definition[][] {
  return mounts.flatMap(({ path, registry, mounts: nestedMounts }) => {
    const mountPath = path === '/' ? prefix : `${prefix}${path}`;

    const definitions = registry.getRawRegistry().definitions.map((def): Definition => {
      if (def.type !== 'route') {
        return def;
      }
      const routePath = def.route.path.startsWith('/') ? def.route.path.substring(1) : def.route.path;
      return { ...def, route: { ...def.route, path: `${mountPath}/${routePath}` } };
    });

    return [definitions, ...(nestedMounts ? collectMountedDefinitions(nestedMounts, mountPath) : [])];
  });
}

/**
 * Throws when two registries define a component (schema, parameter, security scheme, etc.)
 * under the same name with different contents, which the generator would otherwise resolve
 * by silently keeping one. Identical definitions, such as a shared schema or a router
 * mounted twice, are allowed.
 *
 * @param definitionSets One list of definitions per registry
 */
export function assertCompatibleComponents(definitionSets: Definition[][]): void {
  const seen = new Map<string, unknown>();

  definitionSets.forEach((definitions) => {
    const { components = {} } = new OpenApiGeneratorV3(definitions).generateComponents();

    Object.entries(components).forEach(([componentType, named]) => {
      Object.entries(named ?? {}).forEach(([name, component]) => {
        const key = `${componentType}.${name}`;
        if (seen.has(key) && !isDeepStrictEqual(seen.get(key), component)) {
          throw new Error(
            `OpenAPI component "${name}" (components.${componentType}) is defined differently by two mounted registries`
          );
        }
        seen.set(key, component);
      });
    });
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
 * Checks whether a schema coerces its input (z.coerce.*), looking through optional and default wrappers
 */
function isCoerced(schema: z.core.$ZodType): boolean {
  let current = schema;
  while (['optional', 'default', 'prefault'].includes(current._zod.def.type)) {
    current = (current._zod.def as z.core.$ZodOptionalDef).innerType;
  }
  return 'coerce' in current._zod.def && current._zod.def.coerce === true;
}

/**
 * Corrects how coerced (z.coerce.*) path, query and header parameters are documented.
 * zod-to-openapi infers `required` and `nullable` by test-parsing the schema, which coercion
 * passes (null becomes 0), so it documents them as optional and nullable. Here `required`
 * follows the object key's optionality, and `nullable` is removed.
 *
 * @param document Generated OpenAPI document (modified in place)
 * @param definitions The definitions the document was generated from
 * @returns The same document
 */
export function documentCoercedParameters(document: OpenAPIDocument, definitions: Definition[]): OpenAPIDocument {
  definitions.forEach((def) => {
    // 'query' is an OpenAPI 3.2 method, which plus-express doesn't register
    if (def.type !== 'route' || def.route.method === 'query') {
      return;
    }
    const { request } = def.route;
    const schemas: Partial<Record<string, unknown>> = { path: request?.params, query: request?.query, header: request?.headers };

    document.paths?.[def.route.path]?.[def.route.method]?.parameters?.forEach((parameter) => {
      if (!('in' in parameter)) {
        return;
      }
      const schema = schemas[parameter.in];
      const field = schema instanceof z.ZodObject ? schema.shape[parameter.name] : undefined;
      if (!field || !isCoerced(field)) {
        return;
      }

      // optin is set when the key may be missing from the input (optional or defaulted)
      if (parameter.in !== 'path') {
        parameter.required = field._zod.optin === undefined;
      }
      if (parameter.schema && 'nullable' in parameter.schema) {
        delete parameter.schema.nullable;
      }
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
