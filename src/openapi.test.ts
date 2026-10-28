import { describe, it, expect } from 'vitest';
import express from 'express';
import { plus, z } from './index';

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
    expect(doc.paths['/users/{userId}/posts/{postId}'].get.parameters).toEqual([
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

    expect(doc.paths['/users/{id}'].get.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true }),
    ]);
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

    const operation = registry.generateOpenAPIDocument().paths['/users'].post;

    expect(operation.requestBody.content['application/json'].schema).toEqual({
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

    const parameters = registry.generateOpenAPIDocument().paths['/search'].get.parameters;

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

    const parameters = registry.generateOpenAPIDocument().paths['/users'].get.parameters;

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

    const responses = registry.generateOpenAPIDocument().paths['/users'].get.responses;

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
