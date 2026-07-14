import swaggerJSDoc from 'swagger-jsdoc';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Zevrae API',
      version: '1.0.0',
      description:
        'REST API for the Zevrae e-commerce backend: auth, users, categories, products, cart, orders, and reviews.',
    },
    servers: [
      {
        url: '/api',
        description: 'Current server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Something went wrong' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            subcategory: { type: 'string' },
            price: { type: 'integer', example: 8999 },
            compare_price: { type: 'integer', example: 11999 },
            images: { type: 'array', items: { type: 'string' } },
            sizes: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'inactive', 'draft', 'archived'] },
            is_deleted: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        ProductInput: {
          type: 'object',
          required: ['name', 'description', 'category', 'subcategory', 'price', 'compare_price', 'status'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            subcategory: { type: 'string' },
            price: { type: 'integer' },
            compare_price: { type: 'integer' },
            images: { type: 'array', items: { type: 'string' } },
            sizes: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'inactive', 'draft', 'archived'] },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['customer', 'admin'] },
            phone: { type: 'string' },
            is_active: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        RegisterInput: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', example: 'Jane Doe' },
            email: { type: 'string', format: 'email', example: 'jane@example.com' },
            password: { type: 'string', format: 'password', example: 'SuperSecret123' },
            phone: { type: 'string', example: '+91 98765 43210' },
          },
        },
        LoginInput: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            token: { type: 'string' },
            data: { $ref: '#/components/schemas/User' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            parent: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        CategoryInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            parent: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        CartItem: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            product: { type: 'string' },
            name: { type: 'string' },
            price: { type: 'integer' },
            size: { type: 'string' },
            quantity: { type: 'integer', example: 1 },
          },
        },
        Cart: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            user: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
            subtotal: { type: 'integer' },
          },
        },
        AddCartItemInput: {
          type: 'object',
          required: ['productId', 'quantity'],
          properties: {
            productId: { type: 'string' },
            size: { type: 'string' },
            quantity: { type: 'integer', example: 1 },
          },
        },
        ShippingAddress: {
          type: 'object',
          required: ['line1', 'city', 'postal_code', 'country'],
          properties: {
            line1: { type: 'string' },
            line2: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            postal_code: { type: 'string' },
            country: { type: 'string' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            user: { type: 'string' },
            items: { type: 'array', items: { $ref: '#/components/schemas/CartItem' } },
            shipping_address: { $ref: '#/components/schemas/ShippingAddress' },
            subtotal: { type: 'integer' },
            shipping_fee: { type: 'integer' },
            total: { type: 'integer' },
            payment_status: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'] },
            order_status: {
              type: 'string',
              enum: ['placed', 'processing', 'shipped', 'delivered', 'cancelled'],
            },
          },
        },
        CreateOrderInput: {
          type: 'object',
          required: ['shipping_address'],
          properties: {
            shipping_address: { $ref: '#/components/schemas/ShippingAddress' },
          },
        },
        Review: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            product: { type: 'string' },
            user: { type: 'string' },
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
        ReviewInput: {
          type: 'object',
          required: ['rating'],
          properties: {
            rating: { type: 'integer', minimum: 1, maximum: 5 },
            comment: { type: 'string' },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.js')],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
