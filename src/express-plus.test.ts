import { describe, it, expect, beforeEach } from 'vitest';
import express, { Application, Router } from 'express';
import request from 'supertest';
import { plus } from './index';
import { z } from 'zod';

describe('plus', () => {
  let app: Application;
  let registry: any;

  beforeEach(() => {
    const result = plus(express());
    app = result.app;
    registry = result.registry;
  });

  describe('Request Validation', () => {
    it('should validate query parameters', async () => {
      app.get({
        path: '/users',
        query: z.object({
          limit: z.coerce.number().min(1).max(100)
        })
      }, (req, res) => {
        res.json({ limit: req.parsed.query.limit });
      });

      const response = await request(app).get('/users?limit=10');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ limit: 10 });
    });

    it('should reject invalid query parameters', async () => {
      app.get({
        path: '/users',
        query: z.object({
          limit: z.coerce.number().min(1).max(100)
        })
      }, (req, res) => {
        res.json({ limit: req.parsed.query.limit });
      });

      // Invalid - exceeds max
      const response = await request(app).get('/users?limit=200');
      expect(response.status).toBe(400);
    });

    it('should validate request body', async () => {
      app.use(express.json());

      app.post({
        path: '/users',
        body: z.object({
          name: z.string().min(2),
          email: z.string().email()
        })
      }, (req, res) => {
        res.json(req.parsed.body);
      });

      const response = await request(app)
        .post('/users')
        .send({ name: 'John Doe', email: 'john@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ name: 'John Doe', email: 'john@example.com' });
    });

    it('should reject invalid request body', async () => {
      app.use(express.json());

      app.post({
        path: '/users',
        body: z.object({
          name: z.string().min(2),
          email: z.string().email()
        })
      }, (req, res) => {
        res.json(req.parsed.body);
      });

      const response = await request(app)
        .post('/users')
        .send({ name: 'J', email: 'invalid-email' });

      expect(response.status).toBe(400);
    });

    it('should validate path parameters', async () => {
      app.get('/users/:id', {
        params: z.object({
          id: z.string().uuid()
        })
      }, (req, res) => {
        res.json({ id: req.parsed.params.id });
      });

      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const response = await request(app).get(`/users/${validUuid}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ id: validUuid });
    });

    it('should reject invalid path parameters', async () => {
      app.get('/users/:id', {
        params: z.object({
          id: z.string().uuid()
        })
      }, (req, res) => {
        res.json({ id: req.parsed.params.id });
      });

      const response = await request(app).get('/users/not-a-uuid');
      expect(response.status).toBe(400);
    });

    it('should validate headers', async () => {
      app.get({
        path: '/users',
        headers: z.object({
          'x-api-key': z.string().min(10)
        })
      }, (req, res) => {
        res.json({ apiKey: req.parsed.headers['x-api-key'] });
      });

      const response = await request(app)
        .get('/users')
        .set('x-api-key', 'valid-api-key-12345');

      expect(response.status).toBe(200);
      expect(response.body.apiKey).toBe('valid-api-key-12345');
    });
  });

  describe('Unified API', () => {
    it('should work with Express app', () => {
      const expressApp = express();
      const result = plus(expressApp);

      expect(result).toHaveProperty('app');
      expect(result).toHaveProperty('registry');
      expect(result.app).toBe(expressApp);
    });

    it('should create new router when called with no arguments', () => {
      const result = plus();

      expect(result).toHaveProperty('router');
      expect(result).toHaveProperty('registry');
      expect(result.router).toBeDefined();
    });

    it('should work with existing Express router', () => {
      const expressRouter = Router();
      const result = plus(expressRouter);

      expect(result).toHaveProperty('router');
      expect(result).toHaveProperty('registry');
      expect(result.router).toBe(expressRouter);
    });
  });

  describe('Router Mounting', () => {
    it('should mount routers at specified paths', async () => {
      const { router: usersRouter } = plus();

      usersRouter.get({
        path: '/list',
        summary: 'Get users'
      }, (req, res) => {
        res.json({ users: [] });
      });

      app.use('/api/users', usersRouter);

      const response = await request(app).get('/api/users/list');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ users: [] });
    });

    it('should handle nested routers', async () => {
      const { router: usersRouter } = plus();
      const { router: adminRouter } = plus();

      adminRouter.get({
        path: '/stats',
        summary: 'Get stats'
      }, (req, res) => {
        res.json({ stats: 'admin stats' });
      });

      usersRouter.use('/admin', adminRouter);
      app.use('/api', usersRouter);

      const response = await request(app).get('/api/admin/stats');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ stats: 'admin stats' });
    });
  });

  describe('OpenAPI Documentation', () => {
    it('should generate OpenAPI document with route definitions', () => {
      app.get({
        path: '/users',
        summary: 'Get all users',
        tags: ['Users'],
        query: z.object({
          limit: z.coerce.number()
        })
      }, (req, res) => {
        res.json([]);
      });

      const doc = registry.generateOpenAPIDocument();

      expect(doc).toHaveProperty('openapi');
      expect(doc).toHaveProperty('paths');
      expect(doc.paths).toHaveProperty('/users');
      expect(doc.paths['/users']).toHaveProperty('get');
      expect(doc.paths['/users'].get.summary).toBe('Get all users');
    });

    it('should include mounted router paths in OpenAPI document', () => {
      const { router: usersRouter } = plus();

      usersRouter.get({
        path: '/list',
        summary: 'List users',
        tags: ['Users']
      }, (req, res) => {
        res.json([]);
      });

      app.use('/api/v1/users', usersRouter);

      const doc = registry.generateOpenAPIDocument();

      expect(doc.paths).toBeDefined();
      expect(doc.paths['/api/v1/users/list']).toBeDefined();
      expect(doc.paths['/api/v1/users/list'].get).toBeDefined();
      expect(doc.paths['/api/v1/users/list'].get.summary).toBe('List users');
    });

    it('should configure OpenAPI info', () => {
      registry.setInfo({
        title: 'Test API',
        version: '2.0.0',
        description: 'A test API'
      });

      const doc = registry.generateOpenAPIDocument();

      expect(doc.info.title).toBe('Test API');
      expect(doc.info.version).toBe('2.0.0');
      expect(doc.info.description).toBe('A test API');
    });

    it('should add servers to OpenAPI document', () => {
      registry
        .addServer({ url: 'http://localhost:3000', description: 'Dev' })
        .addServer({ url: 'https://api.example.com', description: 'Prod' });

      const doc = registry.generateOpenAPIDocument();

      expect(doc.servers).toHaveLength(2);
      expect(doc.servers[0].url).toBe('http://localhost:3000');
      expect(doc.servers[1].url).toBe('https://api.example.com');
    });

    it('should register security schemes', () => {
      registry.registerSecurityScheme('ApiKeyAuth', {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-KEY'
      });

      const doc = registry.generateOpenAPIDocument();

      expect(doc.components).toHaveProperty('securitySchemes');
      expect(doc.components.securitySchemes).toHaveProperty('ApiKeyAuth');
      expect(doc.components.securitySchemes.ApiKeyAuth.type).toBe('apiKey');
    });
  });

  describe('Default Schemas', () => {
    it('should apply default query schema to all routes', async () => {
      registry.setDefaultQuerySchema(
        z.object({
          format: z.enum(['json', 'xml']).default('json')
        })
      );

      app.get({
        path: '/users'
      }, (req, res) => {
        res.json({ format: req.parsed.query.format });
      });

      const response = await request(app).get('/users');
      expect(response.status).toBe(200);
      expect(response.body.format).toBe('json');
    });

    it('should merge route-specific query schema with default', async () => {
      registry.setDefaultQuerySchema(
        z.object({
          format: z.enum(['json', 'xml']).default('json')
        })
      );

      app.get({
        path: '/users',
        query: z.object({
          limit: z.coerce.number().default(10)
        })
      }, (req, res) => {
        res.json({
          format: req.parsed.query.format,
          limit: req.parsed.query.limit
        });
      });

      const response = await request(app).get('/users');
      expect(response.status).toBe(200);
      expect(response.body.format).toBe('json');
      expect(response.body.limit).toBe(10);
    });
  });

  describe('HTTP Methods', () => {
    beforeEach(() => {
      app.use(express.json());
    });

    it('should support GET requests', async () => {
      app.get({ path: '/test' }, (req, res) => res.json({ method: 'GET' }));
      const response = await request(app).get('/test');
      expect(response.status).toBe(200);
      expect(response.body.method).toBe('GET');
    });

    it('should support POST requests', async () => {
      app.post({ path: '/test' }, (req, res) => res.json({ method: 'POST' }));
      const response = await request(app).post('/test');
      expect(response.status).toBe(200);
      expect(response.body.method).toBe('POST');
    });

    it('should support PUT requests', async () => {
      app.put({ path: '/test' }, (req, res) => res.json({ method: 'PUT' }));
      const response = await request(app).put('/test');
      expect(response.status).toBe(200);
      expect(response.body.method).toBe('PUT');
    });

    it('should support DELETE requests', async () => {
      app.delete({ path: '/test' }, (req, res) => res.json({ method: 'DELETE' }));
      const response = await request(app).delete('/test');
      expect(response.status).toBe(200);
      expect(response.body.method).toBe('DELETE');
    });

    it('should support PATCH requests', async () => {
      app.patch({ path: '/test' }, (req, res) => res.json({ method: 'PATCH' }));
      const response = await request(app).patch('/test');
      expect(response.status).toBe(200);
      expect(response.body.method).toBe('PATCH');
    });
  });
});
