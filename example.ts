import express from 'express';
import { plus, z } from '.'; // In real usage, this would be 'plus-express'

// Configuration
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize PlusExpress with an Express app using the unified plus() function
const { app, registry } = plus(express());

// Enable JSON body parsing
app.use(express.json());

// Configure the registry using the builder pattern
registry
  .setInfo({
    title: 'Example API',
    version: '1.0.0',
    description: 'An example API built with PlusExpress'
  })
  .addServer({
    url: `http://localhost:${PORT}`,
    description: 'Development server'
  })
  .addServer({
    url: 'https://api.example.com',
    description: 'Production server'
  })
  .setDefaultQuerySchema(z.object({
    format: z.enum(['json', 'text']).optional()
  }))
  .setDefaultHeaderSchema(z.object({
    'x-request-id': z.string().optional()
  }))
  .setDefaultResponses({
    400: {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: z.object({
            status: z.number(),
            message: z.string(),
            errors: z.array(z.any()).optional()
          })
        }
      }
    },
    500: {
      description: 'Internal Server Error'
    }
  })
  .registerSecurityScheme('ApiKeyAuth', {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-KEY'
  })
  .registerSecurityScheme('BearerAuth', {
    type: 'http',
    scheme: 'bearer'
  });

// Define a User schema for reuse
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().min(18)
});

// Create a Users router using the unified plus() function
const { router: usersRouter, registry: usersRegistry } = plus();

// Configure the users router registry
usersRegistry
  .setInfo({
    title: 'Users API',
    version: '1.0.0'
  });

// GET /users
usersRouter.get({
  path: '/users',
  summary: 'Get all users',
  description: 'Retrieve a list of all users with optional filtering',
  tags: ['Users'],
  query: z.object({
    limit: z.coerce.number().optional(),
    offset: z.coerce.number().optional(),
    search: z.string().optional()
  }),
  responses: {
    200: {
      description: 'Users retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            total: z.number(),
            users: z.array(UserSchema)
          })
        }
      }
    }
  }
}, (req, res) => {
  // Using the new req.parsed namespace
  const { limit = 10, offset = 0, search } = req.parsed.query;

  console.log('Using validated query params from req.parsed:', req.parsed.query);

  // Mock data for example
  const users = [
    { id: '123e4567-e89b-12d3-a456-426614174000', name: 'John Doe', email: 'john@example.com', age: 28 },
    { id: '223e4567-e89b-12d3-a456-426614174000', name: 'Jane Smith', email: 'jane@example.com', age: 32 }
  ];

  res.json({ total: users.length, users });
});

// GET /users/:id
usersRouter.get('/users/:id', {
  summary: 'Get a user by ID',
  description: 'Retrieve a specific user by their unique identifier',
  tags: ['Users'],
  params: z.object({
    id: z.string().uuid()
  }),
  responses: {
    200: {
      description: 'User retrieved successfully',
      content: {
        'application/json': {
          schema: UserSchema
        }
      }
    },
    404: {
      description: 'User not found'
    }
  }
}, (req, res) => {
  // Using the new req.parsed namespace
  const { id } = req.parsed.params;
  console.log('Using validated path params from req.parsed:', req.parsed.params);

  // Mock user data
  const user = {
    id,
    name: 'John Doe',
    email: 'john@example.com',
    age: 28
  };

  res.json(user);
});

// POST /users
usersRouter.post({
  path: '/users',
  summary: 'Create a new user',
  description: 'Create a new user with the provided information',
  tags: ['Users'],
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    age: z.number().min(18)
  }),
  responses: {
    201: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: UserSchema
        }
      }
    }
  }
}, (req, res) => {
  // Using the new req.parsed namespace
  const { name, email, age } = req.parsed.body;
  console.log('Using validated request body from req.parsed:', req.parsed.body);

  // Create user logic (mock)
  const id = '123e4567-e89b-12d3-a456-426614174000';

  res.status(201).json({ id, name, email, age });
});

// Create a Products router using the unified plus() function
const { router: productsRouter, registry: productsRegistry } = plus();

// Configure the products router registry
productsRegistry
  .setInfo({
    title: 'Products API',
    version: '1.0.0'
  });

// GET /products
productsRouter.get({
  path: '/products',
  summary: 'Get all products',
  tags: ['Products'],
  query: z.object({
    category: z.string().optional()
  }),
  responses: {
    200: {
      description: 'Products retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            products: z.array(z.object({
              id: z.string(),
              name: z.string(),
              price: z.number()
            }))
          })
        }
      }
    }
  }
}, (req, res) => {
  // Using the new req.parsed namespace
  const { category } = req.parsed.query;

  // Mock product data
  const products = [
    { id: 'p1', name: 'Product 1', price: 99.99 },
    { id: 'p2', name: 'Product 2', price: 149.99 }
  ];

  res.json({ products });
});

// Create a nested router to demonstrate composition using the unified plus() function
const { router: adminRouter, registry: adminRegistry } = plus();

// Configure the admin router registry
adminRegistry
  .setInfo({
    title: 'Admin API',
    version: '1.0.0'
  });

// Add a route to the admin router
adminRouter.get({
  path: '/stats',
  summary: 'Get admin statistics',
  tags: ['Admin'],
  responses: {
    200: {
      description: 'Statistics retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            userCount: z.number(),
            productCount: z.number(),
            lastUpdated: z.string()
          })
        }
      }
    }
  }
}, (req, res) => {
  res.json({
    userCount: 150,
    productCount: 300,
    lastUpdated: new Date().toISOString()
  });
});

// Demonstrate nested routers
usersRouter.use('/admin', adminRouter);

// Mount routers at different paths to demonstrate proper path handling
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/products', productsRouter);

// Serve OpenAPI documentation
app.get('/api-docs.json', (req, res) => {
  // Generate the OpenAPI document with all mounted routers
  const document = registry.generateOpenAPIDocument();
  res.json(document);
});

// Debug route to see registered paths
app.get('/api-debug', (req, res) => {
  // Generate the complete OpenAPI document
  const openApiDoc = registry.generateOpenAPIDocument();

  // Get all registered routes from the OpenAPI document
  const registeredRoutes = Object.entries(openApiDoc.paths || {}).flatMap(([path, methods]: [string, any]) =>
    Object.keys(methods).map(method => ({
      path,
      method: method.toUpperCase(),
      summary: methods[method]?.summary || '',
      tags: methods[method]?.tags || []
    }))
  );

  res.json({
    totalRoutes: registeredRoutes.length,
    routes: registeredRoutes,
    openApiVersion: openApiDoc.openapi,
    apiInfo: openApiDoc.info
  });
});

app.get('/status', {
  operationId: 'getStatus',
  summary: 'Get server status',
  description: 'Check if the server is running',
  tags: ['Health']
}, async (req, res) => {
  res.json({ status: 'OK' });
})

app.get('/swagger', (req, res) => {
  res.contentType('text/html');
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body {
      margin: 0;
      /* font-family: Arial, sans-serif; */
      /* background-color: #f4f4f4; */
    }
    /* #swagger-ui {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    } */
    /* .topbar-wrapper {
      display: none;
    } */
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',  // Your OpenAPI spec JSON path
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
`)
})

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    status,
    message,
    errors: err.errors
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api-docs.json`);
  console.log(`API Documentation (Swagger): http://localhost:${PORT}/swagger`);
});