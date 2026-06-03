import { JwtPayload } from 'jsonwebtoken';

export interface AuthJwtPayload extends JwtPayload {
  user_id: string;
  username: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface InvJwtPayload extends JwtPayload {
  userId?: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface UserSession {
  user_id: string;
  username: string;
  email: string;
  role: string;
  start_date_utc: string | null;
  end_date_utc: string;
  end_date_is_default: boolean;
}

export interface CreateUserRequest {
  username: string;
  email: string;
  role_name: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateUserRequest {
  username?: string;
  email?: string;
  role_name?: string;
  password?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role_name: string;
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithRole {
  id: string;
  username: string;
  email: string;
  password: string;
  password_hash?: string;
  employee_name?: string;
  name?: string;
  role_name: string;
  all_roles?: string[];
  is_active?: boolean;
  email_verified?: boolean;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}
