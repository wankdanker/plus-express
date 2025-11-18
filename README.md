# PlusExpress

PlusExpress is a powerful library that enhances Express.js with:

1. **Type-safe validation** - Validate requests using Zod schemas
2. **Automatic OpenAPI documentation** - Generate OpenAPI/Swagger docs from your routes
3. **Enhanced route definitions** - Cleaner, more intuitive API for defining routes

## Installation

```bash
npm install plus-express
```

PlusExpress has `express` as a peer dependency, so make sure you have it installed:

```bash
npm install express
```

## Quick Start

```typescript
import express from 'express';
import { plus, z } from 'plus-express';

// Initialize PlusExpress with an existing Express app
const { app, registry } = plus(express());

// Configure the registry using the builder pattern
registry
  .setInfo({
    title: 'My API',
    version: '1.0.0',
    description: 'My awesome API'
  })
  .addServer({
    url: 'http://localhost:3000',
    description: 'Development server'
  })
  .registerSecurityScheme('ApiKeyAuth', {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-KEY'
  });

// Define routes with validation
app.get({
  path: '/users/:id',
  summary: 'Get a user by ID',
  params: z.object({
    id: z.string().uuid()
  }),
  responses: {
    200: {
      description: 'User retrieved successfully',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string().uuid(),
            name: z.string(),
            email: z.string().email()
          })
        }
      }
    }
  }
}, (req, res) => {
  // TypeScript knows that req.parsed.params.id is a valid UUID string
  const userId = req.parsed.params.id;
  
  // Your route handler logic
  res.json({ id: userId, name: 'John Doe', email: 'john@example.com' });
});

// Generate OpenAPI documentation
app.get('/api-docs.json', (req, res) => {
  res.json(registry.generateOpenAPIDocument());
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Features

### Builder Pattern for Configuration

PlusExpress uses a fluent builder pattern for configuration:

```typescript
// Get the registry from plus
const { app, registry } = plus(express());

// Configure using chainable methods
registry
  .setInfo({
    title: 'My API',
    version: '1.0.0',
    description: 'My awesome API'
  })
  .addServer({
    url: 'http://localhost:3000',
    description: 'Development server'
  })
  .addServer({
    url: 'https://api.example.com',
    description: 'Production server'
  })
  .setDefaultQuerySchema(z.object({
    format: z.enum(['json', 'xml']).optional()
  }))
  .setDefaultHeaderSchema(z.object({
    'x-api-key': z.string().optional()
  }))
  .setDefaultResponses({
    400: {
      description: 'Bad Request',
      content: {
        'application/json': {
          schema: z.object({
            message: z.string(),
            errors: z.array(z.string())
          })
        }
      }
    }
  })
  .registerSecurityScheme('ApiKeyAuth', {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-KEY'
  });
```

### Enhanced Routes with Type Safety

PlusExpress extends Express's route methods with additional signatures that support validation and documentation:

```typescript
// Standard Express route definition
app.get('/users', (req, res) => { /* ... */ });

// PlusExpress route with validation and docs
app.get({
  path: '/users',
  summary: 'Get all users',
  query: z.object({
    limit: z.number().optional(),
    offset: z.number().optional()
  })
}, (req, res) => {
  // TypeScript knows req.parsed.query.limit is a number or undefined
  const { limit, offset } = req.parsed.query;
  
  // Your route handler logic
});

// Alternative syntax with path as first argument
app.get('/users/:id', {
  summary: 'Get a user by ID',
  params: z.object({
    id: z.string()
  })
}, (req, res) => {
  // TypeScript knows req.parsed.params.id is a string
  const userId = req.parsed.params.id;
  
  // Your route handler logic
});
```

### Automatic Request Validation

PlusExpress automatically validates incoming requests against your Zod schemas:

```typescript
app.post({
  path: '/users',
  summary: 'Create a new user',
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    age: z.number().min(18)
  })
}, (req, res) => {
  // req.parsed.body is guaranteed to match the schema
  // If validation fails, an error response is automatically sent

  const { name, email, age } = req.parsed.body;
  
  // Your route handler logic
  res.json({ id: '123', name, email, age });
});
```

### Accessing Validated Data with req.parsed

PlusExpress adds a `parsed` namespace to the request object that contains all validated data:

```typescript
app.get({
  path: '/users/:id',
  params: z.object({ id: z.string().uuid() }),
  query: z.object({ details: z.boolean().optional() }),
  headers: z.object({ 'x-api-key': z.string() })
}, (req, res) => {
  // Access validated data through the parsed namespace
  const { id } = req.parsed.params;       // Typed as string & UUID
  const { details } = req.parsed.query;   // Typed as boolean | undefined
  const apiKey = req.parsed.headers['x-api-key']; // Typed as string
  
  // Your route handler logic
});
```

This keeps all validated data organized in a single namespace while maintaining compatibility with the original Express properties (`req.body`, `req.params`, etc.).

### Enhanced Routers

PlusExpress provides a unified `plus()` function that works for both apps and routers:

```typescript
import { plus } from 'plus-express';

// Create a new enhanced router (plus() with no arguments)
const { router, registry } = plus();

// Configure the router's registry
registry.setInfo({
  title: 'User API',
  version: '1.0.0'
});

// Use the enhanced router like the app
router.get({
  path: '/products',
  summary: 'Get all products',
  query: z.object({
    category: z.string().optional()
  })
}, (req, res) => {
  // Your handler logic
});

// Add the router to your app
app.use('/api', router);
```

## Composing Routers

PlusExpress automatically handles router composition, correctly combining OpenAPI specifications from multiple routers and respecting mount paths:

```typescript
// Create multiple routers using the unified plus() function
const { router: usersRouter } = plus();
const { router: productsRouter } = plus();
const { router: adminRouter } = plus();

// Define routes on each router
usersRouter.get('/profile', /* ... */);
productsRouter.get('/catalog', /* ... */);
adminRouter.get('/stats', /* ... */);

// Compose routers with nesting
usersRouter.use('/admin', adminRouter);  // Nested router

// Mount routers at different paths
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/products', productsRouter);

// The OpenAPI documentation will automatically include all routes
// with correct paths:
// - /api/v1/users/profile
// - /api/v1/users/admin/stats
// - /api/v1/products/catalog
```

### How Router Composition Works

PlusExpress uses a smart tracking system to handle router composition:

1. Each `RouterPlus` instance is marked with its registry
2. When a router is mounted (via `app.use()` or `router.use()`), the mount path is registered
3. When generating OpenAPI documentation, all registries are combined
4. Paths are automatically adjusted to include the mount paths

This works with any level of nesting, allowing you to organize your API however you prefer while maintaining correct documentation.

## OpenAPI Documentation

PlusExpress automatically generates OpenAPI documentation based on your route definitions and registry configuration:

```typescript
// Serve OpenAPI documentation
app.get('/api-docs.json', (req, res) => {
  res.json(registry.generateOpenAPIDocument());
});

// Optional: Serve Swagger UI (requires swagger-ui-express)
import swaggerUi from 'swagger-ui-express';

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerUrl: '/api-docs.json'
}));
```

## API Reference

### plus()

The unified `plus()` function works with both Express applications and routers. It automatically detects the type and applies the appropriate enhancements:

```typescript
// Enhance an Express application
const { app, registry } = plus(express());

// Create a new enhanced router
const { router, registry } = plus();

// Enhance an existing router
const existingRouter = express.Router();
const { router, registry } = plus(existingRouter);
```

For those who prefer explicit naming, `plusRouter()` is also available as an alias:

```typescript
import { plusRouter } from 'plus-express';
const { router, registry } = plusRouter();
```

### Registry Methods

The registry provides these chainable configuration methods:

- `setInfo(info)` - Set API title, version, and description
- `addServer(server)` - Add a server to the OpenAPI document
- `setDefaultQuerySchema(schema)` - Set default query schema for all routes
- `setDefaultHeaderSchema(schema)` - Set default header schema for all routes
- `setDefaultResponses(responses)` - Set default responses for all routes
- `registerSecurityScheme(name, scheme)` - Add a security scheme
- `generateOpenAPIDocument(config?)` - Generate the OpenAPI document
- `getRawRegistry()` - Get the underlying OpenAPI registry

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT