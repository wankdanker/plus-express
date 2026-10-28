import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodError, ZodType } from 'zod';
import { OpenAPIRegistry, OpenApiGeneratorV3, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import extend from 'extend';
import { 
  HttpMethod, 
  EndpointOptions, 
  ValidatedRequest, 
  OpenAPIConfig, 
  ApiOptions,
  AnyZodObject,
  Registry,
  ResponseObject,
} from './types';
import { requirePathParameters } from './utils';

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

/**
 * Create a registry with chainable configuration methods
 */
export function createRegistry(options: ApiOptions = {}): Registry {
  // Create a registry for OpenAPI components
  const openApiRegistry = new OpenAPIRegistry();

  // Extract initial options with defaults
  let defaultQuerySchema = options.defaultQuerySchema || z.object({});
  let defaultHeaderSchema = options.defaultHeaderSchema || z.object({});
  let defaultResponses = options.defaultResponses || {};
  const openApiConfig: OpenAPIConfig = options.openApiConfig || {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
    },
  };

  /**
   * Create an endpoint middleware that validates requests and registers schemas
   */
  function createEndpoint<
    TBody extends ZodType = ZodType,
    TParams extends AnyZodObject = AnyZodObject,
    TQuery extends AnyZodObject = AnyZodObject,
    THeaders extends AnyZodObject = AnyZodObject
  >(
    method: HttpMethod,
    path: string,
    options: EndpointOptions<TBody, TParams, TQuery, THeaders> = {}
  ): RequestHandler {
    const {
      operationId,
      summary = '',
      description = '',
      deprecated = false,
      tags = [],
      body,
      params,
      query,
      headers,
      responses: routeResponses
    } = options;

    // In the path, replace :param with {param} for OpenAPI compatibility
    const openApiPath = path.replace(/[:*](\w+)/g, '{$1}');

    // Merge the route-specific query schema with the default query schema
    let mergedQuerySchema = defaultQuerySchema;
    if (query) {
      // Create a new schema that extends the default
      mergedQuerySchema = defaultQuerySchema.extend(query.shape);
    }

    // Merge the route-specific header schema with the default header schema
    let mergedHeaderSchema = defaultHeaderSchema;
    if (headers) {
      // Create a new schema that extends the default
      mergedHeaderSchema = defaultHeaderSchema.extend(headers.shape);
    }

    // Merge responses with defaults (route-specific responses take precedence)
    const mergedResponses = { ...defaultResponses };

    // Add or override with route-specific responses
    if (routeResponses) {
      Object.entries(routeResponses).forEach(([statusCode, responseObject]) => {
        mergedResponses[statusCode] = responseObject;
      });
    }

    // Register the route in OpenAPI registry
    openApiRegistry.registerPath({
      method,
      path: openApiPath,
      operationId,
      summary,
      description,
      deprecated,
      tags,
      request: {
        body: body ? { content: { 'application/json': { schema: body } } } : undefined,
        params: params ? params : undefined,
        query: mergedQuerySchema,
        headers: mergedHeaderSchema,
      },
      responses: mergedResponses
    });

    // Return the Express middleware
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        // Create a validated request object
        const validatedRequest = req as ValidatedRequest;
        
        // Initialize the parsed object if it doesn't exist
        if (!validatedRequest.parsed) {
          validatedRequest.parsed = {
            body: req.body,
            params: req.params,
            query: req.query,
            headers: req.headers
          };
        }

        // Validate body if schema provided
        if (body) {
          validatedRequest.parsed.body = body.parse(req.body);
          req.body = validatedRequest.parsed.body; // Also update the original for backward compatibility
        }

        // Validate URL params if schema provided
        if (params) {
          validatedRequest.parsed.params = params.parse(req.params);
          extend(req.params, validatedRequest.parsed.params); // Update original params for compatibility
        }

        // Validate query params with merged schema
        validatedRequest.parsed.query = mergedQuerySchema.parse(req.query);
        // Update original query for compatibility. Express 5 defines req.query as a getter that
        // re-parses on every access, so shadow it with an own property holding the merged result
        Object.defineProperty(req, 'query', {
          value: extend(true, req.query, validatedRequest.parsed.query),
          writable: true,
          configurable: true,
          enumerable: true,
        });

        // Validate headers with merged schema
        // Use partial to ensure we only validate the headers we care about
        const headersSchema = mergedHeaderSchema.partial();
        const parsedHeaders = headersSchema.parse(req.headers);
        validatedRequest.parsed.headers = parsedHeaders;
        // Merge validated headers back with original headers
        req.headers = { ...req.headers, ...parsedHeaders };

        // Proceed to next middleware
        next();
      } catch (error) {
        // Create a standardized error response
        next(Object.assign(new Error('Validation failed', { cause: error }), {
          status: 400,
          errors: error instanceof ZodError ? error.issues : (error as Error).message,
        }));
      }
    };
  }

  /**
   * Generate the full OpenAPI document
   */
  function generateOpenAPIDocument(config: Partial<OpenAPIConfig> = {}): any {
    const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
    return requirePathParameters(generator.generateDocument({
      ...openApiConfig,
      ...config
    }));
  }

  /**
   * Set API info (title, version, description)
   */
  function setInfo(info: { title: string; version: string; description?: string }): Registry {
    openApiConfig.info = { ...openApiConfig.info, ...info };
    return registry;
  }

  /**
   * Add a server to the OpenAPI document
   */
  function addServer(server: { url: string; description?: string }): Registry {
    if (!openApiConfig.servers) {
      openApiConfig.servers = [];
    }
    openApiConfig.servers.push(server);
    return registry;
  }

  /**
   * Set the default query schema for all endpoints
   */
  function setDefaultQuerySchema(schema: AnyZodObject): Registry {
    defaultQuerySchema = schema;
    return registry;
  }

  /**
   * Set the default header schema for all endpoints
   */
  function setDefaultHeaderSchema(schema: AnyZodObject): Registry {
    defaultHeaderSchema = schema;
    return registry;
  }

  /**
   * Set the default responses for all endpoints
   */
  function setDefaultResponses(responses: Record<string | number, ResponseObject>): Registry {
    defaultResponses = responses;
    return registry;
  }

  /**
   * Register a security scheme
   */
  function registerSecurityScheme(name: string, scheme: any): Registry {
    openApiRegistry.registerComponent('securitySchemes', name, scheme);
    return registry;
  }

  /**
   * Get the raw OpenAPI registry
   */
  function getRawRegistry(): OpenAPIRegistry {
    return openApiRegistry;
  }

  // Create the registry object with all methods
  const registry: Registry = {
    createEndpoint,
    generateOpenAPIDocument,
    setInfo,
    addServer,
    setDefaultQuerySchema,
    setDefaultHeaderSchema,
    setDefaultResponses,
    registerSecurityScheme,
    getRawRegistry
  };

  return registry;
}