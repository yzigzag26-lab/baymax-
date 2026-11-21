import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, getUserById } from '../services/auth.service';

export interface AuthUser {
  id: string;
  email: string;
  is_verified: boolean;
  has_password: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Authentication middleware - verifies JWT token and loads user
 */
export const authMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Load user from database
    const user = await getUserById(decoded.userId);
    
    if (!user) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'User not found',
      });
    }

    // Check if user is verified
    if (!user.is_verified) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Email not verified',
      });
    }

    request.user = user;
  } catch (error) {
    request.log.error('Auth middleware error:', error);
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuthMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return; // Continue without user
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (decoded) {
      const user = await getUserById(decoded.userId);
      if (user && user.is_verified) {
        request.user = user;
      }
    }
  } catch (error) {
    request.log.error('Optional auth middleware error:', error);
    // Continue without user on error
  }
};
