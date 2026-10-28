import { describe, it, expect } from 'vitest';
import express, { NextFunction, Request, Response, Router } from 'express';
import request from 'supertest';
import { plus, z } from './index';

describe('route registration', () => {
  it('accepts a path followed by an options object', async () => {
    const { app, registry } = plus(express());
    app.get('/users/:id', {
      params: z.object({ id: z.coerce.number() }),
      summary: 'Get user',
    }, (req, res) => {
      res.json({ id: req.parsed.params.id });
    });

    const response = await request(app).get('/users/3');

    expect(response.body).toEqual({ id: 3 });
    expect(registry.generateOpenAPIDocument().paths['/users/{id}'].get.summary).toBe('Get user');
  });

  it('throws when an options object has no path', () => {
    const { app } = plus(express());

    expect(() => {
      app.get({ summary: 'No path' }, (req, res) => {
        res.end();
      });
    }).toThrow('Path is required when using options as first argument for get');
  });

  it('runs every handler after the options object in order', async () => {
    const { app } = plus(express());
    const calls: string[] = [];
    app.get({ path: '/chain' }, (req, res, next) => {
      calls.push('first');
      next();
    }, (req, res) => {
      calls.push('second');
      res.json(calls);
    });

    const response = await request(app).get('/chain');

    expect(response.body).toEqual(['first', 'second']);
  });

  it('passes plain Express calls through unchanged', async () => {
    const { app } = plus(express());
    const middleware = (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('x-middleware', 'ran');
      next();
    };
    app.get('/plain', middleware, (req, res) => {
      res.send('ok');
    });
    app.get(/^\/regex\/\d+$/, (req, res) => {
      res.send('regex');
    });

    const plain = await request(app).get('/plain');
    const regex = await request(app).get('/regex/12');

    expect(plain.text).toBe('ok');
    expect(plain.headers['x-middleware']).toBe('ran');
    expect(regex.text).toBe('regex');
  });

  it('still reads app settings with app.get(name)', () => {
    const { app } = plus(express());
    app.set('title', 'My API');

    expect(app.get('title')).toBe('My API');
  });

  it('serves requests for every supported HTTP method', async () => {
    const { app } = plus(express());
    app.get({ path: '/r' }, (req, res) => {
      res.send('get');
    });
    app.post({ path: '/r' }, (req, res) => {
      res.send('post');
    });
    app.put({ path: '/r' }, (req, res) => {
      res.send('put');
    });
    app.patch({ path: '/r' }, (req, res) => {
      res.send('patch');
    });
    app.delete({ path: '/r' }, (req, res) => {
      res.send('delete');
    });
    app.options({ path: '/r' }, (req, res) => {
      res.send('options');
    });
    // Separate path: Express answers HEAD with a GET route registered earlier for the same path
    app.head({ path: '/h' }, (req, res) => {
      res.setHeader('x-method', 'head');
      res.end();
    });

    expect((await request(app).get('/r')).text).toBe('get');
    expect((await request(app).post('/r')).text).toBe('post');
    expect((await request(app).put('/r')).text).toBe('put');
    expect((await request(app).patch('/r')).text).toBe('patch');
    expect((await request(app).delete('/r')).text).toBe('delete');
    expect((await request(app).options('/r')).text).toBe('options');
    expect((await request(app).head('/h')).headers['x-method']).toBe('head');
  });
});

describe('router mounting', () => {
  /**
   * Creates an enhanced router with one documented GET route
   */
  function routerWith(path: string, summary: string) {
    const { router } = plus();
    router.get({ path, summary }, (req, res) => {
      res.send(summary);
    });
    return router;
  }

  it('documents a router mounted without a path at the root', async () => {
    const { app, registry } = plus(express());
    app.use(routerWith('/health', 'Health'));

    expect((await request(app).get('/health')).text).toBe('Health');
    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual(['/health']);
  });

  it.each([
    ['api', '/api/users'],
    ['/api/', '/api/users'],
    ['/api/v1', '/api/v1/users'],
  ])('normalizes the mount path %j', (mountPath, documentedPath) => {
    const { app, registry } = plus(express());
    app.use(mountPath, routerWith('/users', 'Users'));

    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual([documentedPath]);
  });

  it('documents a router mounted at two paths under both', async () => {
    const { app, registry } = plus(express());
    const router = routerWith('/users', 'Users');
    app.use('/v1', router);
    app.use('/v2', router);

    expect((await request(app).get('/v2/users')).text).toBe('Users');
    expect(Object.keys(registry.generateOpenAPIDocument().paths).sort()).toEqual(['/v1/users', '/v2/users']);
  });

  it('documents both app routes and mounted router routes', () => {
    const { app, registry } = plus(express());
    app.get({ path: '/status' }, (req, res) => {
      res.end();
    });
    app.use('/api', routerWith('/users', 'Users'));

    expect(Object.keys(registry.generateOpenAPIDocument().paths).sort()).toEqual(['/api/users', '/status']);
  });

  it('includes path parameters from the router route in the documented path', () => {
    const { app, registry } = plus(express());
    const { router } = plus();
    router.get({ path: '/:id', params: z.object({ id: z.string() }) }, (req, res) => {
      res.end();
    });
    app.use('/users', router);

    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual(['/users/{id}']);
  });

  it('serves a plain Express router without documenting it', async () => {
    const { app, registry } = plus(express());
    const plainRouter = Router();
    plainRouter.get('/plain', (req, res) => {
      res.send('plain');
    });
    app.use('/legacy', plainRouter);

    expect((await request(app).get('/legacy/plain')).text).toBe('plain');
    expect(registry.generateOpenAPIDocument().paths).toEqual({});
  });

  it("limits a router's own document to its own routes", () => {
    const { router: parent, registry: parentRegistry } = plus();
    parent.get({ path: '/own' }, (req, res) => {
      res.end();
    });
    parent.use('/child', routerWith('/nested', 'Nested'));

    expect(Object.keys(parentRegistry.generateOpenAPIDocument().paths)).toEqual(['/own']);
  });

  it('documents a router passed after other middleware in the same use() call', async () => {
    const { app, registry } = plus(express());
    const requireAuth = (req: Request, res: Response, next: NextFunction) => next();
    app.use('/api', requireAuth, routerWith('/users', 'Users'));

    expect((await request(app).get('/api/users')).text).toBe('Users');
    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual(['/api/users']);
  });

  it('documents a router passed after other middleware without a path', () => {
    const { app, registry } = plus(express());
    app.use((req: Request, res: Response, next: NextFunction) => next(), routerWith('/users', 'Users'));

    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual(['/users']);
  });

  it('documents routers passed in arrays', async () => {
    const { app, registry } = plus(express());
    app.use('/api', [routerWith('/users', 'Users'), [routerWith('/teams', 'Teams')]]);
    app.use([routerWith('/health', 'Health')]);

    expect((await request(app).get('/api/teams')).text).toBe('Teams');
    expect(Object.keys(registry.generateOpenAPIDocument().paths).sort()).toEqual(['/api/teams', '/api/users', '/health']);
  });

  it('documents a router mounted at an array of paths under each', async () => {
    const { app, registry } = plus(express());
    app.use(['/v1', '/v2'], routerWith('/users', 'Users'));

    expect((await request(app).get('/v2/users')).text).toBe('Users');
    expect(Object.keys(registry.generateOpenAPIDocument().paths).sort()).toEqual(['/v1/users', '/v2/users']);
  });

  it('documents routers passed to a nested router after other middleware', () => {
    const { app, registry } = plus(express());
    const { router: parent } = plus();
    parent.use('/child', (req: Request, res: Response, next: NextFunction) => next(), routerWith('/nested', 'Nested'));
    app.use('/api', parent);

    expect(Object.keys(registry.generateOpenAPIDocument().paths)).toEqual(['/api/child/nested']);
  });
});
