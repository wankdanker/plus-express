import { describe, it, expect } from 'vitest';
import express from 'express';
import { plus, z, OpenAPIDocument } from './index';

// Parameters as generated in these tests: inline objects, never $refs
type Parameter = { name: string; in: string; required?: boolean; schema?: Record<string, unknown> };

/**
 * Returns the parameters of an operation in a generated document
 */
function parametersOf(doc: OpenAPIDocument, path: string): Parameter[] {
  return (doc.paths[path]?.get?.parameters ?? []) as Parameter[];
}

describe('OpenAPI document', () => {
  it('converts Express path parameters to OpenAPI templates', () => {
    const { app, registry } = plus(express());
    app.get({
      path: '/users/:userId/posts/:postId',
      params: z.object({ userId: z.string(), postId: z.string() }),
    }, (req, res) => {
      res.end();
    });

    const doc = registry.generateOpenAPIDocument();

    expect(Object.keys(doc.paths)).toEqual(['/users/{userId}/posts/{postId}']);
    expect(doc.paths['/users/{userId}/posts/{postId}'].get?.parameters).toEqual([
      expect.objectContaining({ name: 'userId', in: 'path', required: true }),
      expect.objectContaining({ name: 'postId', in: 'path', required: true }),
    ]);
  });

  it('marks coerced path parameters as required', () => {
    const { app, registry } = plus(express());
    app.get({
      path: '/users/:id',
      params: z.object({ id: z.coerce.number().int() }),
    }, (req, res) => {
      res.end();
    });

    const doc = registry.generateOpenAPIDocument();

    expect(doc.paths['/users/{id}'].get?.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
    expect(parametersOf(doc, '/users/{id}')[0].schema).not.toHaveProperty('nullable');
  });

  it('documents coerced query and header parameters by their optionality, without nullable', () => {
    const { app, registry } = plus(express());
    app.get({
      path: '/items',
      query: z.object({
        page: z.coerce.number().int(),
        limit: z.coerce.number().optional(),
        size: z.coerce.number().default(20),
        archived: z.coerce.boolean().nullable(),
      }),
      headers: z.object({ 'x-page-size': z.coerce.number() }),
    }, (req, res) => {
      res.end();
    });

    const parameters = parametersOf(registry.generateOpenAPIDocument(), '/items');
    const byName = (name: string) => parameters.find((parameter) => parameter.name === name);

    expect(byName('page')).toMatchObject({ in: 'query', required: true, schema: { type: 'integer' } });
    expect(byName('page')?.schema).not.toHaveProperty('nullable');
    expect(byName('limit')).toMatchObject({ in: 'query', required: false });
    expect(byName('limit')?.schema).not.toHaveProperty('nullable');
    expect(byName('size')).toMatchObject({ in: 'query', required: false });
    expect(byName('x-page-size')).toMatchObject({ in: 'header', required: true });
    expect(byName('x-page-size')?.schema).not.toHaveProperty('nullable');
    // Not coerced at the top level (the coercion is inside .nullable()), so left as generated
    expect(byName('archived')?.schema).toMatchObject({ nullable: true });
  });

  it('documents coerced parameters of mounted routers', () => {
    const { app, registry } = plus(express());
    const { router } = plus();
    router.get({ path: '/items', query: z.object({ page: z.coerce.number() }) }, (req, res) => {
      res.end();
    });
    app.use('/api', router);

    const [page] = parametersOf(registry.generateOpenAPIDocument(), '/api/items');

    expect(page).toMatchObject({ name: 'page', in: 'query', required: true });
    expect(page.schema).not.toHaveProperty('nullable');
  });

  it('includes operation metadata', () => {
    const { app, registry } = plus(express());
    app.get({
      path: '/users',
      operationId: 'listUsers',
      summary: 'List users',
      description: 'Returns every user',
      tags: ['Users'],
      deprecated: true,
    }, (req, res) => {
      res.end();
    });

    const operation = registry.generateOpenAPIDocument().paths['/users'].get;

    expect(operation).toMatchObject({
      operationId: 'listUsers',
      summary: 'List users',
      description: 'Returns every user',
      tags: ['Users'],
      deprecated: true,
    });
  });

  it('documents the body schema as a JSON request body', () => {
    const { app, registry } = plus(express());
    app.post({
      path: '/users',
      body: z.object({
        name: z.string().openapi({ description: 'Display name', example: 'Ada' }),
        age: z.number().int().optional(),
      }),
    }, (req, res) => {
      res.end();
    });

    const requestBody = registry.generateOpenAPIDocument().paths['/users'].post?.requestBody;
    const content = requestBody && 'content' in requestBody ? requestBody.content : {};

    expect(content['application/json'].schema).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Display name', example: 'Ada' },
        age: { type: 'integer' },
      },
      required: ['name'],
    });
  });

  it('documents query and header parameters with their required flags', () => {
    const { app, registry } = plus(express());
    app.get({
      path: '/search',
      query: z.object({ q: z.string(), page: z.string().optional() }),
      headers: z.object({ 'x-api-version': z.string() }),
    }, (req, res) => {
      res.end();
    });

    const parameters = registry.generateOpenAPIDocument().paths['/search'].get?.parameters;

    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'q', in: 'query', required: true }),
      expect.objectContaining({ name: 'page', in: 'query', required: false }),
      expect.objectContaining({ name: 'x-api-version', in: 'header', required: true }),
    ]));
  });

  it('includes default query and header schemas in each route', () => {
    const { app, registry } = plus(express(), {
      defaultQuerySchema: z.object({ format: z.string().optional() }),
      defaultHeaderSchema: z.object({ 'x-request-id': z.string().optional() }),
    });
    app.get({ path: '/users' }, (req, res) => {
      res.end();
    });

    const parameters = registry.generateOpenAPIDocument().paths['/users'].get?.parameters;

    expect(parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'format', in: 'query' }),
      expect.objectContaining({ name: 'x-request-id', in: 'header' }),
    ]));
  });

  it('merges route responses over default responses', () => {
    const { app, registry } = plus(express());
    registry.setDefaultResponses({
      200: { description: 'Default success' },
      500: { description: 'Server error' },
    });
    app.get({
      path: '/users',
      responses: {
        200: {
          description: 'List of users',
          content: { 'application/json': { schema: z.array(z.object({ id: z.string() })) } },
        },
      },
    }, (req, res) => {
      res.end();
    });

    // Response objects as generated here, never $refs
    const responses = registry.generateOpenAPIDocument().paths['/users'].get?.responses as
      Record<string, { description: string; content: Record<string, { schema: unknown }> }>;

    expect(Object.keys(responses).sort()).toEqual(['200', '500']);
    expect(responses['200'].description).toBe('List of users');
    expect(responses['200'].content['application/json'].schema).toEqual({
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    });
    expect(responses['500'].description).toBe('Server error');
  });

  it('uses openApiConfig from plus() options and per-call overrides', () => {
    const { registry } = plus(express(), {
      openApiConfig: {
        openapi: '3.0.3',
        info: { title: 'Pets', version: '1.2.3' },
      },
    });

    expect(registry.generateOpenAPIDocument()).toMatchObject({
      openapi: '3.0.3',
      info: { title: 'Pets', version: '1.2.3' },
    });
    expect(registry.generateOpenAPIDocument({ info: { title: 'Override', version: '9.0.0' } }).info)
      .toEqual({ title: 'Override', version: '9.0.0' });
  });

  it('leaves out routes registered without an options object', () => {
    const { app, registry } = plus(express());
    app.get('/health', (req, res) => {
      res.end();
    });
    app.get({ path: '/users' }, (req, res) => {
      res.end();
    });

    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual(['/users']);
  });

  it('produces the same document when generated repeatedly', () => {
    const { app, registry } = plus(express());
    const { router } = plus();
    router.get({ path: '/list', summary: 'List' }, (req, res) => {
      res.end();
    });
    app.use('/users', router);

    const first = registry.generateOpenAPIDocument();
    const second = registry.generateOpenAPIDocument();

    expect(second).toEqual(first);
  });

  it("doesn't add to any registry when generated repeatedly", () => {
    const { app, registry } = plus(express());
    const { router, registry: routerRegistry } = plus();
    const { router: nested } = plus();
    nested.get({ path: '/deep' }, (req, res) => {
      res.end();
    });
    router.get({ path: '/list' }, (req, res) => {
      res.end();
    });
    router.use('/nested', nested);
    app.use('/users', router);

    const definitionCounts = () => [registry, routerRegistry].map((r) => r.getRawRegistry().definitions.length);
    const before = definitionCounts();
    for (let i = 0; i < 5; i++) {
      registry.generateOpenAPIDocument();
    }

    expect(definitionCounts()).toEqual(before);
    expect(Object.keys(registry.generateOpenAPIDocument().paths).sort()).toEqual(['/users/list', '/users/nested/deep']);
  });

  it('keeps documents of separate apps independent', () => {
    const one = plus(express());
    const two = plus(express());
    one.app.get({ path: '/one' }, (req, res) => {
      res.end();
    });
    two.app.get({ path: '/two' }, (req, res) => {
      res.end();
    });

    expect(Object.keys(one.registry.generateOpenAPIDocument().paths)).toEqual(['/one']);
    expect(Object.keys(two.registry.generateOpenAPIDocument().paths)).toEqual(['/two']);
  });

  it('documents every supported HTTP method', () => {
    const { app, registry } = plus(express());
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
    for (const method of methods) {
      app[method]({ path: '/resource' }, (req, res) => {
        res.end();
      });
    }

    const pathItem = registry.generateOpenAPIDocument().paths['/resource'];

    expect(Object.keys(pathItem).sort()).toEqual([...methods].sort());
  });
});

describe('components of mounted routers', () => {
  const bearer = { type: 'http', scheme: 'bearer' } as const;

  it("includes a mounted router's security schemes", () => {
    const { app, registry } = plus(express());
    const { router, registry: routerRegistry } = plus();
    routerRegistry.registerSecurityScheme('bearer', bearer);
    router.get({ path: '/me' }, (req, res) => {
      res.end();
    });
    app.use('/api', router);

    expect(registry.generateOpenAPIDocument().components?.securitySchemes).toEqual({ bearer });
  });

  it("includes schemas registered on a nested router's registry", () => {
    const { app, registry } = plus(express());
    const { router: parent } = plus();
    const { router: child, registry: childRegistry } = plus();
    childRegistry.getRawRegistry().register('User', z.object({ id: z.string() }));
    parent.use('/child', child);
    app.use('/api', parent);

    expect(registry.generateOpenAPIDocument().components?.schemas).toEqual({
      User: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    });
  });

  it('allows the same component to be defined identically by several registries', () => {
    const { app, registry } = plus(express());
    registry.registerSecurityScheme('bearer', bearer);
    const user = z.object({ id: z.string() });
    [plus(), plus()].forEach(({ router, registry: routerRegistry }, index) => {
      routerRegistry.registerSecurityScheme('bearer', { ...bearer });
      routerRegistry.getRawRegistry().register('User', user);
      app.use(`/v${index + 1}`, router);
    });

    const { components } = registry.generateOpenAPIDocument();

    expect(components?.securitySchemes).toEqual({ bearer });
    expect(Object.keys(components?.schemas ?? {})).toEqual(['User']);
  });

  it('throws when two registries define a component with the same name differently', () => {
    const { app, registry } = plus(express());
    registry.registerSecurityScheme('auth', bearer);
    const { router, registry: routerRegistry } = plus();
    routerRegistry.registerSecurityScheme('auth', { type: 'http', scheme: 'basic' });
    app.use('/api', router);

    expect(() => registry.generateOpenAPIDocument()).toThrow(
      'OpenAPI component "auth" (components.securitySchemes) is defined differently by two mounted registries'
    );
  });

  it('throws when routes in two routers reference different schemas with the same name', () => {
    const { app, registry } = plus(express());
    [z.string(), z.number()].forEach((id, index) => {
      const { router } = plus();
      router.post({ path: '/items', body: z.object({ id }).openapi('Item') }, (req, res) => {
        res.end();
      });
      app.use(`/v${index + 1}`, router);
    });

    expect(() => registry.generateOpenAPIDocument()).toThrow('OpenAPI component "Item" (components.schemas)');
  });
});
