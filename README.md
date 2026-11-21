# Baymax Backend

AI-powered website creation, redesign, hosting, and management platform - Backend API

## Tech Stack

- **Framework**: Fastify 4.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **API Documentation**: Swagger/OpenAPI

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Supabase account

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd baymax-
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations:
```bash
npm run db:migrate
```

5. Start the development server:
```bash
npm run dev
```

The API will be available at `http://localhost:3000`
API documentation at `http://localhost:3000/docs`

## Project Structure

```
src/
├── config/          # Configuration management
├── db/              # Database connection and migrations
│   ├── migrations/  # SQL migration files
│   └── index.ts     # Database pool and query helpers
├── middleware/      # Express/Fastify middleware
│   ├── auth.ts      # Authentication middleware
│   └── error.ts     # Error handling
├── routes/          # API route handlers
│   ├── projects.ts
│   ├── templates.ts
│   └── blueprints.ts
├── types/           # TypeScript type definitions
├── jobs/            # Background job processors (future)
├── services/        # Business logic services (future)
├── utils/           # Utility functions (future)
└── server.ts        # Main server entry point
```

## API Documentation

Once the server is running, visit `http://localhost:3000/docs` for interactive API documentation powered by Swagger UI.

## Development

### Running in Development Mode
```bash
npm run dev
```

### Building for Production
```bash
npm run build
npm start
```

### Running Tests
```bash
npm test
```

### Database Migrations
```bash
# Run all pending migrations
npm run db:migrate
```

## Environment Variables

See `.env.example` for all required environment variables.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `JWT_SECRET` - JWT signing secret (min 32 characters)

## Contributing

1. Create a feature branch
2. Make your changes
3. Add tests
4. Submit a pull request

## License

MIT
